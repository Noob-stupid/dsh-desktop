# DeepSeek Harness 桌面客户端（dsh-desktop）

用 Electron 把本地 DSH Web 界面（`http://127.0.0.1:3080`）包装成独立桌面应用，
内置"一键启动/停止 DSH 服务"和"可视化 GitHub 登录"。

## 功能

- 独立窗口打开 DSH 主界面，无浏览器工具栏；
- 服务未启动时显示离线页，自动尝试启动服务（`dsh web`），并展示服务日志；
- 由本应用启动的服务在关闭窗口时一并停止（外部已运行的服务不受影响）；
- 单实例：重复打开只聚焦已有窗口；
- **可视化 GitHub 登录**：系统托盘 → GitHub 登录，弹出登录窗口 → 设备码流程
  （打开浏览器输码授权），全程无需终端；
  - 令牌保存在 `~/.dsh/github-auth.json`，并同步合并进 gh 的 `~/.config/gh/hosts.yml`
    （keyring 存在时 gh 仍以 keyring 优先），登录后 `gh` 命令行立即可用；
  - 托盘菜单显示当前登录账号，点击可退出登录；
  - 复用 GitHub CLI 的公开 OAuth client_id（`178c6fc778ccc68e1d6a`），
    权限范围 `repo workflow gist read:org`。

## 开发

```sh
npm install        # 安装 electron + electron-builder（已配置国内镜像）
npm start          # 直接以 Electron 运行
npm run dist       # 打包为便携版单文件 exe（dist/DeepSeek-Harness-Desktop.exe）
node scripts/render-icon.mjs   # 重新生成应用图标（sharp）
```

## 打包产物

- `dist/DeepSeek-Harness-Desktop.exe`：便携版单文件应用，双击即用，无需安装。

## 服务启动方式（按优先级）

1. exe 同目录的 `dsh-desktop.config.json`（可选，`serverCommand` 为 argv 数组）；
2. 自动探测 npx 缓存中的 `@deepseek-ai/dsh`（`node <...>/lib/bin.js web`）；
3. 兜底 `npx --yes @deepseek-ai/dsh web`。

示例配置（与 exe 放在同一目录）：

```json
{ "serverCommand": ["node", "D:\\tools\\dsh\\lib\\bin.js", "web"] }
```
