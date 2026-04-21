import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Folder / File system
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  onOpenExternal: (cb: (filePath: string) => void) => {
    const handler = (_e: Electron.IpcRendererEvent, filePath: string) => cb(filePath)
    ipcRenderer.on('file:openExternal', handler)
    return () => ipcRenderer.removeListener('file:openExternal', handler)
  },
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  readFileBinary: (path: string) => ipcRenderer.invoke('fs:readFileBinary', path),
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
  copyImageToDir: (srcPath: string, destDir: string) => ipcRenderer.invoke('fs:copyImageToDir', srcPath, destDir),
  listImages: (dirPath: string) => ipcRenderer.invoke('fs:listImages', dirPath),
  listVideos: (dirPath: string) => ipcRenderer.invoke('fs:listVideos', dirPath),
  collectTags: (dirPath: string) => ipcRenderer.invoke('fs:collectTags', dirPath),
  collectLinks: (dirPath: string) => ipcRenderer.invoke('fs:collectLinks', dirPath),
  findFile: (dirPath: string, name: string) => ipcRenderer.invoke('fs:findFile', dirPath, name),
  listMdFiles: (dirPath: string) => ipcRenderer.invoke('fs:listMdFiles', dirPath),
  createFile: (filePath: string, content?: string) => ipcRenderer.invoke('fs:createFile', filePath, content ?? ''),
  renameFile: (oldPath: string, newName: string) => ipcRenderer.invoke('fs:rename', oldPath, newName),
  deleteFile: (filePath: string) => ipcRenderer.invoke('fs:deleteFile', filePath),
  copyFileToDir: (srcPath: string, destDir: string) => ipcRenderer.invoke('fs:copyFileToDir', srcPath, destDir),
  move: (srcPath: string, destDir: string) => ipcRenderer.invoke('fs:move', srcPath, destDir),
  createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
  saveFolder: () => ipcRenderer.invoke('dialog:saveFolder'),
  cloneFolder: () => ipcRenderer.invoke('dialog:cloneFolder'),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showItemInFolder', path),
  openTerminal: (path: string) => ipcRenderer.invoke('shell:openTerminal', path),
  detectIDEs: () => ipcRenderer.invoke('shell:detectIDEs'),
  openInIDE: (ideCmd: string, dirPath: string) => ipcRenderer.invoke('shell:openInIDE', ideCmd, dirPath),
  detectClaude: () => ipcRenderer.invoke('shell:detectClaude'),
  openClaude: (dirPath: string, skipPerms: boolean) => ipcRenderer.invoke('shell:openClaude', dirPath, skipPerms),
  openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
  openInObsidian: (path: string) => ipcRenderer.invoke('shell:openInObsidian', path),
  startDrag: (filePath: string) => ipcRenderer.send('native:startDrag', filePath),
  copyImageToClipboard: (filePath: string) => ipcRenderer.invoke('clipboard:copyImage', filePath),
  registerMdAssociation: () => ipcRenderer.invoke('shell:registerMdAssociation'),

  // File path from dropped File object
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  // Git
  gitIsRepo: (cwd: string) => ipcRenderer.invoke('git:isRepo', cwd),
  gitClone: (url: string, destDir: string) => ipcRenderer.invoke('git:clone', url, destDir),
  gitInit: (cwd: string) => ipcRenderer.invoke('git:init', cwd),
  gitStatus: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
  gitBranch: (cwd: string) => ipcRenderer.invoke('git:branch', cwd),
  gitStage: (cwd: string, file: string) => ipcRenderer.invoke('git:stage', cwd, file),
  gitUnstage: (cwd: string, file: string) => ipcRenderer.invoke('git:unstage', cwd, file),
  gitStageAll: (cwd: string) => ipcRenderer.invoke('git:stageAll', cwd),
  gitDiscard: (cwd: string, file: string) => ipcRenderer.invoke('git:discard', cwd, file),
  gitCommit: (cwd: string, message: string) => ipcRenderer.invoke('git:commit', cwd, message),
  gitLog: (cwd: string) => ipcRenderer.invoke('git:log', cwd),
  gitPull: (cwd: string) => ipcRenderer.invoke('git:pull', cwd),
  gitPush: (cwd: string) => ipcRenderer.invoke('git:push', cwd),
  gitRevert: (cwd: string, hash: string) => ipcRenderer.invoke('git:revert', cwd, hash),
  gitFileLog: (cwd: string, relativePath: string) => ipcRenderer.invoke('git:fileLog', cwd, relativePath),
  gitFileShow: (cwd: string, hash: string, relativePath: string) => ipcRenderer.invoke('git:fileShow', cwd, hash, relativePath),
  gitCheckoutFileAtCommit: (cwd: string, hash: string, relativePath: string) => ipcRenderer.invoke('git:checkoutFileAtCommit', cwd, hash, relativePath),
  gitRemoteAdd: (cwd: string, url: string) => ipcRenderer.invoke('git:remoteAdd', cwd, url),
  gitRemoteGet: (cwd: string) => ipcRenderer.invoke('git:remoteGet', cwd),
  gitAhead: (cwd: string) => ipcRenderer.invoke('git:ahead', cwd),
  gitConfig: (cwd: string) => ipcRenderer.invoke('git:config', cwd),

  // App close
  onBeforeClose: (cb: () => void) => {
    const handler = () => cb()
    ipcRenderer.on('app:beforeClose', handler)
    return () => ipcRenderer.removeListener('app:beforeClose', handler)
  },
  confirmClose: (canClose: boolean) => ipcRenderer.invoke('app:canClose', canClose),

  // Store
  storeGet: (key: string) => ipcRenderer.invoke('store:get', key),
  storeSet: (key: string, value: unknown) => ipcRenderer.invoke('store:set', key, value),

  // Theme
  setTheme: (mode: 'system' | 'light' | 'dark') => ipcRenderer.invoke('theme:set', mode),
  isDark: () => ipcRenderer.invoke('theme:isDark'),

  // Calendar
  calendarSignIn: () => ipcRenderer.invoke('calendar:signIn'),
  calendarSignOut: () => ipcRenderer.invoke('calendar:signOut'),
  calendarIsSignedIn: () => ipcRenderer.invoke('calendar:isSignedIn'),
  calendarListCalendars: () => ipcRenderer.invoke('calendar:listCalendars'),
  calendarSelectCalendars: (ids: string[]) => ipcRenderer.invoke('calendar:selectCalendars', ids),
  calendarGetSelectedCalendars: () => ipcRenderer.invoke('calendar:getSelectedCalendars'),
  calendarListEvents: (timeMin: string, timeMax: string) => ipcRenderer.invoke('calendar:listEvents', timeMin, timeMax),
  calendarCreateEvent: (calendarId: string, event: unknown) => ipcRenderer.invoke('calendar:createEvent', calendarId, event),
  calendarUpdateEvent: (calendarId: string, eventId: string, updates: unknown) => ipcRenderer.invoke('calendar:updateEvent', calendarId, eventId, updates),
  calendarDeleteEvent: (calendarId: string, eventId: string) => ipcRenderer.invoke('calendar:deleteEvent', calendarId, eventId),
})
