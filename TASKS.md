# 任务记录 TASKS

月月岛科技 企业定制 OpenWrt 项目 · 任务日志索引
每次任务一份 md，记录在 `tasks/` 目录。格式：目标 / 做了什么 / 结果 / 待办。

| 日期 | 任务 | 文档 |
|---|---|---|
| 2026-10-14 | 服务器侦察与项目扫描 | [tasks/2026-10-14-01-服务器侦察与项目扫描.md] |
| 2026-10-14 | WSL 下载任务复原与完整性校验 | [tasks/2026-10-14-02-下载任务复原与校验.md] |
| 2026-10-15 | 首次引导向导开发与固件镜像构建 | [tasks/2026-10-15-01-向导开发与镜像构建.md] |
| 2026-10-15 | WSL/Docker 沙箱环境部署（E:\linux） | [tasks/2026-10-15-02-WSL-Docker部署.md] |
| 2026-10-15 | 向导 UI 背景+logo 并灌入虚拟机实测 | [tasks/2026-10-15-03-向导UI背景与logo.md] |

## 当前交付物

- `openwrt-25.12.5-x86-64-generic-squashfs-combined.img.gz` — 可直接刷写（Legacy BIOS）
- `openwrt-25.12.5-x86-64-generic-squashfs-combined-efi.img.gz` — 可直接刷写（UEFI）✅推荐
- `openwrt-25.12.5-x86-64-generic-ext4-combined(-efi).img.gz` — ext4 可写版
- 校验文件 `sha256sums` / 包清单 `*.manifest`

镜像已传至服务器 `F:\linux\firmware-1.0.0\`。

## 固件默认配置（v1.0.0）

| 项 | 值 |
|---|---|
| 基础分支 | 官方 OpenWrt 25.12.5 (x86_64) |
| 主机名 | 月月岛科技 |
| LAN | 192.168.21.1/24 |
| WiFi | yueyue-opwrt / opwrt |
| 后台 | root / root |
| 预装 | mwan3 多拨、luci-ssl、wireguard、首次登录向导 |
