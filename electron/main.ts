import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';

const DEV_URL = 'http://localhost:5273';

if (!app) {
  console.error(
    [
      '',
      'Zombie Survival cannot start: the Electron APIs are unavailable.',
      '',
      'ELECTRON_RUN_AS_NODE is set in this environment, which makes the',
      'electron binary run as plain Node.js. The app then has no window and',
      'exits immediately.',
      '',
      'Fix it in the shell you launch from:',
      '  PowerShell:  Remove-Item Env:ELECTRON_RUN_AS_NODE',
      '  cmd.exe:     set ELECTRON_RUN_AS_NODE=',
      '  bash:        unset ELECTRON_RUN_AS_NODE',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

app.commandLine.appendSwitch('use-angle', 'default');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-blink-features', 'PointerLockOptions');

app.disableDomainBlockingFor3DAPIs();

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0d0a',
    title: 'Zombie Survival',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      webgl: true,
    },
  });

  win.removeMenu();
  win.once('ready-to-show', () => {
    win?.show();
    win?.webContents.openDevTools({ mode: 'detach' });
  });

  win.webContents.once('did-finish-load', () => {
    if (win && !win.isVisible()) win.show();
  });

  win.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`renderer failed to load (${code} ${description}): ${url}`);
    win?.show();
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`renderer process gone: ${details.reason} (exitCode ${details.exitCode})`);
    if (win && !win.isDestroyed()) win.reload();
  });

  win.on('unresponsive', () => {
    console.error('renderer became unresponsive; reloading');
    if (win && !win.isDestroyed()) win.reload();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  void win.loadURL(DEV_URL);

  win.on('closed', () => {
    win = null;
  });
}

ipcMain.handle('app:quit', () => app.quit());
ipcMain.handle('app:toggleFullscreen', () => {
  if (!win) return false;
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  return next;
});
ipcMain.handle('app:getInfo', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  platform: process.platform,
}));

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
