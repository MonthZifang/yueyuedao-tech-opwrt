# 月月岛科技 企业定制 OpenWrt

> YUEYUEDAO TECH Enterprise OpenWrt Firmware — x86_64

基于官方 OpenWrt 的企业路由固件定制，面向客户交付。

## 定制规格

| 项目 | 值 |
|---|---|
| 基础分支 | 官方 OpenWrt (x86_64) |
| 交付形态 | ISO 镜像 + 可刷写 IMG |
| 主机名 | 月月岛科技 |
| LAN 网段 | 192.168.21.1/24 |
| WiFi 名称 | yueyue-opwrt |
| WiFi 密码 | yueyuedaotech |
| 后台登录 | root / root |
| 预装 | 多拨 (mwan3 多线路) |

## 首次开机引导

- 自动扫描周边 AP，默认自动连接上联
- 引导选择组网模式：
  - **组网 (Mesh)**：自动信道规划，统一管理
  - **多网段划分**：独立 SSID / 独立密码 / 独立网段
- 修改管理密码

## 界面风格

深青黑底 `#0F1A19` + 薄荷绿主色 `#7fe7d2` + 玻璃拟态卡片，
参考月月岛百科 / 月月岛博客的视觉语言。

## 目录结构

```
├── seed.config              # OpenWrt 构建种子配置
├── files/                   # 固件内置文件覆盖 (uci-defaults 等)
├── docs/                    # 设计文档
└── README.md
```

## 构建

```bash
git clone https://github.com/openwrt/openwrt.git
cd openwrt
./scripts/feeds update -a && ./scripts/feeds install -a
cp ../seed.config .config && make defconfig
make -j$(nproc)
```

---
© 月月岛科技 YUEYUEDAO TECH
