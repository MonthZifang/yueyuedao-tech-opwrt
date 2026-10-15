# 月月岛科技 企业定制 OpenWrt

> YUEYUEDAO TECH Enterprise OpenWrt Firmware — x86_64

基于**官方 OpenWrt 25.12.5（x86_64）** 的企业路由固件定制，面向客户交付。
前端为**完全自研控制台**（React + TypeScript + Vite），已替换原版 LuCI 前端。

## 定制规格

| 项目 | 值 |
|---|---|
| 基础分支 | 官方 OpenWrt 25.12.5 (x86_64) |
| 交付形态 | 可刷写 IMG（Legacy BIOS / UEFI）+ 全量编译可出 ISO |
| 主机名 | 月月岛科技 |
| LAN 网段 | 192.168.21.1/24（网段 21） |
| WiFi 名称 | yueyue-opwrt |
| WiFi 密码 | opwrt |
| 后台登录 | root / root |
| 预装 | 多拨 (mwan3 多线路)、wireguard |

## 版本

| 版本 | 内容 |
|---|---|
| v1.0.0 | 首次引导向导（luci-app-yueyuewizard）+ 默认配置，QEMU 全流程实测通过 |
| **v2.1.0（当前）** | **前端全面重构**：React 控制台替换原版 LuCI 前端；设计系统 v2（玻璃拟态+插画背景）；登录页左插画/右登录分栏；自研流量/监控/路由可视化页面；rpcd ACL 补齐（ubus 权限修复）；diag traceroute 超时修复 |

> ⚠️ 版本纪律：**只交付由最新代码构建的产物**，旧副本/旧镜像一律不作为交付依据。

## 架构（v2.1.0）

```
ui/                        # 前端源码：React 18 + TypeScript + Vite
├── src/pages/             # 登录 / 向导 / 首页 / 接口 / 防火墙 / DHCP / 诊断 …
├── src/styles/theme.css   # 设计系统 v2（玻璃拟态、明暗主题、个性化变量）
└── public/assets/         # bg.jpg 插画背景 + logo.png 白发少女 logo
files/                     # 固件内置文件覆盖（构建时整目录灌入 rootfs）
├── www/luci-static/yueyue/    # 前端构建产物（npm run build 输出）
├── www/cgi-bin/yueyue         # 后端 API（Lua CGI，ubus session 鉴权）
├── usr/libexec/yueyue/monitor.lua  # yueyue-monitor 采样守护（流量月账本/性能历史）
├── usr/share/rpcd/acl.d/yueyue-console.json  # ubus 权限（必需，缺失则接口/无线页失灵）
└── etc/init.d/yueyue-monitor + uci-defaults/
docs/                      # 设计文档
tasks/ + TASKS.md          # 任务日志（每次任务一份 md）
seed.config                # 全量源码编译种子配置
```

## 首次开机引导（向导已并入 React 控制台 · /wizard）

首次登录自动进入引导，也可随时重跑：

1. **欢迎页** — 固件版本
2. **上联检测** — 扫描周边 AP，选择后以 WISP 方式自动连接；也可直接网线 DHCP
3. **组网方式** — 标准路由 / Mesh 组网（自动信道规划）/ 多网段划分（独立 SSID/密码/网段）
4. **管理密码** — 修改 root 密码（默认 root/root，引导内提示修改）
5. **完成** — 应用配置并重载网络，展示摘要

## 视觉设计

深青黑底 `#0F1A19` + 薄荷绿主色 `#7fe7d2` + 玻璃拟态卡片 + 全站插画背景 `bg.jpg` + 白发少女 `logo.png`。
**登录页为左右分栏**：左侧整幅插画展示（品牌名 + 特性标签），右侧玻璃拟态登录面板；窄屏自动变为顶部横幅 + 下方表单。
所有配色/遮罩/模糊/圆角支持「设置 → 个性化」实时调整。

## 构建

### 前端（改 UI 后必做）

```bash
cd ui
npm install
npm run build     # tsc 检查 + vite 构建，产物直接落到 files/www/luci-static/yueyue
```

### 固件镜像（快速通道，ImageBuilder）

```bash
# WSL Ubuntu 内（脚本 ybuild.sh，幂等）
cd /home/yueyue/ib/openwrt-imagebuilder-25.12.5-x86-64.Linux-x86_64
PKGS="$(cat /mnt/f/linux/ib-packages.txt)"
make image PROFILE=generic PACKAGES="$PKGS" FILES=/mnt/f/linux/gitwork/yueopwrt/files
# 产物：bin/targets/x86/64/ → 归档到 F:\linux\firmware-<版本>\
```

注意：25.12 用 **apk** 打包（不是 ipk）；ImageBuilder 的 x86 目标**不出 ISO**。

### 全量源码编译（出 ISO，可深度定制）

```bash
git clone https://github.com/openwrt/openwrt.git && cd openwrt
git checkout v25.12.5
./scripts/feeds update -a && ./scripts/feeds install -a
cp ../seed.config .config && make defconfig
make -j$(nproc)   # 产物 bin/targets/x86/64/（含 ISO，需 CONFIG_ISO_IMAGES=y）
```

---
© 月月岛科技 YUEYUEDAO TECH
