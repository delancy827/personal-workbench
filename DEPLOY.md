# 让手机在电脑关机时访问

这个项目是纯静态前端，部署到任意静态托管后就不再依赖电脑。推荐 GitHub Pages；Cloudflare Pages、Netlify 也可以直接使用同一目录。

## GitHub Pages（推荐）

1. 在 GitHub 新建一个私有仓库，例如 `personal-workbench`。
2. 上传 `gist-sync` 目录中的全部文件，确保 `index.html` 位于仓库根目录。
3. 打开仓库 `Settings -> Pages`，选择 `Deploy from a branch`、`main`、`/(root)`，保存。
4. 等待部署完成，用 iPhone Safari 打开 GitHub Pages 地址，再点“分享 -> 添加到主屏幕”。

也可以用 GitHub Desktop 或 `git` 上传，项目不需要 Node、构建步骤或后端服务器。

## 发布前检查

- 访问地址必须是 `https://`，Service Worker 和“添加到主屏幕”的完整 PWA 能力才会启用。
- 第一次打开后，在设置中填入新的 GitHub Token 和现有 Gist ID，再手动测试连接。
- Token 只保存在当前浏览器的 `localStorage`，不要写入 HTML、仓库、截图或 issue。
- 你在交接信息里暴露的旧 Token 必须在 GitHub 立即撤销并 regenerate；建议新 Token 仅授予 `gist` 权限。

## 离线行为

首次在线打开后，页面、脚本和图标会缓存到设备。电脑关机或暂时断网时仍可打开和编辑本地数据；“立即上传/立即下载”需要网络，仍然保持手动触发，不会自动同步。
