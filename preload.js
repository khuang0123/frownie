const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('frownie', {
  /** Tray menu commands: summon, debug, recalibrate, pause, resume. */
  onCommand: (callback) => ipcRenderer.on('frownie:command', (_event, name) => callback(name)),
  /** Shown as the tray tooltip, since the overlay itself can't be clicked. */
  setStatus: (status) => ipcRenderer.send('frownie:status', String(status)),
});
