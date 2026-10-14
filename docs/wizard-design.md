# luci-app-yueyuewizard — 首次开机引导设计

品牌视觉：深青黑底 (#0F1A19 / #122220) + 薄荷绿主色 (#7fe7d2 / #2fbfa0)
玻璃拟态卡片 (#ffffff0d 边框 #ffffff1a) + 圆体标题 + JetBrains Mono 数字
参考：Mindustry Wiki 月月岛百科 / 月月岛博客

## 引导流程

1. **欢迎页** — 月月岛科技 logo/文字，固件版本
2. **上联检测** — 扫描周边 AP
   - 发现可用 AP → 默认自动连接（无线中继/WISP 作为上联）
   - 未发现 → 提示插网线 / 跳过
3. **组网方式二选一**
   - **A. 组网模式 (Mesh)**：
     - 自动扫描信道占用，为每个节点自动规划并分配信道（避免同频干扰）
     - 802.11s / batman-adv，统一 SSID
     - 设置 mesh 名称 + 密码
   - **B. 多网段模式 (VLAN 划分)**：
     - 创建多个子网（如 192.168.22.0/24、192.168.23.0/24…）
     - 每个网段独立 SSID + 独立密码 + 独立名称
     - 可设访客网络隔离
4. **管理设置** — 修改 root 密码（默认 root/root）
5. **完成** — 应用配置并重启网络，展示摘要

## 实现

- LuCI 菜单项 `admin/yueyue`，首次登录自动跳转（uci 标志位 yueyue.@wizard[0].done=0）
- 无线扫描: `iwinfo <dev> scan` / ubus call
- 信道规划: 扫描各信道 AP 数量/信号，选最空信道（1/6/11 2.4G；5G 取占用最低）
- Mesh: wpad-mesh + `option mesh '1'`，batman-adv 可选
- VLAN: switch_vlan + network 接口 + dhcp 独立池
- 全部操作走 uci batch + /etc/init.d/network reload
