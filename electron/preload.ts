import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Folder / File system
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path: string, content: string) => ipcRenderer.invoke('fs:writeFile', path, content),
  search: (dirPath: string, query: string) => ipcRenderer.invoke('fs:search', dirPath, query),
  watchFile: (path: string) => ipcRenderer.invoke('fs:watchFile', path),
  unwatchFile: (path: string) => ipcRenderer.invoke('fs:unwatchFile', path),
  onFileChanged: (cb: (filePath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, filePath: string) => cb(filePath)
    ipcRenderer.on('fs:fileChanged', handler)
    return () => ipcRenderer.removeListener('fs:fileChanged', handler)
  },
  watchDir: (path: string) => ipcRenderer.invoke('fs:watchDir', path),
  unwatchDir: (path: string) => ipcRenderer.invoke('fs:unwatchDir', path),
  onDirChanged: (cb: (dirPath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, dirPath: string) => cb(dirPath)
    ipcRenderer.on('fs:dirChanged', handler)
    return () => ipcRenderer.removeListener('fs:dirChanged', handler)
  },
  stat: (path: string) => ipcRenderer.invoke('fs:stat', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),

  // Store
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),

  // Theme
  setTheme: (mode: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set', mode),
  isDark: () => ipcRenderer.invoke('theme:isDark'),
})
