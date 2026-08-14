// DeepSeek Harness 桌面客户端（Electron 主进程）
// 职责：独立窗口加载本地 DSH Web 界面；服务未启动时提供一键启动/停止；
// 系统托盘提供可视化 GitHub 登录（设备码流程，全程无需终端）。
const { app, BrowserWindow, ipcMain, Menu, Tray, shell } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');

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

// ── GitHub 可视化登录（Device Flow）─────────────────────────────────────────
// 复用 GitHub CLI 的公开 OAuth client_id；令牌写入 %DSH_HOME%/github-auth.json
// 并同步合并到 gh 的 hosts.yml（keyring 存在时 gh 仍以 keyring 优先）。
// 本机网络到 github.com 存在中间设备干扰，故用 node:https 且放宽证书校验
// （仅用于公开的登录/授权端点与用户信息查询）。

const GITHUB_CLIENT_ID = '178c6fc778ccc68e1d6a'; // GitHub CLI 的 OAuth client_id
const GITHUB_SCOPES = 'repo workflow gist read:org';
const GITHUB_UA = 'dsh-desktop/0.1 (local GitHub login)';
const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_URL = 'https://api.github.com/user';

let pendingDevice = null; // { deviceCode, userCode, verificationUri, interval, expiresAt }

function githubAuthFile() {
  return path.join(defaultDshHome(), 'github-auth.json');
}

function ghHostsFile() {
  return path.join(os.homedir(), '.config', 'gh', 'hosts.yml');
}

function httpsJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: options.method || 'GET',
      headers: {
        'user-agent': GITHUB_UA,
        accept: 'application/json',
        ...options.headers,
      },
      rejectUnauthorized: false,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(body); } catch {}
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(parsed?.error_description || parsed?.message || `GitHub 请求失败 (HTTP ${res.statusCode})`));
          return;
        }
        resolve({ status: res.statusCode, json: parsed, text: body });
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => req.destroy(new Error('GitHub 请求超时')));
    if (options.body) req.write(options.body);
    req.end();
  });
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

async function githubStart() {
  const res = await httpsJson(DEVICE_CODE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `client_id=${GITHUB_CLIENT_ID}&scope=${encodeURIComponent(GITHUB_SCOPES)}`,
  });
  const data = res.json || {};
  if (typeof data.device_code !== 'string' || typeof data.user_code !== 'string') {
    throw new Error('GitHub 设备码响应格式异常');
  }
  pendingDevice = {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: typeof data.verification_uri === 'string' ? data.verification_uri : 'https://github.com/login/device',
    interval: Math.max(Number(data.interval) || 5, 3),
    expiresAt: Date.now() + (Number(data.expires_in) || 900) * 1000,
  };
  return { userCode: pendingDevice.userCode, verificationUri: pendingDevice.verificationUri };
}

async function githubPoll() {
  const device = pendingDevice;
  if (!device) return { pending: false };
  if (Date.now() > device.expiresAt) {
    pendingDevice = null;
    throw new Error('验证码已过期，请重新发起登录');
  }
  const res = await httpsJson(ACCESS_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `client_id=${GITHUB_CLIENT_ID}&device_code=${encodeURIComponent(device.deviceCode)}&grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:device_code')}`,
  });
  const data = res.json || {};
  if (typeof data.access_token === 'string' && data.access_token) {
    const user = await httpsJson(USER_URL, {
      headers: { authorization: `Bearer ${data.access_token}` },
    });
    const login = user.json?.login || 'unknown';
    const scopes = String(data.scope || '').split(',').map((s) => s.trim()).filter(Boolean);
    writeAuthFile({ login, token: data.access_token, scopes });
    mergeGhHosts(login, data.access_token);
    pendingDevice = null;
    return { pending: false, ok: true, login, scopes };
  }
  if (data.error === 'authorization_pending') return { pending: true };
  if (data.error === 'slow_down') {
    device.interval += 5;
    return { pending: true };
  }
  if (data.error === 'expired_token') {
    pendingDevice = null;
    throw new Error('验证码已过期，请重新发起登录');
  }
  if (data.error === 'access_denied') {
    pendingDevice = null;
    throw new Error('授权被拒绝');
  }
  throw new Error(`授权失败：${data.error || '未知错误'}`);
}

async function githubStatus() {
  const record = readAuthFile();
  if (record) return { loggedIn: true, login: record.login, scopes: record.scopes || [] };
  return { loggedIn: false, login: null, scopes: [] };
}

function githubLogout() {
  pendingDevice = null;
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
ipcMain.handle('github:start', () => githubStart());
ipcMain.handle('github:poll', () => githubPoll());
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
