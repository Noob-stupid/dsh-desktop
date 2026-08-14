// DSH GitHub Login —— 独立的 GitHub 可视化登录工具（零终端）
// 设备码流程在窗口（Chromium 渲染进程）内执行，与用户浏览器共用同一网络栈；
// 主进程只负责令牌落盘与 gh CLI 同步。
const { app, BrowserWindow, ipcMain, Menu, Tray, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

let win = null;
let tray = null;

function defaultDshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function githubAuthFile() {
  return path.join(defaultDshHome(), 'github-auth.json');
}

function ghHostsFile() {
  return path.join(os.homedir(), '.config', 'gh', 'hosts.yml');
}

function readAuthFile() {
  try {
    const data = JSON.parse(fs.readFileSync(githubAuthFile(), 'utf8'));
    if (data && typeof data.login === 'string' && typeof data.token === 'string') return data;
  } catch {}
  return null;
}

function writeAuthFile(record) {
  fs.mkdirSync(defaultDshHome(), { recursive: true });
  fs.writeFileSync(githubAuthFile(), JSON.stringify({
    login: record.login,
    token: record.token,
    scopes: record.scopes || [],
    savedAt: new Date().toISOString(),
  }, null, 2), 'utf8');
}

/** 把令牌合并进 gh 的 hosts.yml（行级手术：替换或追加 github.com 段）。 */
function mergeGhHosts(login, token) {
  const file = ghHostsFile();
  const lines = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const section = /^github\.com:\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (section.test(lines[i])) { start = i; break; }
  }
  if (start === -1) {
    if (lines.length && lines[lines.length - 1] !== '') lines.push('');
    lines.push('github.com:', `    oauth_token: ${token}`, `    user: ${login}`, '    git_protocol: https');
  } else {
    let end = start + 1;
    while (end < lines.length && /^\s/u.test(lines[end]) && lines[end].trim() !== '') end++;
    const block = ['github.com:', `    oauth_token: ${token}`, `    user: ${login}`, '    git_protocol: https'];
    lines.splice(start, end - start, ...block);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

function removeGhHostsSection() {
  const file = ghHostsFile();
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const section = /^github\.com:\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (section.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return;
  let end = start + 1;
  while (end < lines.length && /^\s/u.test(lines[end]) && lines[end].trim() !== '') end++;
  lines.splice(start, end - start);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
}

function githubSave(payload) {
  const token = typeof payload?.token === 'string' ? payload.token.trim() : '';
  if (!token) return { ok: false, error: '缺少令牌' };
  const login = typeof payload?.login === 'string' && payload.login ? payload.login : 'unknown';
  const scopes = Array.isArray(payload?.scopes) ? payload.scopes.filter((s) => typeof s === 'string') : [];
  writeAuthFile({ login, token, scopes });
  mergeGhHosts(login, token);
  refreshTrayMenu();
  return { ok: true, login };
}

function githubStatus() {
  const record = readAuthFile();
  if (record) return { loggedIn: true, login: record.login, scopes: record.scopes || [] };
  return { loggedIn: false, login: null, scopes: [] };
}

function githubLogout() {
  try { fs.rmSync(githubAuthFile(), { force: true }); } catch {}
  try { removeGhHostsSection(); } catch {}
  return { ok: true };
}

// ── 窗口 / 托盘（原生菜单标签用 ASCII，避免 Windows CJK 乱码）──────────────

function createWindow() {
  win = new BrowserWindow({
    width: 460,
    height: 520,
    resizable: false,
    autoHideMenuBar: true,
    title: 'GitHub Login',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 关闭沙箱以保证 <webview> 内嵌授权页在部分 Electron 版本上可靠渲染；
      // 页面只加载本地内容（CSP 限定），无外部内容注入面。
      sandbox: false,
      // 页面只加载本地内容（CSP 限定）；关闭同源校验让设备码流程
      // 直接走 Chromium 网络栈（与用户浏览器同通道）。
      webSecurity: false,
      // 授权页以 <webview> 内嵌在窗口里（带前进/后退/刷新）
      webviewTag: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'github-login.html'));
  win.on('closed', () => { win = null; });
}

function buildTrayMenu() {
  const record = readAuthFile();
  return Menu.buildFromTemplate([
    { label: 'Open login window', click: () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } else { createWindow(); } } },
    {
      label: record ? `GitHub: ${record.login} (click to log out)` : 'GitHub: login...',
      click: () => {
        if (readAuthFile()) {
          githubLogout();
          refreshTrayMenu();
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function refreshTrayMenu() {
  if (tray) tray.setContextMenu(buildTrayMenu());
}

function createTray() {
  try {
    tray = new Tray(path.join(__dirname, 'build', 'icon.png'));
    tray.setToolTip('DSH GitHub Login');
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
  } catch {}
}

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.handle('github:save', (_e, payload) => githubSave(payload));
ipcMain.handle('github:status', () => githubStatus());
ipcMain.handle('github:logout', () => githubLogout());
ipcMain.handle('github:openBrowser', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//u.test(url)) shell.openExternal(url);
  return { ok: true };
});

// ── 生命周期 ───────────────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
  // 关闭窗口时保持托盘常驻，登录状态随时可查；托盘 Quit 才退出。
  app.on('window-all-closed', () => {});
}
