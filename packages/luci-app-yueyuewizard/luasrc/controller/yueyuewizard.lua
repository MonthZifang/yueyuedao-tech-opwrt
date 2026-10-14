-- 月月岛科技 首次开机向导 (luci-app-yueyuewizard)
-- YUEYUEDAO TECH First-Setup Wizard — LuCI Lua controller

module("luci.controller.yueyuewizard", package.seeall)

local http = require "luci.http"
local sys  = require "luci.sys"
local uci  = require "luci.model.uci".cursor()
local jsonc = require "luci.jsonc"

function index()
	entry({"admin", "yueyue"}, alias("admin", "yueyue", "wizard"), _("月月岛向导"), 1)
	entry({"admin", "yueyue", "wizard"}, call("wizard_view"), _("首次设置向导"), 1)

	entry({"admin", "yueyue", "api", "status"},   call("api_status")).leaf = true
	entry({"admin", "yueyue", "api", "scan"},     call("api_scan")).leaf = true
	entry({"admin", "yueyue", "api", "uplink"},   call("api_uplink")).leaf = true
	entry({"admin", "yueyue", "api", "mode"},     call("api_mode")).leaf = true
	entry({"admin", "yueyue", "api", "password"}, call("api_password")).leaf = true
	entry({"admin", "yueyue", "api", "finish"},   call("api_finish")).leaf = true
end

---------------------------------------------------------------- helpers

local function reply(t)
	http.prepare_content("application/json")
	http.write_json(t or {})
end

local function wizard_done()
	return uci:get("yueyue", "wizard", "done") == "1"
end

local function val(name, max)
	local v = http.formvalue(name)
	if not v then return nil end
	v = v:gsub("%c", ""):gsub("^%s+", ""):gsub("%s+$", "")
	if #v == 0 then return nil end
	if max and #v > max then v = v:sub(1, max) end
	return v
end

-- /sys/class/net/*/wireless 的网卡名
local function wifi_devs()
	local devs = {}
	for line in io.popen("ls -d /sys/class/net/*/wireless 2>/dev/null"):lines() do
		local d = line:match("/net/([^/]+)/wireless")
		if d then devs[#devs + 1] = d end
	end
	return devs
end

-- 网卡名 -> radio 名 (uci wireless.device)
local function radio_for_dev(dev)
	local status = sys.exec("ubus -S call network.wireless status 2>/dev/null")
	local ok, data = pcall(jsonc.parse, status)
	if ok and data then
		for radio, r in pairs(data) do
			for _, itf in ipairs(r.interfaces or {}) do
				if itf.ifname == dev then
					return radio
				end
			end
		end
	end
	local radio = uci:get("wireless", "@wifi-iface[0]", "device")
	return radio or "radio0"
end

-- 单设备扫描: ubus 优先, iwinfo 解析兜底
local function scan_dev(dev)
	local aps = {}
	local raw = sys.exec("ubus -S call iwinfo scan '{\"device\":\"" .. dev .. "\"}' 2>/dev/null")
	local ok, data = pcall(jsonc.parse, raw)
	if ok and data and data.results then
		for _, r in ipairs(data.results) do
			aps[#aps + 1] = {
				ssid = r.ssid or "",
				bssid = r.bssid or "",
				channel = r.channel or 0,
				signal = r.signal or 0,
				quality = r.quality or 0,
				encryption = (r.encryption and r.encryption.enabled) and
					((r.encryption.wpa and r.encryption.wpa > 0) and "wpa" or "wep") or "none",
				device = dev
			}
		end
		return aps
	end
	-- iwinfo 文本解析兜底
	local cell
	for line in io.popen("iwinfo " .. dev .. " scan 2>/dev/null"):lines() do
		if line:match("Cell %d+") then
			if cell then aps[#aps + 1] = cell end
			cell = { ssid = "", channel = 0, signal = 0, encryption = "none", device = dev }
		elseif cell then
			local ssid = line:match('ESSID:%s*"([^"]*)"')
			if ssid then cell.ssid = ssid end
			local ch = line:match("Channel:%s*(%d+)")
			if ch then cell.channel = tonumber(ch) end
			local sig = line:match("Signal:%s*(-?%d+)")
			if sig then cell.signal = tonumber(sig) end
			if line:match("Encryption:%s*WPA") then cell.encryption = "wpa"
			elseif line:match("Encryption:%s*WEP") then cell.encryption = "wep" end
		end
	end
	if cell then aps[#aps + 1] = cell end
	return aps
end

local function firewall_add_zone_network(zone_name, net)
	local zones = uci:get_all("firewall") or {}
	for k, z in pairs(zones) do
		if z[".type"] == "zone" and z.name == zone_name then
			local list = uci:get_list("firewall", k, "network") or {}
			for _, n in ipairs(list) do
				if n == net then return end
			end
			uci:append("firewall", k, "network", net)
			return
		end
	end
end

local function firewall_new_zone(name, net)
	local id = uci:add("firewall", "zone")
	uci:set("firewall", id, "name", name)
	uci:set_list("firewall", id, "network", { net })
	uci:set("firewall", id, "input", "accept")
	uci:set("firewall", id, "output", "accept")
	uci:set("firewall", id, "forward", "reject")
	-- 放行到 wan (独立网段可上网，但互相隔离)
	local fwd = uci:add("firewall", "forwarding")
	uci:set("firewall", fwd, "src", name)
	uci:set("firewall", fwd, "dest", "wan")
end

local function reload_network()
	sys.call("wifi reload >/dev/null 2>&1")
	sys.call("/etc/init.d/network reload >/dev/null 2>&1 &")
end

---------------------------------------------------------------- views

function wizard_view()
	if wizard_done() then
		http.redirect(luci.dispatcher.build_url("admin", "status", "overview"))
		return
	end
	luci.template.render("yueyuewizard/wizard")
end

---------------------------------------------------------------- apis

function api_status()
	local done = wizard_done()
	local wan_proto = uci:get("network", "wan", "proto") or "dhcp"
	local wwan = uci:get("network", "wwan", "proto")
	reply({
		done = done,
		hostname = uci:get("system", "@system[0]", "hostname") or "OpenWrt",
		lan_ip = uci:get("network", "lan", "ipaddr") or "192.168.21.1",
		wan_proto = wan_proto,
		uplink = wwan and true or false,
		version = sys.exec("cat /etc/openwrt_release 2>/dev/null | grep DISTRIB_DESCRIPTION | cut -d= -f2-"):gsub("'", "")
	})
end

function api_scan()
	local all = {}
	for _, dev in ipairs(wifi_devs()) do
		for _, ap in ipairs(scan_dev(dev)) do
			all[#all + 1] = ap
		end
	end
	table.sort(all, function(a, b) return (a.signal or -999) > (b.signal or -999) end)
	reply({ aps = all, devices = wifi_devs() })
end

-- 上联: WISP (无线中继) 或网线 DHCP
function api_uplink()
	local action = val("action", 16) or "wisp"
	local dev = val("device", 16)
	local ssid = val("ssid", 32)
	local key = val("key", 64)
	local enc = val("encryption", 16) or "psk2+ccmp"

	if action == "wired" then
		uci:set("network", "wan", "proto", "dhcp")
		uci:delete("network", "wwan")
		uci:commit("network")
		reload_network()
		reply({ ok = true, mode = "wired" })
		return
	end

	if not dev or not ssid then
		reply({ ok = false, msg = "缺少 device/ssid" })
		return
	end
	if enc ~= "none" and (not key or #key < 8) then
		reply({ ok = false, msg = "密码至少 8 位" })
		return
	end

	local radio = radio_for_dev(dev)

	uci:set("network", "wwan", "interface")
	uci:set("network", "wwan", "proto", "dhcp")
	uci:set("network", "wwan", "device", dev)
	uci:commit("network")

	uci:set("wireless", "yueyue_uplink", "wifi-iface")
	uci:set("wireless", "yueyue_uplink", "device", radio)
	uci:set("wireless", "yueyue_uplink", "mode", "sta")
	uci:set("wireless", "yueyue_uplink", "network", "wwan")
	uci:set("wireless", "yueyue_uplink", "ssid", ssid)
	if enc == "none" then
		uci:set("wireless", "yueyue_uplink", "encryption", "none")
		uci:delete("wireless", "yueyue_uplink", "key")
	else
		uci:set("wireless", "yueyue_uplink", "encryption", enc)
		uci:set("wireless", "yueyue_uplink", "key", key)
	end
	uci:commit("wireless")

	firewall_add_zone_network("wan", "wwan")
	uci:commit("firewall")

	reload_network()
	reply({ ok = true, mode = "wisp", radio = radio, device = dev, ssid = ssid })
end

-- 组网模式: simple | mesh | vlan
function api_mode()
	local mode = val("mode", 16) or "simple"

	if mode == "simple" then
		reply({ ok = true, mode = "simple" })
		return
	end

	if mode == "mesh" then
		local mesh_id = val("mesh_id", 32) or "yueyue-mesh"
		local key = val("mesh_key", 64)
		local radio = uci:get("wireless", "@wifi-iface[0]", "device") or "radio0"

		-- 自动信道: 取周边占用最少的信道 (2.4G: 1/6/11, 5G: 全部候选)
		local counts = {}
		for _, dev in ipairs(wifi_devs()) do
			for _, ap in ipairs(scan_dev(dev)) do
				local ch = tonumber(ap.channel) or 0
				if ch > 0 then counts[ch] = (counts[ch] or 0) + 1 end
			end
		end
		local candidates = { 1, 6, 11 }
		local best, bestn = nil, math.huge
		for _, ch in ipairs(candidates) do
			if (counts[ch] or 0) < bestn then best, bestn = ch, (counts[ch] or 0) end
		end

		uci:set("wireless", "yueyue_mesh", "wifi-iface")
		uci:set("wireless", "yueyue_mesh", "device", radio)
		uci:set("wireless", "yueyue_mesh", "mode", "mesh")
		uci:set("wireless", "yueyue_mesh", "mesh_id", mesh_id)
		uci:set("wireless", "yueyue_mesh", "mesh_fwding", "1")
		uci:set("wireless", "yueyue_mesh", "network", "lan")
		if key and #key >= 8 then
			uci:set("wireless", "yueyue_mesh", "encryption", "sae")
			uci:set("wireless", "yueyue_mesh", "key", key)
		else
			uci:set("wireless", "yueyue_mesh", "encryption", "none")
		end
		if best then
			uci:set("wireless", radio, "channel", best)
		end
		uci:commit("wireless")
		reload_network()
		reply({ ok = true, mode = "mesh", mesh_id = mesh_id, channel = best })
		return
	end

	if mode == "vlan" then
		local count = tonumber(val("count", 2)) or 3
		if count < 2 then count = 2 end
		if count > 4 then count = 4 end
		local names = {}
		local keys = {}
		for i = 1, count do
			names[i] = val("name" .. i, 24) or ("yueyue-" .. (21 + i))
			keys[i] = val("key" .. i, 64) or ("opwrt" .. (21 + i))
		end

		local radio = uci:get("wireless", "@wifi-iface[0]", "device") or "radio0"
		for i = 1, count do
			local net = "lan" .. (21 + i)
			local idx = i
			uci:set("network", net, "interface")
			uci:set("network", net, "proto", "static")
			uci:set("network", net, "ipaddr", "192.168." .. (21 + i) .. ".1")
			uci:set("network", net, "netmask", "255.255.255.0")

			local h = uci:add("dhcp", "dhcp")
			uci:set("dhcp", h, "interface", net)
			uci:set("dhcp", h, "start", "100")
			uci:set("dhcp", h, "limit", "150")
			uci:set("dhcp", h, "leasetime", "12h")

			local w = uci:add("wireless", "wifi-iface")
			uci:set("wireless", w, "device", radio)
			uci:set("wireless", w, "mode", "ap")
			uci:set("wireless", w, "network", net)
			uci:set("wireless", w, "ssid", names[i])
			uci:set("wireless", w, "encryption", "psk2+ccmp")
			uci:set("wireless", w, "key", keys[i])

			firewall_new_zone(net, net)
		end
		uci:commit("network")
		uci:commit("dhcp")
		uci:commit("wireless")
		uci:commit("firewall")
		reload_network()
		reply({ ok = true, mode = "vlan", count = count })
		return
	end

	reply({ ok = false, msg = "未知模式" })
end

function api_password()
	local pw = val("password", 64)
	if not pw or #pw < 4 then
		reply({ ok = false, msg = "密码至少 4 位" })
		return
	end
	if pw:match("[^%g%s]") then
		reply({ ok = false, msg = "密码包含非法字符" })
		return
	end
	local ok = sys.user.setpasswd("root", pw)
	reply({ ok = ok and true or false })
end

function api_finish()
	uci:set("yueyue", "wizard", "done", "1")
	uci:commit("yueyue")
	reply({ ok = true })
end
