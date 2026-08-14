const statusEl = document.getElementById('status');
const logEl = document.getElementById('log');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnCheck = document.getElementById('btn-check');
const btnGithub = document.getElementById('btn-github');

function setStatus(text, cls) {
  statusEl.textContent = text;
  statusEl.className = 'status ' + cls;
}

function appendLog(line) {
  logEl.textContent += line + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

window.dshDesktop.onStatus((s) => {
  if (s === 'up') setStatus('服务已连接，正在进入主界面…', 'status-up');
  else if (s === 'starting') setStatus('正在启动 DSH 服务…', 'status-mid');
  else setStatus('本地 DSH 服务未运行', 'status-down');
});

window.dshDesktop.onLog(appendLog);

btnStart.addEventListener('click', async () => {
  setStatus('正在启动 DSH 服务…', 'status-mid');
  btnStart.disabled = true;
  await window.dshDesktop.start();
});

btnStop.addEventListener('click', async () => {
  setStatus('正在停止服务…', 'status-mid');
  btnStop.disabled = true;
  await window.dshDesktop.stop();
  btnStop.disabled = false;
  setStatus('本地 DSH 服务未运行', 'status-down');
});

btnCheck.addEventListener('click', async () => {
  setStatus('正在检测…', 'status-mid');
  const up = await window.dshDesktop.check();
  setStatus(up ? '服务已连接，正在进入主界面…' : '本地 DSH 服务未运行', up ? 'status-up' : 'status-down');
  if (!up) btnStart.disabled = false;
});

btnGithub.addEventListener('click', async () => {
  await window.dshDesktop.githubOpenLoginWindow();
});
