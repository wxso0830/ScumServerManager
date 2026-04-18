// LGSS Managers - Electron main process
// Packages the full stack: spawns Python FastAPI backend, loads the
// React frontend build, and exposes native OS + SteamCMD capabilities
// to the renderer via preload IPC.

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execFile } = require('child_process');
const os = require('os');

let mainWindow;
let backendProcess = null;
let splashWindow = null;
const BACKEND_PORT = Number(process.env.BACKEND_PORT || 8001);
const BACKEND_HOST = '127.0.0.1';
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;

// ---------- Admin elevation ----------
async function requireAdminOrExit() {
  try {
    const isElevated = (await import('is-elevated')).default;
    const elevated = await isElevated();
    if (!elevated) {
      const result = dialog.showMessageBoxSync({
        type: 'question',
        title: 'Yönetici olarak çalıştır',
        message: 'Bu uygulama, TÜM işlevlere erişim için yönetici ayrıcalıklarına ihtiyaç duyar. Yönetici olarak çalıştırmak ister misiniz?',
        buttons: ['Evet', 'Hayır'],
        defaultId: 0,
        cancelId: 1,
      });
      if (result === 0) {
        const sudo = require('sudo-prompt');
        const exe = process.execPath;
        const args = process.argv.slice(1).join(' ');
        sudo.exec(`"${exe}" ${args}`, { name: 'LGSS Managers' }, () => {});
        app.exit(0);
      } else {
        app.exit(0);
      }
    }
  } catch (e) {
    console.warn('admin check skipped:', e.message);
  }
}

// ---------- Backend auto-spawn ----------
function getBackendDir() {
  // Packaged app: resources/backend/  |  Dev: ../backend
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend');
  }
  return path.join(__dirname, '..', 'backend');
}

function getPythonExecutable() {
  // Priority: explicit env -> venv in backend/ -> system python
  if (process.env.LGSS_PYTHON) return process.env.LGSS_PYTHON;

  const backendDir = getBackendDir();
  const winVenv = path.join(backendDir, '.venv', 'Scripts', 'python.exe');
  const unixVenv = path.join(backendDir, '.venv', 'bin', 'python');
  if (fs.existsSync(winVenv)) return winVenv;
  if (fs.existsSync(unixVenv)) return unixVenv;

  return process.platform === 'win32' ? 'python.exe' : 'python3';
}

function getUserDataDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function waitForBackend(timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`${BACKEND_URL}/api/`, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(1500, () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) return reject(new Error('Backend hazır olmadı (45s timeout)'));
      setTimeout(tick, 700);
    };
    tick();
  });
}

function spawnBackend() {
  if (backendProcess) return;
  const backendDir = getBackendDir();
  const python = getPythonExecutable();

  if (!fs.existsSync(backendDir)) {
    throw new Error(`Backend klasörü bulunamadı: ${backendDir}`);
  }

  const logDir = getUserDataDir();
  const outLog = fs.openSync(path.join(logDir, 'backend.out.log'), 'a');
  const errLog = fs.openSync(path.join(logDir, 'backend.err.log'), 'a');

  const args = [
    '-m', 'uvicorn',
    'server:app',
    '--host', BACKEND_HOST,
    '--port', String(BACKEND_PORT),
  ];

  console.log(`[backend] spawning: ${python} ${args.join(' ')} (cwd=${backendDir})`);

  backendProcess = spawn(python, args, {
    cwd: backendDir,
    stdio: ['ignore', outLog, errLog],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      MONGO_URL: process.env.MONGO_URL || 'mongodb://localhost:27017',
      DB_NAME: process.env.DB_NAME || 'lgss_manager',
      CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
    },
    windowsHide: true,
    detached: false,
  });

  backendProcess.on('exit', (code, signal) => {
    console.log(`[backend] exited code=${code} signal=${signal}`);
    backendProcess = null;
  });

  backendProcess.on('error', (err) => {
    console.error('[backend] spawn error:', err.message);
  });
}

function killBackend() {
  if (!backendProcess) return;
  try {
    if (process.platform === 'win32') {
      // Ensure child tree is killed on Windows
      execFile('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
    } else {
      backendProcess.kill('SIGTERM');
    }
  } catch (e) {
    console.warn('[backend] kill failed:', e.message);
  }
  backendProcess = null;
}

// ---------- Splash (while backend boots) ----------
function showSplash() {
  splashWindow = new BrowserWindow({
    width: 520,
    height: 300,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    transparent: false,
    backgroundColor: '#141512',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = `
  <html><head><style>
    body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#141512;color:#e7e2d6;
         display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh}
    .logo{font-size:28px;font-weight:700;letter-spacing:2px;color:#c9a14a}
    .sub{margin-top:10px;color:#8e8878;font-size:13px}
    .bar{margin-top:26px;width:320px;height:4px;background:#2a2721;border-radius:2px;overflow:hidden}
    .bar span{display:block;height:100%;width:40%;background:#c9a14a;animation:slide 1.3s infinite}
    @keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}
  </style></head><body>
    <div class="logo">LGSS MANAGER</div>
    <div class="sub">Arka plan servisleri başlatılıyor...</div>
    <div class="bar"><span></span></div>
  </body></html>`;
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

// ---------- Main window ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#141512',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL
    || `file://${path.join(__dirname, '..', 'frontend', 'build', 'index.html')}`;
  mainWindow.loadURL(startUrl);

  mainWindow.once('ready-to-show', () => {
    closeSplash();
    mainWindow.show();
  });

  if (process.env.ELECTRON_START_URL) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ---------- App lifecycle ----------
app.whenReady().then(async () => {
  await requireAdminOrExit();
  showSplash();

  try {
    spawnBackend();
    await waitForBackend();
  } catch (err) {
    closeSplash();
    dialog.showErrorBox(
      'Backend başlatılamadı',
      `${err.message}\n\nPython 3.11+ kurulu olduğundan ve backend klasöründe requirements-minimal.txt paketlerinin yüklü olduğundan emin olun.\n\nLog: ${getUserDataDir()}`
    );
    app.exit(1);
    return;
  }

  createWindow();
});

app.on('before-quit', killBackend);
app.on('window-all-closed', () => {
  killBackend();
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---------- IPC: real OS operations ----------
ipcMain.handle('lgss:list-disks', async () => {
  if (os.platform() !== 'win32') return [];
  return new Promise((resolve, reject) => {
    execFile('wmic', ['logicaldisk', 'get', 'caption,freespace,size,filesystem,drivetype'], (err, stdout) => {
      if (err) return reject(err);
      const lines = stdout.trim().split(/\r?\n/).slice(1).filter(Boolean);
      const disks = lines.map((line) => {
        const parts = line.trim().split(/\s+/);
        const [caption, drivetype, filesystem, freespace, size] = parts;
        const total = parseInt(size || '0', 10);
        const free = parseInt(freespace || '0', 10);
        if (!total) return null;
        return {
          device: caption,
          mountpoint: caption + '\\',
          fstype: filesystem || 'NTFS',
          total_gb: +(total / 1024 ** 3).toFixed(2),
          used_gb: +((total - free) / 1024 ** 3).toFixed(2),
          free_gb: +(free / 1024 ** 3).toFixed(2),
          percent_used: +(((total - free) / total) * 100).toFixed(1),
          eligible: free / 1024 ** 3 >= 30,
          label: caption,
        };
      }).filter(Boolean);
      resolve(disks);
    });
  });
});

ipcMain.handle('lgss:create-folder', async (_evt, folderPath) => {
  fs.mkdirSync(folderPath, { recursive: true });
  return { ok: true, path: folderPath };
});

ipcMain.handle('lgss:open-folder', async (_evt, folderPath) => {
  await shell.openPath(folderPath);
  return { ok: true };
});

ipcMain.handle('lgss:install-server', async (_evt, { folderPath, appId = '3792580' }) => {
  const steamcmd = process.env.STEAMCMD_PATH || 'steamcmd.exe';
  fs.mkdirSync(folderPath, { recursive: true });
  return new Promise((resolve, reject) => {
    const args = [
      '+force_install_dir', `"${folderPath}"`,
      '+login', 'anonymous',
      '+app_update', String(appId), 'validate',
      '+quit',
    ];
    const child = spawn(steamcmd, args, { shell: true });
    let buf = '';
    child.stdout.on('data', (d) => { buf += d.toString(); });
    child.stderr.on('data', (d) => { buf += d.toString(); });
    child.on('close', (code) => {
      if (code === 0) resolve({ ok: true, log: buf });
      else reject(new Error(`SteamCMD exited with code ${code}: ${buf.slice(-500)}`));
    });
  });
});

ipcMain.handle('lgss:write-config-files', async (_evt, plan) => {
  const { config_dir, files } = plan;
  fs.mkdirSync(config_dir, { recursive: true });
  for (const f of files) fs.writeFileSync(f.path, f.content, 'utf-8');
  return { ok: true, written: files.length };
});

ipcMain.handle('lgss:start-server', async (_evt, { serverFolder, port, queryPort, maxPlayers }) => {
  const exe = path.join(serverFolder, 'SCUM', 'Binaries', 'Win64', 'SCUMServer.exe');
  if (!fs.existsSync(exe)) return { ok: false, error: `SCUMServer.exe not found at ${exe}` };
  const child = spawn(exe, [
    `-log`,
    `-port=${port || 7042}`,
    `-QueryPort=${queryPort || 7043}`,
    `-MaxPlayers=${maxPlayers || 64}`,
  ], { detached: true, stdio: 'ignore', cwd: path.dirname(exe) });
  child.unref();
  return { ok: true, pid: child.pid };
});

ipcMain.handle('lgss:stop-server', async (_evt, { pid }) => {
  try { process.kill(pid); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
});

// Backend status + log path exposure (for diagnostics in UI)
ipcMain.handle('lgss:backend-info', async () => ({
  running: !!backendProcess,
  url: BACKEND_URL,
  logsDir: getUserDataDir(),
}));
