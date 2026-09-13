import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';

const isDev = process.env.NODE_ENV === 'development';
const DEV_URL = 'http://localhost:5273';

app.commandLine.appendSwitch('enable-unsafe-webgpu');
app.commandLine.appendSwitch('enable-features', 'Vulkan,WebGPU,UseSkiaRenderer');
app.commandLine.appendSwitch('use-angle', 'default');

// Present in step with the display. Uncapping the frame rate lets frames be
// presented mid-refresh, which tears and judders and reads as laggy mouse
// look even when the FPS counter is high. Vsync keeps delivery even.
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Raw, unaccelerated pointer deltas for pointer lock, so mouse look is not
// reshaped by the OS pointer-acceleration curve.
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
    if (isDev) win?.webContents.openDevTools({ mode: 'detach' });
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL(DEV_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

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
