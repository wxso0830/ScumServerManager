// LGSS Managers - Electron main process
// This file powers the desktop application. In the web preview (Linux container)
// Electron is NOT run; it is only used when the user packages and runs on Windows.
// To build a Windows .exe: `yarn add -D electron electron-builder is-elevated sudo-prompt`
// then run `yarn electron:build` (see /app/electron/README.md for details).

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, execFile } = require('child_process');
const os = require('os');

let mainWindow;

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
    // If dependencies not installed in dev, skip admin check
    console.warn('admin check skipped:', e.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 960,
    minWidth: 1100,
    minHeight: 680,
    backgroundColor: '#141512',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../frontend/build/index.html')}`;
  mainWindow.loadURL(startUrl);

  if (process.env.ELECTRON_START_URL) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(async () => {
  await requireAdminOrExit();
  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ---------- IPC: real OS operations ----------
ipcMain.handle('lgss:list-disks', async () => {
  if (os.platform() !== 'win32') {
    return []; // handled via backend psutil fallback on non-Windows
  }
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

// Start/Stop SCUM server via SteamCMD + SCUMServer.exe
// This assumes SteamCMD is available or user has already installed the server files.
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
