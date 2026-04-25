export interface CalendarInfo {
  id: string
  summary: string
  primary: boolean
  accessRole: string
  backgroundColor?: string
}

export interface CalendarEventData {
  id?: string
  calendarId?: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  linkedFiles?: string[]
  linkedProjectPath?: string
  colorId?: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  mtime?: number
}

export interface SearchResult {
  filePath: string
  fileName: string
  lineNumber: number
  lineText: string
}

export interface ElectronAPI {
  openFileDialog: () => Promise<string[] | null>
  openDocxDialog: () => Promise<string | null>
  onOpenExternal: (cb: (filePath: string) => void) => () => void
  openFolder: () => Promise<string | null>
  readDir: (path: string) => Promise<FileNode[]>
  readFile: (path: string) => Promise<{ success: boolean; content?: string; error?: string }>
  readFileBinary: (path: string) => Promise<{ success: boolean; data?: ArrayBuffer; error?: string }>
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  search: (dirPath: string, query: string) => Promise<SearchResult[]>
  watchFile: (path: string) => Promise<void>
  unwatchFile: (path: string) => Promise<void>
  onFileChanged: (cb: (filePath: string) => void) => () => void
  watchDir: (path: string) => Promise<void>
  unwatchDir: (path: string) => Promise<void>
  onDirChanged: (cb: (dirPath: string, changedPaths: string[]) => void) => () => void
  watchGit: (projectPath: string) => Promise<void>
  unwatchGit: (projectPath: string) => Promise<void>
  onGitMetaChanged: (cb: (projectPath: string) => void) => () => void
  stat: (path: string) => Promise<{ size: number; mtime: string } | null>
  copyImageToDir: (srcPath: string, destDir: string) => Promise<{ success: boolean; fileName?: string; error?: string }>
  listImages: (dirPath: string) => Promise<string[]>
  listVideos: (dirPath: string) => Promise<string[]>
  collectTags: (dirPath: string) => Promise<{ filePath: string; fileName: string; tags: string[] }[]>
  collectLinks: (dirPath: string) => Promise<{ filePath: string; fileName: string; targets: string[] }[]>
  findFile: (dirPath: string, name: string) => Promise<string | null>
  listMdFiles: (dirPath: string) => Promise<string[]>
  listMdFilesWithMtime: (dirPath: string) => Promise<{ path: string; mtime: number }[]>
  createFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  copyFileToDir: (srcPath: string, destDir: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  move: (srcPath: string, destDir: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  createDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  saveFolder: () => Promise<string | null>
  cloneFolder: () => Promise<string | null>
  getPathForFile: (file: File) => string
  showItemInFolder: (path: string) => Promise<void>
  openTerminal: (path: string) => Promise<void>
  detectIDEs: () => Promise<{ id: string; name: string; cmd: string }[]>
  openInIDE: (ideCmd: string, dirPath: string) => Promise<void>
  detectClaude: () => Promise<boolean>
  openClaude: (dirPath: string, skipPerms: boolean) => Promise<void>
  saveAs: (defaultPath: string, filters: { name: string; extensions: string[] }[]) => Promise<string | null>
  exportPdf: (srcMdPath: string, destPath: string) => Promise<{ success: boolean; error?: string }>
  exportDocx: (srcMdPath: string, destPath: string) => Promise<{ success: boolean; error?: string }>
  importDocxToMd: (srcDocxPath: string, destPath: string) => Promise<{ success: boolean; error?: string; messages?: string[] }>
  openPath: (path: string) => Promise<string | null>
  openInObsidian: (path: string) => Promise<{ success: boolean; error?: string }>
  startDrag: (filePath: string) => void
  copyImageToClipboard: (filePath: string) => Promise<{ success: boolean; error?: string }>
  registerMdAssociation: () => Promise<{ success: boolean; error?: string }>
  // Git
  gitIsRepo: (cwd: string) => Promise<boolean>
  gitClone: (url: string, destDir: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitInit: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitStatus: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitBranch: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitStage: (cwd: string, file: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitUnstage: (cwd: string, file: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitStageAll: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitDiscard: (cwd: string, file: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitCommit: (cwd: string, message: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitLog: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitPull: (cwd: string) => Promise<{
    success: boolean
    output?: string
    error?: string
    commits?: { hash: string; author: string; date: string; subject: string }[]
    files?: { status: string; path: string }[]
    fastForward?: boolean
    alreadyUpToDate?: boolean
    before?: string
    after?: string
  }>
  gitPush: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitRevert: (cwd: string, hash: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitFileLog: (cwd: string, relativePath: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitFileShow: (cwd: string, hash: string, relativePath: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitFileAuthorsInRange: (cwd: string, fromRef: string, toRef: string, relativePath: string) =>
    Promise<{ success: boolean; output?: string; error?: string }>
  gitCheckoutFileAtCommit: (cwd: string, hash: string, relativePath: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitRemoteAdd: (cwd: string, url: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitRemoteGet: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitAhead: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitConfig: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>

  onBeforeClose: (cb: () => void) => () => void
  confirmClose: (canClose: boolean) => Promise<void>
  toggleMaximize: () => Promise<void>
  printPreviewGenerate: () => Promise<{ success: true; data: string } | { success: false; error: string }>
  printPreviewPrint: () => Promise<{ success: boolean; error?: string }>

  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  setTheme: (mode: 'system' | 'light' | 'dark') => Promise<void>
  isDark: () => Promise<boolean>

  // Calendar
  calendarSignIn: () => Promise<{ success: boolean; error?: string }>
  calendarSignOut: () => Promise<{ success: boolean }>
  calendarIsSignedIn: () => Promise<boolean>
  calendarListCalendars: () => Promise<{ success: boolean; data?: CalendarInfo[]; error?: string }>
  calendarSelectCalendars: (ids: string[]) => Promise<{ success: boolean }>
  calendarGetSelectedCalendars: () => Promise<string[]>
  calendarListEvents: (timeMin: string, timeMax: string) => Promise<{ success: boolean; data?: CalendarEventData[]; error?: string }>
  calendarCreateEvent: (calendarId: string, event: CalendarEventData) => Promise<{ success: boolean; data?: CalendarEventData; error?: string }>
  calendarUpdateEvent: (calendarId: string, eventId: string, updates: Partial<CalendarEventData>) => Promise<{ success: boolean; data?: CalendarEventData; error?: string }>
  calendarDeleteEvent: (calendarId: string, eventId: string) => Promise<{ success: boolean; error?: string }>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
