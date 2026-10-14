# 月月岛科技 企业定制 OpenWrt

> YUEYUEDAO TECH Enterprise OpenWrt Firmware — x86_64

基于**官方 OpenWrt（25.12.x）** 的企业路由固件定制，面向客户交付。

## 定制规格

| 项目 | 值 |
|---|---|
| 基础分支 | 官方 OpenWrt (x86_64) |
| 交付形态 | ISO 镜像 + 可刷写 IMG |
| 主机名 | 月月岛科技 |
| LAN 网段 | 192.168.21.1/24（网段 21） |
| WiFi 名称 | yueyue-opwrt |
| WiFi 密码 | opwrt |
| 后台登录 | root / root |
| 预装 | 多拨 (mwan3 多线路) |

## 首次开机引导（luci-app-yueyuewizard）

首次登录后台自动进入引导，也可在 `月月岛向导` 菜单随时重跑：

1. **欢迎页** — 固件版本
2. **上联检测** — 扫描周边 AP，选择后以 WISP 方式自动连接；也可直接网线 DHCP
3. **组网方式** — 标准路由 / Mesh 组网（自动信道规划）/ 多网段划分（独立 SSID/密码/网段）
4. **管理密码** — 修改 root 密码（默认 root/root，引导内提示修改）
5. **完成** — 应用配置并重载网络，展示摘要

界面风格：深青黑底 `#0F1A19` + 薄荷绿主色 `#7fe7d2` + 玻璃拟态卡片，
Zen Maru Gothic / Noto Sans SC / JetBrains Mono（对齐月月岛百科、月月岛博客视觉语言）。

## 目录结构

```
├── seed.config              # OpenWrt 构建种子配置
├── packages/
│   └── luci-app-yueyuewizard/   # 首次开机引导 LuCI 应用源码
├── files/                   # 固件内置文件覆盖 (uci-defaults 等)
├── docs/                    # 设计文档
└── README.md
```

## 构建

快速通道（SDK 编 ipk + ImageBuilder 打镜像）：

```bash
# 1. 编译向导包
cd openwrt-sdk-*/x86-64/
cp -r ../../yueopwrt/packages/luci-app-yueyuewizard package/
make defconfig && make package/luci-app-yueyuewizard/compile -j$(nproc)

# 2. 打镜像
cd openwrt-imagebuilder-*/x86-64/
cp ../../*/bin/packages/*/luci-app-yueyuewizard_*.ipk packages/
make image PROFILE=generic PACKAGES="luci-ssl luci-app-mwan3 mwan3 ... luci-app-yueyuewizard" FILES=../../yueopwrt/files
```

全量源码编译（可深度定制）：

```bash
git clone https://github.com/openwrt/openwrt.git
cd openwrt
./scripts/feeds update -a && ./scripts/feeds install -a
cp ../seed.config .config && make defconfig
make -j$(nproc)
```

---
© 月月岛科技 YUEYUEDAO TECH
