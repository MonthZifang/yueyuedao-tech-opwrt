#!/usr/bin/lua
------------------------------------------------------------
-- 月月岛科技 · yueyue-monitor
-- 按 IP 流量统计（conntrack 差值采样）+ 性能历史采样
--
-- 输出:
--   /tmp/yueyue/traffic.json   当月/历史按 IP 流量 + 目的地追踪
--   /tmp/yueyue/perf.json      最近性能历史（环形缓冲）
--   /etc/yueyue/traffic.json   持久化副本（每 10 分钟 / 退出时）
--
-- 采样周期 30s；conntrack 条目在流结束后仍会保留一段时间
--（TCP TIME_WAIT 等），因此差值采样对 TCP 长短流都能较好捕获。
------------------------------------------------------------

local jsonc = require "luci.jsonc"
local uci   = require "luci.model.uci".cursor()

local INTERVAL      = 30          -- 采样周期 (秒)
local PERF_KEEP     = 2880        -- 性能样本保留条数 (30s * 2880 = 24h)
local FLUSH_EVERY   = 20          -- 每 20 个周期 (~10 分钟) 持久化一次
local DEST_KEEP     = 40          -- 每个 IP 保留的目的地条目上限
local MONTH_KEEP    = 12          -- 保留最近 N 个月

local TMP_DIR   = "/tmp/yueyue"
local TRAFFIC_F = TMP_DIR .. "/traffic.json"
local PERF_F    = TMP_DIR .. "/perf.json"
local PERSIST_F = "/etc/yueyue/traffic.json"

local function mkdir_p(dir)
	os.execute("mkdir -p " .. dir .. " 2>/dev/null")
end

local function read_file(p)
	local f = io.open(p, "r")
	if not f then return nil end
	local d = f:read("*a")
	f:close()
	return d
end

local function write_file(p, data)
	local f = io.open(p, "w")
	if not f then return false end
	f:write(data)
	f:close()
	return true
end

local function load_json(p)
	local d = read_file(p)
	if not d or #d == 0 then return nil end
	local ok, v = pcall(jsonc.parse, d)
	if ok then return v end
	return nil
end

------------------------------------------------------------
-- LAN 网段
------------------------------------------------------------

local lan_nets = {}   -- { {addr=uint32, mask=uint32} }

local function ip2num(ip)
	local a, b, c, d = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
	if not a then return nil end
	return ((a * 256 + b) * 256 + c) * 256 + d
end

local function refresh_lan_nets()
	local nets = {}
	for _, sec in pairs(uci:get_all("network") or {}) do
		if sec[".type"] == "interface" and sec.proto == "static"
			and sec.ipaddr and sec.netmask then
			local addr = ip2num(sec.ipaddr)
			local mask = ip2num(sec.netmask)
			if addr and mask then
				nets[#nets + 1] = { addr = addr, mask = mask }
			end
		end
	end
	lan_nets = nets
end

local function band(a, b)
	local r, bitv = 0, 1
	for _ = 1, 32 do
		if a % 2 == 1 and b % 2 == 1 then r = r + bitv end
		a = math.floor(a / 2)
		b = math.floor(b / 2)
		bitv = bitv * 2
	end
	return r
end

local function is_lan(ip)
	local n = ip2num(ip)
	if not n then return false end
	for _, s in ipairs(lan_nets) do
		if band(n, s.mask) == band(s.addr, s.mask) then
			return true
		end
	end
	return false
end

------------------------------------------------------------
-- 流量统计状态
------------------------------------------------------------

local traffic = {
	months = {},   -- [ym] = { up=n, down=n }
	ips    = {},   -- [ym][ip] = { up=n, down=n, first=ts, last=ts, dests={[key]={bytes=n,first=ts,last=ts,dst=,port=,proto=}} }
}
local prev_flows = {}   -- flowkey -> { u=n, d=n }

local function ym_now()
	return os.date("%Y-%m")
end

local function ensure_month(ym)
	if not traffic.months[ym] then
		traffic.months[ym] = { up = 0, down = 0 }
		traffic.ips[ym] = {}
	end
end

local function trim_months()
	local list = {}
	for ym in pairs(traffic.months) do list[#list + 1] = ym end
	table.sort(list)
	while #list > MONTH_KEEP do
		local old = table.remove(list, 1)
		traffic.months[old] = nil
		traffic.ips[old] = nil
	end
end

local function add_ip(ym, ip, up, down, dest)
	ensure_month(ym)
	local m = traffic.months[ym]
	m.up = m.up + up
	m.down = m.down + down
	local ips = traffic.ips[ym]
	local e = ips[ip]
	if not e then
		e = { up = 0, down = 0, first = os.time(), last = os.time(), dests = {} }
		ips[ip] = e
	end
	e.up = e.up + up
	e.down = e.down + down
	e.last = os.time()
	if dest then
		local d = e.dests[dest.key]
		if not d then
			d = { bytes = 0, first = os.time(), last = os.time(),
			      dst = dest.dst, port = dest.port, proto = dest.proto }
			e.dests[dest.key] = d
		end
		d.bytes = d.bytes + dest.bytes
		d.last = os.time()
	end
end

local function trim_dests()
	for _, ips in pairs(traffic.ips) do
		for _, e in pairs(ips) do
			local n = 0
			for _ in pairs(e.dests) do n = n + 1 end
			if n > DEST_KEEP then
				-- 删除最久未见的目的地
				local arr = {}
				for k, d in pairs(e.dests) do arr[#arr + 1] = { k = k, last = d.last } end
				table.sort(arr, function(a, b) return a.last > b.last end)
				for i = DEST_KEEP + 1, #arr do
					e.dests[arr[i].k] = nil
				end
			end
		end
	end
end

------------------------------------------------------------
-- conntrack 采样
------------------------------------------------------------

local function sample_conntrack()
	local f = io.open("/proc/net/nf_conntrack", "r")
	if not f then return 0 end

	local cur = {}
	local count = 0
	local ym = ym_now()
	ensure_month(ym)

	for line in f:lines() do
		count = count + 1
		local proto = line:match("^%S+%s+%d+%s+(%S+)")
		-- 两个方向: src/dst/sport/dport/packets/bytes
		local osrc, odst, osport, odport, opkts, obytes =
			line:match("src=([^ ]+)%s+dst=([^ ]+)%s+sport=(%d+)%s+dport=(%d+)%s+packets=(%d+)%s+bytes=(%d+)")
		local rsrc, rdst, rsport, rdport, rpkts, rbytes
		-- 第二组匹配: 用 find 定位第一个 bytes= 之后的 src=
		if osrc then
			local _, second = line:find("bytes=%d+")
			if second then
				local rest = line:sub(second + 1)
				rsrc, rdst, rsport, rdport, rpkts, rbytes =
					rest:match("src=([^ ]+)%s+dst=([^ ]+)%s+sport=(%d+)%s+dport=(%d+)%s+packets=(%d+)%s+bytes=(%d+)")
			end
		end

		if osrc and rbytes and not osrc:find(":") and not odst:find(":") then
			local key = proto .. "|" .. osrc .. "|" .. odst .. "|" .. osport .. "|" .. odport
			local up, down, lan_ip, dest
			if is_lan(osrc) and not is_lan(odst) then
				-- LAN -> WAN 上行
				lan_ip = osrc
				up, down = tonumber(obytes) or 0, tonumber(rbytes) or 0
				dest = { dst = odst, port = tonumber(odport), proto = proto }
			elseif is_lan(odst) and not is_lan(osrc) then
				-- WAN -> LAN 下行 (入站)
				lan_ip = odst
				up, down = tonumber(rbytes) or 0, tonumber(obytes) or 0
				dest = { dst = osrc, port = tonumber(osport), proto = proto }
			end

			if lan_ip then
				local p = prev_flows[key]
				local du, dd
				if p then
					du = up - p.u
					dd = down - p.d
					if du < 0 then du = up end
					if dd < 0 then dd = down end
				else
					du, dd = up, down
				end
				if du > 0 or dd > 0 then
					local dkey = dest.dst .. ":" .. tostring(dest.port) .. "/" .. dest.proto
					add_ip(ym, lan_ip, du, dd,
						{ key = dkey, dst = dest.dst, port = dest.port,
						  proto = dest.proto, bytes = du + dd })
				end
				cur[key] = { u = up, d = down }
			end
		end
	end
	f:close()

	prev_flows = cur
	return count
end

------------------------------------------------------------
-- 性能采样
------------------------------------------------------------

local perf = { samples = {} }
local last_cpu = nil
local last_net = nil

local function read_cpu()
	local d = read_file("/proc/stat") or ""
	local n = {}
	for v in (d:match("^cpu%s+([%d%s]+)") or ""):gmatch("%d+") do
		n[#n + 1] = tonumber(v)
	end
	local user, nice, system, idle = n[1] or 0, n[2] or 0, n[3] or 0, n[4] or 0
	local iowait, irq, softirq = n[5] or 0, n[6] or 0, n[7] or 0
	return { total = user + nice + system + idle + iowait + irq + softirq,
	         busy = user + nice + system + irq + softirq }
end

local function sample_perf(conn_count)
	local cpu = read_cpu()
	local cpu_pct = 0
	if last_cpu and cpu.total > last_cpu.total then
		cpu_pct = math.floor((cpu.busy - last_cpu.busy) * 100 / (cpu.total - last_cpu.total) + 0.5)
	end
	last_cpu = cpu

	local mem_pct = 0
	local d = read_file("/proc/meminfo") or ""
	local total = tonumber(d:match("MemTotal:%s*(%d+)")) or 0
	local avail = tonumber(d:match("MemAvailable:%s*(%d+)")) or 0
	if total > 0 then
		mem_pct = math.floor((total - avail) * 100 / total + 0.5)
	end

	local load1 = 0
	local ld = read_file("/proc/loadavg") or ""
	load1 = tonumber(ld:match("^([%d%.]+)")) or 0
	load1 = math.floor(load1 * 100 + 0.5) / 100

	-- WAN 口速率 (字节/秒)
	local rx, tx = 0, 0
	local nd = read_file("/proc/net/dev") or ""
	local devs = {}
	for line in nd:gmatch("[^\n]+") do
		local name, r, t = line:match("^%s*([%w%._%-]+):%s*(%d+)%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+(%d+)")
		if name and name ~= "lo" then
			devs[name] = { r = tonumber(r) or 0, t = tonumber(t) or 0 }
		end
	end
	-- 汇总物理口: br-lan 下属口重复计数问题 → 用除 lo/br-/docker 外全部设备的最大一块
	local wan_rx, wan_tx = 0, 0
	for name, v in pairs(devs) do
		if not name:match("^br%-") and not name:match("^docker") and not name:match("^veth") then
			if v.r + v.t > wan_rx + wan_tx then
				wan_rx, wan_tx = v.r, v.t
			end
		end
	end
	local rx_bps, tx_bps = 0, 0
	if last_net then
		local dt = INTERVAL
		if wan_rx >= last_net.r then rx_bps = math.floor((wan_rx - last_net.r) / dt) end
		if wan_tx >= last_net.t then tx_bps = math.floor((wan_tx - last_net.t) / dt) end
	end
	last_net = { r = wan_rx, t = wan_tx }

	local s = perf.samples
	s[#s + 1] = { os.time(), cpu_pct, mem_pct, load1, conn_count or 0, rx_bps, tx_bps }
	while #s > PERF_KEEP do table.remove(s, 1) end
end

------------------------------------------------------------
-- 主循环
------------------------------------------------------------

mkdir_p(TMP_DIR)
os.execute("mkdir -p /etc/yueyue 2>/dev/null")

-- 恢复持久化数据（重启后不丢当月累计）
do
	local persisted = load_json(PERSIST_F)
	if persisted and persisted.months then
		traffic = persisted
	end
end

local tick = 0
while true do
	refresh_lan_nets()

	local ok1, err1 = pcall(function()
		local conn = sample_conntrack()
		sample_perf(conn)
	end)
	if not ok1 then
		io.stderr:write("yueyue-monitor sample error: ", tostring(err1), "\n")
	end

	tick = tick + 1
	if tick % 5 == 0 then
		trim_months()
		trim_dests()
	end

	local ok2, err2 = pcall(function()
		write_file(TRAFFIC_F, jsonc.stringify(traffic))
		write_file(PERF_F, jsonc.stringify(perf))
	end)
	if not ok2 then
		io.stderr:write("yueyue-monitor write error: ", tostring(err2), "\n")
	end

	if tick % FLUSH_EVERY == 0 then
		pcall(function()
			write_file(PERSIST_F, jsonc.stringify(traffic))
		end)
	end

	os.execute("sleep " .. INTERVAL)
end
