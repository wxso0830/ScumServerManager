// LGSS Managers - Electron main process
// Full standalone bundle: spawns portable MongoDB + PyInstaller-packaged backend
// + loads the React frontend. Zero dependencies on the target machine.

const { app, BrowserWindow, ipcMain, dialog, shell, globalShortcut } = require('electron');
// electron-updater is loaded lazily so the app still works if the module is
// missing (e.g., after a fresh clone where `npm install` was skipped).
let autoUpdater = null;
function getAutoUpdater() {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    return autoUpdater;
  } catch (e) {
    console.warn('[updater] electron-updater not available:', e.message);
    return null;
  }
}

// ---------- Compatibility switches for Windows Server / RDP / no-GPU hosts ----
// Servers (Windows Server 2019/2022) do not have full GPU drivers and Electron's
// default hardware-accelerated rendering crashes silently on them. We also see
// the same failure in some RDP sessions. Disabling GPU acceleration makes the
// renderer use a software path that works everywhere.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('no-sandbox');
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
function mongoDbPath() {
  // Use ProgramData (machine-wide writable dir) — avoids per-user % APPDATA
  // permission issues when the app runs elevated, and keeps DB in one place
  // across Windows user accounts.
  const dir = path.join(
    process.env.ProgramData || path.join('C:', 'ProgramData'),
    'LGSS Manager', 'mongo-db'
  );
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  return dir;
}

// ---------- Admin elevation ----------
async function requireAdminOrExit() {
  // In dev mode (run via `npm run dev` with ELECTRON_START_URL set), skip
  // elevation entirely — the mock disk/filesystem calls do not need admin.
  // Production installer sets `requestedExecutionLevel: requireAdministrator`
  // in package.json so Windows itself handles UAC for the packaged .exe.
  if (process.env.ELECTRON_START_URL) {
    console.log('[admin] dev mode — skipping admin elevation check');
    return;
  }
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
    throw new Error(
      'MongoDB binary bulunamadi. Kurulum paketinin icindeki mongod.exe eksik. ' +
      'Lutfen kurulumu yeniden yapin veya destek ile iletisime gecin.'
    );
  }

  const dbpath = mongoDbPath();
  const out = fs.openSync(path.join(logDir(), 'mongod.out.log'), 'a');
  const err = fs.openSync(path.join(logDir(), 'mongod.err.log'), 'a');

  console.log(`[mongo] spawning portable: ${mongod} --dbpath ${dbpath}`);
  updateSplash('MongoDB baslatiliyor...');

  mongodProcess = spawn(mongod, [
    '--dbpath', dbpath,
    '--port', String(MONGO_PORT),
    '--bind_ip', MONGO_HOST,
  ], { stdio: ['ignore', out, err], windowsHide: true });

  let earlyExitError = null;
  mongodProcess.on('exit', (code, sig) => {
    console.log(`[mongo] exited code=${code} sig=${sig}`);
    if (code !== 0 && code !== null) {
      earlyExitError = `mongod exit code ${code}. Olasi nedenler:\n` +
        `  - Visual C++ Redistributable eksik (kurulum sirasinda otomatik yuklenir)\n` +
        `  - CPU AVX desteklemiyor (MongoDB 4.4 kullaniliyor, olmamasi lazim)\n` +
        `  - ${dbpath} klasorune yazma izni yok\n` +
        `Detay: ${path.join(logDir(), 'mongod.err.log')}`;
    }
    mongodProcess = null;
  });
  mongodProcess.on('error', (e) => {
    console.error('[mongo] spawn error:', e.message);
    earlyExitError = `mongod baslatilamadi: ${e.message}`;
  });

  // wait up to 20s for mongod to listen
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (earlyExitError) throw new Error(earlyExitError);
    if (await isMongoReachable()) {
      console.log('[mongo] up and accepting connections');
      return;
    }
    await new Promise(r => setTimeout(r, 400));
  }
  throw new Error(
    'MongoDB 20 saniye icinde baslamadi.\n\n' +
    `Log dosyasi: ${path.join(logDir(), 'mongod.err.log')}\n` +
    'Cogu zaman Visual C++ Redistributable yuklu degilse bu hata olur.\n' +
    'Kurulum paketi VC++ yukler ama antivirus engellemis olabilir.'
  );
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

function killByImage(name) {
  // Belt-and-suspenders: kill any orphaned image of this name. Windows only.
  if (process.platform !== 'win32') return;
  try {
    execFile('taskkill', ['/f', '/t', '/im', name], () => {});
  } catch (_) {}
}

function shutdownChildren() {
  killChild(backendProcess, 'backend'); backendProcess = null;
  killChild(mongodProcess, 'mongo');    mongodProcess = null;
  // Also sweep by image name in case a previous run left an orphan running
  killByImage('lgss-backend.exe');
  killByImage('steamcmd.exe');
  killByImage('steamservice.exe');
}

// ---------- Splash (live status updates) ----------
function showSplash(status = 'Arka plan servisleri baslatiliyor...') {
  splashWindow = new BrowserWindow({
    width: 560, height: 340, frame: false, resizable: false, alwaysOnTop: true,
    backgroundColor: '#141512',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = `
  <html><head><style>
    body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#141512;color:#e7e2d6;
         display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;padding:0 24px;text-align:center}
    .logo{font-size:28px;font-weight:700;letter-spacing:2px;color:#c9a14a}
    .tag{margin-top:4px;color:#8e8878;font-size:11px;letter-spacing:3px}
    #status{margin-top:30px;color:#e7e2d6;font-size:13px;min-height:18px}
    #hint{margin-top:6px;color:#8e8878;font-size:11px;min-height:14px}
    .bar{margin-top:22px;width:380px;height:4px;background:#2a2721;border-radius:2px;overflow:hidden}
    .bar span{display:block;height:100%;width:40%;background:#c9a14a;animation:slide 1.3s infinite}
    @keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}
  </style></head><body>
    <div class="logo">LGSS MANAGER</div>
    <div class="tag">SCUM SERVER MANAGER v1.0.0</div>
    <div id="status">${status}</div>
    <div id="hint"></div>
    <div class="bar"><span></span></div>
    <script>
      window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'status') {
          document.getElementById('status').textContent = e.data.text || '';
          document.getElementById('hint').textContent = e.data.hint || '';
        }
      });
    </script>
  </body></html>`;
  splashWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
}

function updateSplash(text, hint = '') {
  if (!splashWindow || splashWindow.isDestroyed()) return;
  try {
    splashWindow.webContents.executeJavaScript(
      `postMessage({type:'status', text:${JSON.stringify(text)}, hint:${JSON.stringify(hint)}}, '*')`
    );
  } catch (_) {}
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
    icon: path.join(__dirname, 'installer', 'icon.ico'),
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
  showSplash('Yonetici ayricaliklari dogrulandi...');

  try {
    updateSplash('MongoDB kontrol ediliyor...');
    await spawnMongodIfNeeded();
    updateSplash('Backend baslatiliyor...', 'Python gomulu, ek kurulum gerekmez');
    spawnBackend();
    updateSplash('Backend hazir olmayi bekliyor...', 'Bu 10-30 saniye surebilir');
    await waitForBackend();
    updateSplash('Arayuz yukleniyor...');
  } catch (err) {
    closeSplash();
    dialog.showErrorBox(
      'Baslatma hatasi',
      `${err.message}\n\nLog klasoru: ${logDir()}`
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

// ---------- Auto-updater (GitHub releases) ----------
// Frontend calls window.lgss.checkForUpdates() from the "Manager Update" button.
// electron-updater is loaded lazily (see top of file) so missing node_modules
// does not crash the app.
function setupAutoUpdaterEvents() {
  const u = getAutoUpdater();
  if (!u) return;
  u.on('update-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lgss:update-event', { type: 'available', info });
    }
  });
  u.on('update-not-available', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lgss:update-event', { type: 'not-available', info });
    }
  });
  u.on('download-progress', (p) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lgss:update-event', { type: 'progress', progress: p });
    }
  });
  u.on('update-downloaded', (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lgss:update-event', { type: 'downloaded', info });
    }
  });
  u.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lgss:update-event', { type: 'error', message: err.message });
    }
  });
}
setupAutoUpdaterEvents();

ipcMain.handle('lgss:check-for-updates', async () => {
  const u = getAutoUpdater();
  if (!u) return { ok: false, error: 'electron-updater not installed', currentVersion: app.getVersion() };
  try {
    const result = await u.checkForUpdates();
    return {
      ok: true,
      currentVersion: app.getVersion(),
      latestVersion: result?.updateInfo?.version,
      updateAvailable: !!result?.updateInfo && result.updateInfo.version !== app.getVersion(),
    };
  } catch (e) {
    return { ok: false, error: e.message, currentVersion: app.getVersion() };
  }
});

ipcMain.handle('lgss:download-update', async () => {
  const u = getAutoUpdater();
  if (!u) return { ok: false, error: 'electron-updater not installed' };
  try { await u.downloadUpdate(); return { ok: true }; }
  catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('lgss:install-update', async () => {
  const u = getAutoUpdater();
  if (!u) return { ok: false, error: 'electron-updater not installed' };
  u.quitAndInstall(false, true);
  return { ok: true };
});

ipcMain.handle('lgss:get-version', async () => app.getVersion());
