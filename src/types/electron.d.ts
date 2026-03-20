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
  writeFile: (path: string, content: string) => Promise<{ success: boolean; error?: string }>
  search: (dirPath: string, query: string) => Promise<SearchResult[]>
  watchFile: (path: string) => Promise<void>
  unwatchFile: (path: string) => Promise<void>
  onFileChanged: (cb: (filePath: string) => void) => () => void
  watchDir: (path: string) => Promise<void>
  unwatchDir: (path: string) => Promise<void>
  onDirChanged: (cb: (dirPath: string) => void) => () => void
  stat: (path: string) => Promise<{ size: number; mtime: string } | null>
  showItemInFolder: (path: string) => Promise<void>
  openPath: (path: string) => Promise<string | null>
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
