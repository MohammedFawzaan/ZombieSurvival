import { contextBridge, ipcRenderer } from 'electron';

const api = {
  quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
  toggleFullscreen: (): Promise<boolean> => ipcRenderer.invoke('app:toggleFullscreen'),
  getInfo: (): Promise<{
    version: string;
    electron: string;
    chrome: string;
    platform: string;
  }> => ipcRenderer.invoke('app:getInfo'),
};

contextBridge.exposeInMainWorld('desktop', api);

export type DesktopApi = typeof api;
