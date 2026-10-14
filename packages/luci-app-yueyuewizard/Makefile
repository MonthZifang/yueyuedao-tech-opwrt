include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-yueyuewizard
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_LICENSE:=MIT
PKG_MAINTAINER:=YUEYUEDAO TECH

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-yueyuewizard
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=月月岛科技 首次开机向导
  DEPENDS:=+luci-base +luci-lua-runtime +rpcd-mod-iwinfo +iwinfo
  PKGARCH:=all
endef

define Package/luci-app-yueyuewizard/description
 首次登录引导: 上联检测 / 组网方式 / 管理密码。月月岛科技企业路由固件组件。
endef

define Build/Compile
endef

define Package/luci-app-yueyuewizard/install
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/controller
	$(INSTALL_DATA) ./luasrc/controller/yueyuewizard.lua $(1)/usr/lib/lua/luci/controller/
	$(INSTALL_DIR) $(1)/usr/lib/lua/luci/view/yueyuewizard
	$(INSTALL_DATA) ./luasrc/view/yueyuewizard/wizard.htm $(1)/usr/lib/lua/luci/view/yueyuewizard/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-yueyuewizard.json $(1)/usr/share/rpcd/acl.d/
endef

$(eval $(call BuildPackage,luci-app-yueyuewizard))
