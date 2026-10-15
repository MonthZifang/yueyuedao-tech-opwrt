-- 月月岛科技 控制台 (luci-app-yueyueconsole) — Lua controller
-- 静态 SPA 入口 + 路由可视化 API (静态 uci 路由 + 运行时 ip route)
module("luci.controller.yueyueconsole", package.seeall)

local http  = require "luci.http"
local sys   = require "luci.sys"
local uci   = require "luci.model.uci".cursor()
local jsonc = require "luci.jsonc"

function index()
	entry({"admin", "yueyueconsole"}, call("open_console"), _("月月岛控制台"), 1)

	entry({"admin", "yueroute", "api", "topology"},     call("api_topology")).leaf = true
	entry({"admin", "yueroute", "api", "route_save"},   call("api_route_save")).leaf = true
	entry({"admin", "yueroute", "api", "route_delete"}, call("api_route_delete")).leaf = true
	entry({"admin", "yueroute", "api", "layout_save"},  call("api_layout_save")).leaf = true
	entry({"admin", "yueroute", "api", "apply"},        call("api_apply")).leaf = true
	entry({"admin", "yueroute", "api", "sysinfo"},      call("api_sysinfo")).leaf = true
end

function open_console()
	http.redirect("/luci-static/yueyue/index.html")
end

---------------------------------------------------------------- helpers

local function reply(t)
	http.prepare_content("application/json")
	http.write_json(t or {})
end

local function read_body()
	local body = http.content()
	if not body or #body == 0 then return nil end
	local ok, data = pcall(jsonc.parse, body)
	return ok and data or nil
end

local function mask2prefix(m)
	if not m or m == "" then return 32 end
	if m:match("^%d+$") then return tonumber(m) end
	local n = 0
	for oct in m:gmatch("%d+") do
		local o = tonumber(oct) or 0
		while o > 0 do n = n + (o % 2); o = math.floor(o / 2) end
	end
	return n
end

local function prefix2mask(p)
	p = tonumber(p) or 32
	if p < 0 then p = 0 end
	if p > 32 then p = 32 end
	local parts = {}
	for i = 1, 4 do
		local bits = math.max(0, math.min(8, p - (i - 1) * 8))
		parts[i] = tostring(256 - 2 ^ (8 - bits))
	end
	return table.concat(parts, ".")
end

local function safe_sid(id)
	local s = tostring(id or ""):gsub("[^%w_]", "")
	if #s == 0 then s = "rt" .. tostring(os.time()) end
	return s
end

-- uci 接口列表 + ubus 运行态
local function iface_list()
	local byname = {}
	local raw = sys.exec("ubus -S call network.interface dump 2>/dev/null")
	local ok, data = pcall(jsonc.parse, raw)
	if ok and data and data.interface then
		for _, itf in ipairs(data.interface) do
			local ipv4 = itf["ipv4-address"] and itf["ipv4-address"][1]
			byname[itf.interface] = {
				up = itf.up and true or false,
				ipaddr = ipv4 and ipv4.address or nil,
				netmask = ipv4 and ipv4.mask or nil,
				device = itf.l3_device or itf.device or "",
			}
		end
	end

	local out = {}
	local all = uci:get_all("network") or {}
	for name, s in pairs(all) do
		if s[".type"] == "interface" then
			local st = byname[name] or {}
			out[#out + 1] = {
				name = name,
				device = st.device or s.device or s.ifname or "",
				ipaddr = st.ipaddr or s.ipaddr,
				netmask = st.netmask or s.netmask,
				proto = s.proto or "static",
				up = st.up and true or false,
			}
		end
	end
	table.sort(out, function(a, b) return a.name < b.name end)
	return out
end

-- uci 静态路由
local function static_routes()
	local out = {}
	local all = uci:get_all("network") or {}
	for name, s in pairs(all) do
		if s[".type"] == "route" then
			local target = s.target or "0.0.0.0"
			local cidr
			if target:find("/") then
				cidr = target
			else
				cidr = target .. "/" .. tostring(mask2prefix(s.netmask))
			end
			out[#out + 1] = {
				id = name,
				target = cidr,
				gateway = s.gateway or "",
				iface = s.interface or "lan",
				metric = tonumber(s.metric) or 0,
				enabled = s.disabled ~= "1",
				source = "static",
				table = "main",
			}
		end
	end
	return out
end

-- 运行时路由 (ip -j route show table all)
local function runtime_routes()
	local out = {}
	local raw = sys.exec("ip -j route show table all 2>/dev/null")
	local ok, list = pcall(jsonc.parse, raw)
	if not (ok and type(list) == "table") then return out end
	local ifaces = iface_list()
	for i, e in ipairs(list) do
		local dst = e.dst or e.destination
		if dst then
			if dst == "default" then dst = "0.0.0.0/0"
			elseif not dst:find("/") then dst = dst .. "/32" end
			local ifname = e.dev or ""
			for _, f in ipairs(ifaces) do
				if f.device == ifname then ifname = f.name break end
			end
			out[#out + 1] = {
				id = "rt" .. tostring(i),
				target = dst,
				gateway = e.gateway or "",
				iface = ifname,
				metric = tonumber(e.metric) or 0,
				enabled = true,
				source = "runtime",
				table = e.table or "main",
			}
		end
	end
	return out
end

local function get_layout()
	local raw = uci:get("yueyue", "wizard", "flow_layout")
	if not raw then return {} end
	local ok, data = pcall(jsonc.parse, raw)
	return (ok and type(data) == "table") and data or {}
end

local function has_pending()
	return #(sys.exec("uci changes network 2>/dev/null"):gsub("%s", "")) > 0
end

---------------------------------------------------------------- apis

function api_topology()
	local routes = static_routes()
	for _, r in ipairs(runtime_routes()) do
		routes[#routes + 1] = r
	end
	reply({
		ifaces = iface_list(),
		routes = routes,
		layout = get_layout(),
		pending = has_pending(),
	})
end

function api_route_save()
	local b = read_body()
	local r = b and b.route
	if not r or not r.target or not r.iface then
		reply({ ok = false, msg = "缺少 route 字段" })
		return
	end

	local sid = safe_sid(r.id)
	local target = tostring(r.target)
	local addr, prefix = target:match("^([^/]+)/(%d+)$")

	uci:set("network", sid, "route")
	if addr then
		uci:set("network", sid, "target", addr)
		uci:set("network", sid, "netmask", prefix2mask(prefix))
	else
		uci:set("network", sid, "target", target)
	end
	uci:set("network", sid, "interface", tostring(r.iface))
	uci:set("network", sid, "metric", tostring(tonumber(r.metric) or 0))
	if r.gateway and #tostring(r.gateway) > 0 then
		uci:set("network", sid, "gateway", tostring(r.gateway))
	else
		uci:delete("network", sid, "gateway")
	end
	if r.enabled == false then
		uci:set("network", sid, "disabled", "1")
	else
		uci:delete("network", sid, "disabled")
	end
	uci:save("network")
	reply({ ok = true, id = sid })
end

function api_route_delete()
	local b = read_body()
	local id = b and b.id
	if not id then
		reply({ ok = false, msg = "缺少 id" })
		return
	end
	uci:delete("network", safe_sid(id))
	uci:save("network")
	reply({ ok = true })
end

function api_layout_save()
	local b = read_body()
	if not b or type(b.layout) ~= "table" then
		reply({ ok = false, msg = "缺少 layout" })
		return
	end
	uci:set("yueyue", "wizard", "flow_layout", jsonc.stringify(b.layout))
	uci:commit("yueyue")
	reply({ ok = true })
end

function api_apply()
	uci:commit("network")
	sys.call("/etc/init.d/network reload >/dev/null 2>&1")
	reply({ ok = true })
end

---------------------------------------------------------------- sysinfo
-- 自研实时流量 / 系统监控页面的数据源（只读）

local function slurp(p)
	local f = io.open(p, "r")
	if not f then return "" end
	local d = f:read("*a") or ""
	f:close()
	return d
end

function api_sysinfo()
	-- CPU 累计计数（客户端算差值）
	local cpu = {}
	local n = {}
	for v in (slurp("/proc/stat"):match("^cpu%s+([%d%s]+)") or ""):gmatch("%d+") do
		n[#n + 1] = tonumber(v)
	end
	cpu.user, cpu.nice, cpu.system, cpu.idle = n[1] or 0, n[2] or 0, n[3] or 0, n[4] or 0
	cpu.iowait, cpu.irq, cpu.softirq = n[5] or 0, n[6] or 0, n[7] or 0
	cpu.total = cpu.user + cpu.nice + cpu.system + cpu.idle + cpu.iowait + cpu.irq + cpu.softirq

	-- 内存 / 交换
	local mem = {}
	for k, v in slurp("/proc/meminfo"):gmatch("([%w_]+):%s*(%d+)") do
		mem[k] = tonumber(v) * 1024
	end

	-- 负载 / 运行时间
	local load = {}
	for v in slurp("/proc/loadavg"):gmatch("[%d%.]+") do
		load[#load + 1] = tonumber(v)
		if #load >= 3 then break end
	end
	local uptime = tonumber(slurp("/proc/uptime"):match("[%d%.]+")) or 0

	-- 网卡累计字节
	local net = {}
	for line in slurp("/proc/net/dev"):gmatch("[^\n]+") do
		local name, rx, tx = line:match("^%s*([%w%._%-]+):%s*(%d+)%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+%d+%s+(%d+)")
		if name then net[name] = { rx = tonumber(rx), tx = tonumber(tx) } end
	end

	-- 接口状态
	local ifaces = {}
	local raw = sys.exec("ubus -S call network.interface dump 2>/dev/null")
	local ok, data = pcall(jsonc.parse, raw)
	if ok and data and data.interface then
		for _, itf in ipairs(data.interface) do
			local ipaddr = nil
			if type(itf["ipv4-address"]) == "table" and itf["ipv4-address"][1] then
				ipaddr = itf["ipv4-address"][1].address
			end
			ifaces[#ifaces + 1] = {
				name = itf.interface or "?",
				up = itf.up and true or false,
				proto = itf.proto,
				device = itf.l3_device or itf.device,
				ipaddr = ipaddr,
				uptime = itf.uptime
			}
		end
	end

	-- 根分区
	local disk = nil
	for line in io.popen("df -k / 2>/dev/null"):lines() do
		local used, avail = line:match("^%S+%s+%d+%s+(%d+)%s+(%d+)")
		if used then disk = { used = tonumber(used), free = tonumber(avail) } end
	end

	local ver = (slurp("/etc/openwrt_release"):match('DISTRIB_DESCRIPTION=.([^"\n]+)') or "OpenWrt"):gsub("'", "")

	reply({
		cpu = cpu, mem = mem, load = load, uptime = uptime,
		net = net, ifaces = ifaces, disk = disk, version = ver,
		time = os.time()
	})
end
