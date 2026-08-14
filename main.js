// DeepSeek Harness 桌面客户端（Electron 主进程）
// 职责：独立窗口加载本地 DSH Web 界面；服务未启动时提供一键启动/停止；
// 系统托盘提供可视化 GitHub 登录（设备码流程，全程无需终端）。
const { app, BrowserWindow, ipcMain, Menu, Tray, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_URL = 'http://127.0.0.1:3080';
const PING_TIMEOUT_MS = 2500;
const POLL_INTERVAL_MS = 1500;

let win = null;
let serverChild = null;
let serverStartedByApp = false;
let pollTimer = null;
let tray = null;
let loginWin = null;
const logBuffer = [];

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function log(line) {
  const text = String(line).replace(/\s+$/, '');
  if (!text) return;
  logBuffer.push(text);
  if (logBuffer.length > 300) logBuffer.shift();
  send('dsh:log', text);
}

async function pingServer() {
  try {
    await fetch(SERVER_URL + '/', { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
    return true;
  } catch {
    return false;
  }
}

function defaultDshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

// ── GitHub 可视化登录 ───────────────────────────────────────────────────────
// 设备码流程在登录窗口（Chromium 渲染进程）内执行，与用户浏览器共用同一
// 网络栈；主进程只负责令牌落盘（%DSH_HOME%/github-auth.json）与 gh hosts.yml
// 同步（keyring 存在时 gh 仍以 keyring 优先）。

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

/** 登录窗口完成设备码流程后，把令牌交给主进程落盘。 */
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

async function githubStatus() {
  const record = readAuthFile();
  if (record) return { loggedIn: true, login: record.login, scopes: record.scopes || [] };
  return { loggedIn: false, login: null, scopes: [] };
}

function githubLogout() {
  try { fs.rmSync(githubAuthFile(), { force: true }); } catch {}
  try { removeGhHostsSection(); } catch {}
  return { ok: true };
}

// ── 登录窗口 ───────────────────────────────────────────────────────────────

function openLoginWindow() {
  if (loginWin && !loginWin.isDestroyed()) {
    loginWin.focus();
    return;
  }
  loginWin = new BrowserWindow({
    width: 440,
    height: 470,
    resizable: false,
    autoHideMenuBar: true,
    title: 'GitHub 登录',
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0e1116',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 登录窗口需要从 file:// 页面直接请求 github.com 完成设备码流程；
      // 页面只加载本地内容（CSP 限定），关闭同源校验换取与用户浏览器一致的网络通道。
      webSecurity: false,
    },
  });
  loginWin.loadFile(path.join(__dirname, 'renderer', 'github-login.html'));
  loginWin.on('closed', () => { loginWin = null; });
}

// ── 托盘 ───────────────────────────────────────────────────────────────────

function buildTrayMenu() {
  const record = readAuthFile();
  // 原生菜单在部分 Windows 上渲染 CJK 会乱码，标签统一使用 ASCII；
  // 中文文案放在 HTML 窗口（github-login.html / offline.html）中。
  return Menu.buildFromTemplate([
    { label: 'Show window', click: () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } } },
    {
      label: record ? `GitHub: ${record.login} (click to log out)` : 'GitHub: login...',
      click: () => {
        if (readAuthFile()) {
          githubLogout();
          refreshTrayMenu();
        } else {
          openLoginWindow();
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
    tray.setToolTip('DeepSeek Harness');
    tray.setContextMenu(buildTrayMenu());
    tray.on('click', () => { if (win && !win.isDestroyed()) { win.show(); win.focus(); } });
  } catch (error) {
    log('托盘创建失败: ' + error.message);
  }
}

// ── 应用菜单（登录入口始终可见，不依赖托盘）────────────────────────────────

function buildAppMenu() {
  // 同托盘：原生菜单用 ASCII 标签，避免 Windows 上 CJK 乱码。
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Reload', role: 'reload' },
        { label: 'Developer Tools', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: 'Quit', role: 'quit' },
      ],
    },
    {
      label: 'GitHub',
      submenu: [
        {
          label: 'Login / account...',
          click: () => openLoginWindow(),
        },
      ],
    },
  ]);
}

// ── 服务启停 ───────────────────────────────────────────────────────────────

// 解析启动 DSH 服务的方式（优先级：exe 旁配置文件 > npx 缓存里的 dsh > npx 兜底）
function findServerLaunch() {
  const cfgPath = path.join(path.dirname(process.execPath), 'dsh-desktop.config.json');
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (Array.isArray(cfg.serverCommand) && cfg.serverCommand.length) {
      return { kind: 'argv', argv: cfg.serverCommand };
    }
  } catch {}

  const cacheRoots = [];
  if (process.env.LOCALAPPDATA) cacheRoots.push(path.join(process.env.LOCALAPPDATA, 'npm-cache', '_npx'));
  cacheRoots.push('D:\\node_cache\\_npx');
  const hits = [];
  for (const root of cacheRoots) {
    if (!fs.existsSync(root)) continue;
    for (const dir of fs.readdirSync(root)) {
      const entry = path.join(root, dir, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js');
      if (fs.existsSync(entry)) hits.push(entry);
    }
  }
  if (hits.length) {
    hits.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return { kind: 'node', entry: hits[0] };
  }
  return { kind: 'npx' };
}

function startServer() {
  if (serverChild) return { ok: true, alreadyRunning: true };
  const plan = findServerLaunch();
  const env = { ...process.env, DSH_HOME: defaultDshHome() };
  let child;
  if (plan.kind === 'node') {
    log(`启动: node "${plan.entry}" web`);
    child = spawn('node', [plan.entry, 'web'], { windowsHide: true, env, cwd: path.dirname(plan.entry) });
  } else if (plan.kind === 'argv') {
    log(`启动: ${plan.argv.join(' ')}`);
    child = spawn(plan.argv[0], plan.argv.slice(1), { windowsHide: true, env, cwd: os.homedir() });
  } else {
    log('启动: npx --yes @deepseek-ai/dsh web');
    child = spawn('cmd.exe', ['/c', 'npx --yes @deepseek-ai/dsh web'], { windowsHide: true, env, cwd: os.homedir() });
  }
  serverStartedByApp = true;
  serverChild = child;
  if (child.stdout) child.stdout.on('data', (b) => log(b.toString()));
  if (child.stderr) child.stderr.on('data', (b) => log(b.toString()));
  child.on('exit', (code) => {
    log(`DSH 服务进程已退出 (code=${code})`);
    if (serverChild === child) serverChild = null;
  });
  child.on('error', (err) => log('启动失败: ' + err.message));
  return { ok: true };
}

function stopServer() {
  const child = serverChild;
  if (!child) return { ok: true };
  serverChild = null;
  log('正在停止 DSH 服务…');
  try { child.kill(); } catch {}
  spawn('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
  return { ok: true };
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (await pingServer()) {
      stopPolling();
      send('dsh:status', 'up');
      if (win && !win.isDestroyed()) win.loadURL(SERVER_URL);
    }
  }, POLL_INTERVAL_MS);
}

function showOffline(status) {
  if (!win || win.isDestroyed()) return;
  win.loadFile(path.join(__dirname, 'renderer', 'offline.html')).then(() => {
    send('dsh:status', status);
    for (const line of logBuffer) send('dsh:log', line);
    if (status === 'down') startPolling();
  });
}

async function boot() {
  const up = await pingServer();
  if (up) {
    send('dsh:status', 'up');
    win.loadURL(SERVER_URL);
  } else {
    showOffline('down');
    // 服务未启动：自动尝试启动，方便双击即用
    setTimeout(() => {
      if (win && !win.isDestroyed() && win.webContents.getURL().includes('offline.html')) {
        startServer();
      }
    }, 1200);
  }
}

// ── IPC ────────────────────────────────────────────────────────────────────

ipcMain.handle('dsh:check', async () => await pingServer());
ipcMain.handle('dsh:start', () => startServer());
ipcMain.handle('dsh:stop', () => stopServer());
ipcMain.handle('github:save', (_e, payload) => githubSave(payload));
ipcMain.handle('github:status', () => githubStatus());
ipcMain.handle('github:logout', () => githubLogout());
ipcMain.handle('github:openBrowser', (_e, url) => {
  if (typeof url === 'string' && /^https:\/\//u.test(url)) shell.openExternal(url);
  return { ok: true };
});
ipcMain.handle('github:openLoginWindow', () => {
  openLoginWindow();
  return { ok: true };
});

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: false,
    icon: path.join(__dirname, 'build', 'icon.png'),
    backgroundColor: '#0e1116',
    title: 'DeepSeek Harness',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.on('did-fail-load', (_e, _code, _desc, url, isMainFrame) => {
    if (isMainFrame && url.startsWith(SERVER_URL)) showOffline('down');
  });
  win.webContents.on('did-finish-load', () => {
    if (win.webContents.getURL().startsWith(SERVER_URL)) send('dsh:status', 'up');
  });
  win.on('closed', () => { win = null; });
}

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
  app.on('before-quit', () => {
    if (serverStartedByApp && serverChild) {
      try { serverChild.kill(); } catch {}
      spawn('taskkill.exe', ['/pid', String(serverChild.pid), '/T', '/F'], { windowsHide: true });
    }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(buildAppMenu());
    createWindow();
    createTray();
    boot();
  });
  app.on('window-all-closed', () => app.quit());
}
