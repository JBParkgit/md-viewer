export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface SearchResult {
  filePath: string
  fileName: string
  lineNumber: number
  lineText: string
}

export interface ElectronAPI {
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
  onDirChanged: (cb: (dirPath: string) => void) => () => void
  stat: (path: string) => Promise<{ size: number; mtime: string } | null>
  copyImageToDir: (srcPath: string, destDir: string) => Promise<{ success: boolean; fileName?: string; error?: string }>
  listImages: (dirPath: string) => Promise<string[]>
  listVideos: (dirPath: string) => Promise<string[]>
  collectTags: (dirPath: string) => Promise<{ filePath: string; fileName: string; tags: string[] }[]>
  createFile: (filePath: string, content?: string) => Promise<{ success: boolean; error?: string }>
  renameFile: (oldPath: string, newName: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
  move: (srcPath: string, destDir: string) => Promise<{ success: boolean; newPath?: string; error?: string }>
  createDir: (dirPath: string) => Promise<{ success: boolean; error?: string }>
  saveFolder: () => Promise<string | null>
  getPathForFile: (file: File) => string
  showItemInFolder: (path: string) => Promise<void>
  openPath: (path: string) => Promise<string | null>
  startDrag: (filePath: string) => void
  copyImageToClipboard: (filePath: string) => Promise<{ success: boolean; error?: string }>
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
  gitPull: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitPush: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitRevert: (cwd: string, hash: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitRemoteAdd: (cwd: string, url: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitRemoteGet: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>
  gitConfig: (cwd: string) => Promise<{ success: boolean; output?: string; error?: string }>

  onBeforeClose: (cb: () => void) => () => void
  confirmClose: (canClose: boolean) => Promise<void>

  storeGet: (key: string) => Promise<unknown>
  storeSet: (key: string, value: unknown) => Promise<void>
  setTheme: (mode: 'system' | 'light' | 'dark') => Promise<void>
  isDark: () => Promise<boolean>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
