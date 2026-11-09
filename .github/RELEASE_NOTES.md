## 方块小憩 · Block Breeze

没有倒计时的离线方块消除游戏，支持行列消除、连击计分、一步撤销、自动续局、明暗主题和中英文。

### 安装到 LanMind

1. 下载下方 Assets 中的 `.lmpk` 或 `-unsigned.zip`；支持源码 ZIP 的新版宿主也可直接下载 **Source code (zip)**。
2. 打开 LanMind → 系统设置 → 功能与插件 → 导入插件包。
3. 未签名包需阅读提示并确认安装，再点击「打开」。签名包兼容 LanMind 0.2.1；未签名 ZIP 需要新版宿主。

配置发布密钥时，同名 `.lmpk` 和 `.zip` 是完全相同的签名包；未配置时，自动生成无需密钥的 `-unsigned.zip`。所有 ZIP 均无需手动解压。

本项目无需构建，GitHub 源码 ZIP 可以直接导入新版宿主。它会明确标记为未签名并要求确认。

`SHA256SUMS.txt` 提供文件校验值，`plugin-release.json` 提供版本与下载地址，供后续 GitHub 下载导入功能使用。
