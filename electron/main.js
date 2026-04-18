// LGSS Managers - Electron main process
// Full standalone bundle: spawns portable MongoDB + PyInstaller-packaged backend
// + loads the React frontend. Zero dependencies on the target machine.

const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn, execFile } = require('child_process');
const os = require('os');

let mainWindow;
let splashWindow = null;
let backendProcess = null;
let mongodProcess = null;

const BACKEND_PORT = Number(process.env.BACKEND_PORT || 8001);
const BACKEND_HOST = '127.0.0.1';
const BACKEND_URL = `http://${BACKEND_HOST}:${BACKEND_PORT}`;
const MONGO_PORT = 27017;
const MONGO_HOST = '127.0.0.1';

function getResourcesBase() {
  // Packaged: files are under process.resourcesPath
  // Dev: files are under project root
  if (app.isPackaged) return process.resourcesPath;
  return path.join(__dirname, '..');
}

function getUserDataDir(sub = 'logs') {
  const dir = path.join(app.getPath('userData'), sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logDir() { return getUserDataDir('logs'); }
function mongoDbPath() { return getUserDataDir('mongo-db'); }

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

// ---------- MongoDB portable spawn ----------
function getMongodExe() {
  const base = getResourcesBase();
  // Packaged layout:  resources/mongodb/bin/mongod.exe
  // Dev layout:       ../mongodb/bin/mongod.exe  OR system mongod
  const bundled = path.join(base, 'mongodb', 'bin', 'mongod.exe');
  if (fs.existsSync(bundled)) return bundled;
  return null; // caller falls back to system service
}

async function isMongoReachable() {
  return new Promise((resolve) => {
    const sock = require('net').createConnection({ host: MONGO_HOST, port: MONGO_PORT });
    sock.setTimeout(800);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
    sock.once('error', () => resolve(false));
  });
}

async function spawnMongodIfNeeded() {
  if (await isMongoReachable()) {
    console.log('[mongo] existing mongod detected on 27017, reusing.');
    return;
  }
  const mongod = getMongodExe();
  if (!mongod) {
    console.warn('[mongo] no bundled mongod.exe and no system mongo service.');
    return; // backend will error; user will see message
  }

  const dbpath = mongoDbPath();
  const out = fs.openSync(path.join(logDir(), 'mongod.out.log'), 'a');
  const err = fs.openSync(path.join(logDir(), 'mongod.err.log'), 'a');

  console.log(`[mongo] spawning portable: ${mongod} --dbpath ${dbpath}`);
  mongodProcess = spawn(mongod, [
    '--dbpath', dbpath,
    '--port', String(MONGO_PORT),
    '--bind_ip', MONGO_HOST,
  ], { stdio: ['ignore', out, err], windowsHide: true });

  mongodProcess.on('exit', (code, sig) => {
    console.log(`[mongo] exited code=${code} sig=${sig}`);
    mongodProcess = null;
  });

  // wait up to 15s for mongod to listen
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (await isMongoReachable()) return;
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error('MongoDB 15sn içinde başlamadı. mongod.err.log kontrol edin.');
}

// ---------- Backend spawn (PyInstaller in prod, venv in dev) ----------
function getBackendCommand() {
  const base = getResourcesBase();

  // Packaged: resources/backend/lgss-backend.exe  (PyInstaller frozen)
  const frozenExe = path.join(base, 'backend', 'lgss-backend.exe');
  if (fs.existsSync(frozenExe)) return { cmd: frozenExe, args: [], cwd: path.dirname(frozenExe) };

  // Dev: use venv python -m uvicorn
  const backendDir = path.join(base, 'backend');
  const winVenv = path.join(backendDir, '.venv', 'Scripts', 'python.exe');
  const python = fs.existsSync(winVenv) ? winVenv
    : (process.env.LGSS_PYTHON || (process.platform === 'win32' ? 'python.exe' : 'python3'));

  return {
    cmd: python,
    args: ['-m', 'uvicorn', 'server:app', '--host', BACKEND_HOST, '--port', String(BACKEND_PORT)],
    cwd: backendDir,
  };
}

function waitForBackend(timeoutMs = 60000) {
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
      if (Date.now() > deadline) return reject(new Error('Backend hazır olmadı (60s timeout)'));
      setTimeout(tick, 700);
    };
    tick();
  });
}

function spawnBackend() {
  if (backendProcess) return;
  const { cmd, args, cwd } = getBackendCommand();
  if (!fs.existsSync(cwd)) throw new Error(`Backend klasörü bulunamadı: ${cwd}`);

  const out = fs.openSync(path.join(logDir(), 'backend.out.log'), 'a');
  const err = fs.openSync(path.join(logDir(), 'backend.err.log'), 'a');

  console.log(`[backend] spawning: ${cmd} ${args.join(' ')} (cwd=${cwd})`);

  backendProcess = spawn(cmd, args, {
    cwd,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
      MONGO_URL: process.env.MONGO_URL || `mongodb://${MONGO_HOST}:${MONGO_PORT}`,
      DB_NAME: process.env.DB_NAME || 'lgss_manager',
      CORS_ORIGINS: process.env.CORS_ORIGINS || '*',
      PORT: String(BACKEND_PORT),
      HOST: BACKEND_HOST,
    },
    windowsHide: true,
    detached: false,
  });

  backendProcess.on('exit', (code, sig) => {
    console.log(`[backend] exited code=${code} sig=${sig}`);
    backendProcess = null;
  });
  backendProcess.on('error', (e) => console.error('[backend] error:', e.message));
}

function killChild(proc, name) {
  if (!proc) return;
  try {
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(proc.pid), '/f', '/t']);
    } else {
      proc.kill('SIGTERM');
    }
  } catch (e) { console.warn(`[${name}] kill failed:`, e.message); }
}

function shutdownChildren() {
  killChild(backendProcess, 'backend'); backendProcess = null;
  killChild(mongodProcess, 'mongo');    mongodProcess = null;
}

// ---------- Splash ----------
function showSplash(status = 'Arka plan servisleri başlatılıyor...') {
  splashWindow = new BrowserWindow({
    width: 520, height: 300, frame: false, resizable: false, alwaysOnTop: true,
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
    <div class="sub">${status}</div>
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
    width: 1600, height: 960, minWidth: 1100, minHeight: 680,
    backgroundColor: '#141512', show: false,
    title: 'LGSS Manager',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);

  const startUrl = process.env.ELECTRON_START_URL
    || `file://${path.join(getResourcesBase(), 'frontend', 'build', 'index.html')}`;

  // Retry load until the dev server (or file) is reachable
  let loadAttempts = 0;
  const tryLoad = () => {
    loadAttempts += 1;
    mainWindow.loadURL(startUrl).catch((err) => {
      console.warn(`[window] loadURL failed (attempt ${loadAttempts}): ${err.message}`);
      if (loadAttempts < 30) setTimeout(tryLoad, 1500);
    });
  };
  tryLoad();

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.warn(`[window] did-fail-load ${code} ${desc} ${url}`);
    if (loadAttempts < 30) setTimeout(tryLoad, 1500);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[window] did-finish-load');
    closeSplash();
    mainWindow.show();
  });

  mainWindow.once('ready-to-show', () => { closeSplash(); mainWindow.show(); });
  if (process.env.ELECTRON_START_URL) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// ---------- Lifecycle ----------
app.whenReady().then(async () => {
  await requireAdminOrExit();
  showSplash();

  try {
    await spawnMongodIfNeeded();
    spawnBackend();
    await waitForBackend();
  } catch (err) {
    closeSplash();
    dialog.showErrorBox(
      'Başlatma hatası',
      `${err.message}\n\nLog klasörü: ${logDir()}`
    );
    shutdownChildren();
    app.exit(1);
    return;
  }

  createWindow();

  // Enable DevTools & reload shortcuts (normally gone because we hide the menu)
  globalShortcut.register('F12', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.toggleDevTools();
    }
  });
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.toggleDevTools();
    }
  });
  globalShortcut.register('CommandOrControl+R', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload();
    }
  });
});

app.on('will-quit', () => {
  try { globalShortcut.unregisterAll(); } catch (_) {}
});

app.on('before-quit', shutdownChildren);
app.on('window-all-closed', () => { shutdownChildren(); if (process.platform !== 'darwin') app.quit(); });
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

ipcMain.handle('lgss:backend-info', async () => ({
  running: !!backendProcess,
  url: BACKEND_URL,
  logsDir: logDir(),
  mongoRunning: !!mongodProcess || (await isMongoReachable()),
}));
