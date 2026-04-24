import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, nativeImage, clipboard } from 'electron'
import { join, basename, extname, dirname } from 'path'
import { readdir, readFile, writeFile, stat, mkdir, copyFile, unlink } from 'fs/promises'
import { statSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import mammoth from 'mammoth'
import TurndownService from 'turndown'
// turndown-plugin-gfm ships CJS without .d.ts; declare the shape we use.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const turndownPluginGfm = require('turndown-plugin-gfm') as {
  gfm: (service: TurndownService) => void
}
import Store from 'electron-store'
import chokidar from 'chokidar'
// marked v18 is ESM-only (package.json "type": "module"). electron-vite
// bundles main as CommonJS, so a static `import { marked } from 'marked'`
// becomes a require() and fails with ERR_REQUIRE_ESM at runtime. Use
// dynamic import inside handlers — the first call loads it once and caches.
type MarkedModule = typeof import('marked')
let markedModulePromise: Promise<MarkedModule> | null = null
function loadMarked(): Promise<MarkedModule> {
  if (!markedModulePromise) {
    markedModulePromise = import('marked').then((m) => {
      m.marked.setOptions({ gfm: true, breaks: false })
      return m
    })
  }
  return markedModulePromise
}
import * as googleAuth from './googleAuth'
import * as googleCalendar from './googleCalendar'

// electron-store 타입 정의
interface StoreSchema {
  projects: { path: string; name: string }[]
  darkMode: 'system' | 'light' | 'dark'
  fontSize: number
  favorites: string[]
  recentFiles: string[]
  fileTags: Record<string, string[]>
  currentUser: string
  openDirs: Record<string, string[]>
}

const store = new Store<StoreSchema>({
  defaults: {
    projects: [],
    darkMode: 'system',
    fontSize: 16,
    favorites: [],
    recentFiles: [],
    fileTags: {},
    currentUser: '',
    openDirs: {},
  },
})

let mainWindow: BrowserWindow | null = null
let watchers: Map<string, ReturnType<typeof chokidar.watch>> = new Map()

// Tracks files that the app itself just wrote, so the file watcher can suppress
// the resulting `change` event instead of incorrectly reporting it as an
// external modification. Keys are normalized paths; values are expiry timestamps.
const recentSelfWrites = new Map<string, number>()
const SELF_WRITE_SUPPRESS_MS = 5000

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase()
}

function markSelfWrite(filePath: string) {
  const key = normalizePath(filePath)
  recentSelfWrites.set(key, Date.now() + SELF_WRITE_SUPPRESS_MS)
}

function consumeSelfWrite(filePath: string): boolean {
  const key = normalizePath(filePath)
  const expiry = recentSelfWrites.get(key)
  if (expiry === undefined) return false
  if (expiry < Date.now()) {
    recentSelfWrites.delete(key)
    return false
  }
  // Don't delete on consume — multiple chokidar events for one write should
  // all be suppressed within the window. Cleanup happens on expiry.
  return true
}

// Periodic cleanup of expired entries.
setInterval(() => {
  const now = Date.now()
  for (const [key, expiry] of recentSelfWrites) {
    if (expiry < now) recentSelfWrites.delete(key)
  }
}, 10000).unref?.()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // local file:// images
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#ffffff',
      symbolColor: '#374151',
      height: 36,
    },
    backgroundColor: '#ffffff',
  })

  // Apply saved dark mode
  const savedDarkMode = store.get('darkMode', 'system')
  if (savedDarkMode === 'dark') {
    nativeTheme.themeSource = 'dark'
    mainWindow.setTitleBarOverlay({ color: '#1f2937', symbolColor: '#f9fafb', height: 36 })
  } else if (savedDarkMode === 'light') {
    nativeTheme.themeSource = 'light'
  } else {
    nativeTheme.themeSource = 'system'
  }

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  let forceClose = false
  mainWindow.on('close', (e) => {
    if (forceClose) return
    e.preventDefault()
    mainWindow?.webContents.send('app:beforeClose')
  })

  ipcMain.handle('app:canClose', (_e, canClose: boolean) => {
    if (canClose) {
      forceClose = true
      mainWindow?.close()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    // Stop all watchers
    watchers.forEach(w => w.close())
    watchers.clear()
  })
}

// ── Single instance lock & file open from OS ────────────────────────────────
let pendingFilePath: string | null = null

function getFileFromArgs(args: string[]): string | null {
  // Skip electron/exe args, find first existing file path
  for (const arg of args.slice(1)) {
    if (arg.startsWith('-') || arg.startsWith('--')) continue
    const ext = arg.split('.').pop()?.toLowerCase()
    if (ext && ['md', 'markdown', 'txt', 'log'].includes(ext) && existsSync(arg)) {
      return arg
    }
  }
  return null
}

function sendFileToRenderer(filePath: string) {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send('file:openExternal', filePath)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const filePath = getFileFromArgs(argv)
    if (filePath) sendFileToRenderer(filePath)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createWindow()
    // Open file passed via command line on first launch
    const filePath = getFileFromArgs(process.argv)
    if (filePath) {
      pendingFilePath = filePath
      mainWindow?.webContents.once('did-finish-load', () => {
        if (pendingFilePath) {
          sendFileToRenderer(pendingFilePath)
          pendingFilePath = null
        }
      })
    }
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// ── IPC: Register .md file association (Windows, HKCU, no admin) ────────────
function regAdd(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', args, (err, _stdout, stderr) => {
      if (err) reject(new Error(stderr?.toString() || err.message))
      else resolve()
    })
  })
}

ipcMain.handle('shell:registerMdAssociation', async () => {
  if (process.platform !== 'win32') {
    return { success: false, error: 'Windows에서만 지원됩니다.' }
  }
  if (!app.isPackaged) {
    return { success: false, error: '개발 모드에서는 사용할 수 없습니다. 빌드된 앱에서 실행해 주세요.' }
  }
  try {
    const exe = process.execPath
    const progId = 'Docuflow.Markdown'
    const iconValue = `"${exe}",0`
    const cmdValue = `"${exe}" "%1"`
    const base = `HKCU\\Software\\Classes\\${progId}`

    await regAdd(['add', base, '/ve', '/d', 'Markdown Document', '/f'])
    await regAdd(['add', `${base}\\DefaultIcon`, '/ve', '/d', iconValue, '/f'])
    await regAdd(['add', `${base}\\shell\\open\\command`, '/ve', '/d', cmdValue, '/f'])
    await regAdd(['add', 'HKCU\\Software\\Classes\\.md\\OpenWithProgids', '/v', progId, '/t', 'REG_NONE', '/f'])
    await regAdd(['add', 'HKCU\\Software\\Classes\\.markdown\\OpenWithProgids', '/v', progId, '/t', 'REG_NONE', '/f'])

    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) }
  }
})

// ── IPC: Open File Dialog ───────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    title: '파일 열기',
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown'] },
      { name: '문서', extensions: ['txt', 'log', 'pdf', 'doc', 'docx'] },
      { name: '이미지', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths
})

// ── IPC: Open Docx Dialog ────────────────────────────────────────────────────
ipcMain.handle('dialog:openDocx', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Word 문서 선택',
    filters: [
      { name: 'Word 문서', extensions: ['docx', 'doc'] },
      { name: '모든 파일', extensions: ['*'] },
    ],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: Open Folder Dialog ──────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: '프로젝트 폴더 추가',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: Read Directory ──────────────────────────────────────────────────────
interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
  mtime?: number
}

async function readDirRecursive(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 6) return []
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const nodes: FileNode[] = []
    for (const entry of entries) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        nodes.push({
          name: entry.name,
          path: fullPath,
          type: 'directory',
          children: await readDirRecursive(fullPath, depth + 1),
        })
      } else if (entry.isFile()) {
        // mtime powers the "recently changed" dot badge for non-Git folders.
        // statSync here is sync-per-entry; for typical project sizes the cost
        // is negligible compared to the readdir latency itself.
        let mtime: number | undefined
        try { mtime = statSync(fullPath).mtimeMs } catch { /* ignore */ }
        nodes.push({ name: entry.name, path: fullPath, type: 'file', mtime })
      }
    }
    // Sort: directories first (dot-dirs last among dirs), then files (dot-files last)
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      const aDot = a.name.startsWith('.') ? 1 : 0
      const bDot = b.name.startsWith('.') ? 1 : 0
      if (aDot !== bDot) return aDot - bDot
      return a.name.localeCompare(b.name, 'ko')
    })
    return nodes
  } catch {
    return []
  }
}

ipcMain.handle('fs:readDir', async (_e, dirPath: string) => {
  return readDirRecursive(dirPath)
})

// ── IPC: Read File ───────────────────────────────────────────────────────────
ipcMain.handle('fs:readFile', async (_e, filePath: string) => {
  try {
    const content = await readFile(filePath, 'utf-8')
    return { success: true, content }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Write File ──────────────────────────────────────────────────────────
ipcMain.handle('fs:writeFile', async (_e, filePath: string, content: string) => {
  try {
    // Mark BEFORE the write so the chokidar `change` event (which fires
    // immediately after the disk flush) is suppressed.
    markSelfWrite(filePath)
    await writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Full-text Search ────────────────────────────────────────────────────
interface SearchResult {
  filePath: string
  fileName: string
  lineNumber: number
  lineText: string
}

async function searchInDir(dirPath: string, query: string, results: SearchResult[]) {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await searchInDir(fullPath, query, results)
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          const content = await readFile(fullPath, 'utf-8')
          const lines = content.split('\n')
          const lowerQuery = query.toLowerCase()
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(lowerQuery)) {
              results.push({
                filePath: fullPath,
                fileName: entry.name,
                lineNumber: i + 1,
                lineText: line.trim().slice(0, 120),
              })
            }
          })
        } catch {}
      } else if (entry.isFile() && /\.docx?$/i.test(entry.name)) {
        try {
          const { value } = await mammoth.extractRawText({ path: fullPath })
          const lines = value.split('\n')
          const lowerQuery = query.toLowerCase()
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(lowerQuery)) {
              results.push({
                filePath: fullPath,
                fileName: entry.name,
                lineNumber: i + 1,
                lineText: line.trim().slice(0, 120),
              })
            }
          })
        } catch {}
      }
    }
  } catch {}
}

ipcMain.handle('fs:search', async (_e, dirPath: string, query: string) => {
  if (!query.trim()) return []
  const results: SearchResult[] = []
  await searchInDir(dirPath, query, results)
  return results.slice(0, 200)
})

// ── IPC: Watch File (단일 파일 변경 감지) ────────────────────────────────────
ipcMain.handle('fs:watchFile', (_e, filePath: string) => {
  if (watchers.has(filePath)) return
  const watcher = chokidar.watch(filePath, { ignoreInitial: true, usePolling: false })
  watcher.on('change', () => {
    if (consumeSelfWrite(filePath)) return
    mainWindow?.webContents.send('fs:fileChanged', filePath)
  })
  watchers.set(filePath, watcher)
})

ipcMain.handle('fs:unwatchFile', (_e, filePath: string) => {
  const watcher = watchers.get(filePath)
  if (watcher) {
    watcher.close()
    watchers.delete(filePath)
  }
})

// ── IPC: Watch Directory (프로젝트 트리 자동 갱신) ───────────────────────────
const dirWatchers = new Map<string, ReturnType<typeof chokidar.watch>>()
const dirTimers = new Map<string, ReturnType<typeof setTimeout>>()

const dirChangedPaths = new Map<string, Set<string>>()

ipcMain.handle('fs:watchDir', (_e, dirPath: string) => {
  if (dirWatchers.has(dirPath)) return
  const watcher = chokidar.watch(dirPath, {
    ignoreInitial: true,
    usePolling: false,
    depth: 8,
    ignored: /(^|[/\\])\../,   // 숨김 파일 무시
  })
  const notify = (changedPath?: string) => {
    // Accumulate the set of changed paths between debounced flushes so the
    // renderer can highlight exactly what moved (Phase 3 flash animation).
    if (changedPath) {
      let set = dirChangedPaths.get(dirPath)
      if (!set) { set = new Set(); dirChangedPaths.set(dirPath, set) }
      // Also ignore events that originated from our own write (edit-in-app).
      if (!consumeSelfWrite(changedPath)) set.add(changedPath)
    }
    // 연속 변경을 300ms 디바운스로 묶어서 한 번만 알림
    const existing = dirTimers.get(dirPath)
    if (existing) clearTimeout(existing)
    dirTimers.set(dirPath, setTimeout(() => {
      const set = dirChangedPaths.get(dirPath)
      const paths = set ? Array.from(set) : []
      dirChangedPaths.delete(dirPath)
      mainWindow?.webContents.send('fs:dirChanged', dirPath, paths)
      dirTimers.delete(dirPath)
    }, 300))
  }
  watcher
    .on('add', notify)
    .on('change', notify)
    .on('unlink', notify)
    .on('addDir', notify)
    .on('unlinkDir', notify)
  dirWatchers.set(dirPath, watcher)
})

ipcMain.handle('fs:unwatchDir', (_e, dirPath: string) => {
  const existing = dirTimers.get(dirPath)
  if (existing) { clearTimeout(existing); dirTimers.delete(dirPath) }
  const watcher = dirWatchers.get(dirPath)
  if (watcher) { watcher.close(); dirWatchers.delete(dirPath) }
})

// ── IPC: Watch Git metadata ─────────────────────────────────────────────────
// The directory watcher above ignores dotfiles, so external `git add`/`git commit`
// (which only touches `.git/index`, `.git/HEAD`, refs) are invisible to it.
// This dedicated watcher observes those files so the UI can refresh Git status
// even when the working tree itself hasn't changed.
const gitWatchers = new Map<string, ReturnType<typeof chokidar.watch>>()
const gitTimers = new Map<string, ReturnType<typeof setTimeout>>()

ipcMain.handle('fs:watchGit', (_e, projectPath: string) => {
  if (gitWatchers.has(projectPath)) return
  const gitDir = join(projectPath, '.git')
  if (!existsSync(gitDir)) return
  const watcher = chokidar.watch(
    [
      join(gitDir, 'index'),
      join(gitDir, 'HEAD'),
      join(gitDir, 'refs', 'heads'),
      join(gitDir, 'MERGE_HEAD'),
      join(gitDir, 'ORIG_HEAD'),
    ],
    {
      ignoreInitial: true,
      usePolling: false,
      // chokidar by default ignores dotfiles via our other watchers, but for this
      // one we are EXPLICITLY inside `.git/`, so we must not re-apply that filter.
    }
  )
  const notify = () => {
    const existing = gitTimers.get(projectPath)
    if (existing) clearTimeout(existing)
    gitTimers.set(projectPath, setTimeout(() => {
      mainWindow?.webContents.send('fs:gitMetaChanged', projectPath)
      gitTimers.delete(projectPath)
    }, 300))
  }
  watcher
    .on('add', notify)
    .on('change', notify)
    .on('unlink', notify)
    .on('addDir', notify)
    .on('unlinkDir', notify)
  gitWatchers.set(projectPath, watcher)
})

ipcMain.handle('fs:unwatchGit', (_e, projectPath: string) => {
  const existing = gitTimers.get(projectPath)
  if (existing) { clearTimeout(existing); gitTimers.delete(projectPath) }
  const watcher = gitWatchers.get(projectPath)
  if (watcher) { watcher.close(); gitWatchers.delete(projectPath) }
})

// ── IPC: Read File Binary ────────────────────────────────────────────────────
ipcMain.handle('fs:readFileBinary', async (_e, filePath: string) => {
  try {
    const buffer = await readFile(filePath)
    return { success: true, data: buffer.buffer }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Store ───────────────────────────────────────────────────────────────
ipcMain.handle('store:get', (_e, key: keyof StoreSchema) => {
  return store.get(key)
})

ipcMain.handle('store:set', (_e, key: keyof StoreSchema, value: unknown) => {
  store.set(key, value as StoreSchema[typeof key])
})

// ── IPC: Dark Mode ───────────────────────────────────────────────────────────
ipcMain.handle('theme:set', (_e, mode: 'system' | 'light' | 'dark') => {
  nativeTheme.themeSource = mode
  store.set('darkMode', mode)
  if (!mainWindow) return
  if (mode === 'dark') {
    mainWindow.setTitleBarOverlay({ color: '#1f2937', symbolColor: '#f9fafb', height: 36 })
  } else {
    mainWindow.setTitleBarOverlay({ color: '#ffffff', symbolColor: '#374151', height: 36 })
  }
})

ipcMain.handle('theme:isDark', () => {
  return nativeTheme.shouldUseDarkColors
})

// ── IPC: Open file in explorer ───────────────────────────────────────────────
ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => {
  shell.showItemInFolder(filePath)
})

ipcMain.handle('shell:openTerminal', async (_e, dirPath: string) => {
  const { exec } = require('child_process')
  if (process.platform === 'win32') {
    // Prefer Windows Terminal (wt.exe) for proper Korean IME and ANSI
    // handling. Fall back to legacy conhost-hosted cmd if wt isn't present.
    const hasWT = await detectWindowsTerminal()
    if (hasWT) {
      exec(`wt -d "${dirPath}"`)
    } else {
      exec(`start cmd /k "cd /d "${dirPath}""`)
    }
  } else if (process.platform === 'darwin') {
    exec(`open -a Terminal "${dirPath}"`)
  } else {
    exec(`x-terminal-emulator --working-directory="${dirPath}"`)
  }
})

// ── IPC: Detect installed IDEs ─────────────────────────────────────────────
const IDE_LIST = [
  { id: 'code', name: 'VS Code', cmd: 'code' },
  { id: 'cursor', name: 'Cursor', cmd: 'cursor' },
  { id: 'windsurf', name: 'Windsurf', cmd: 'windsurf' },
  { id: 'antigravity', name: 'Antigravity', cmd: 'antigravity' },
]

let detectedIDEs: { id: string; name: string; cmd: string }[] | null = null

async function detectIDEs(): Promise<{ id: string; name: string; cmd: string }[]> {
  if (detectedIDEs) return detectedIDEs
  const which = process.platform === 'win32' ? 'where' : 'which'
  const results: { id: string; name: string; cmd: string }[] = []
  for (const ide of IDE_LIST) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(which, [ide.cmd], (err) => err ? reject(err) : resolve())
      })
      results.push(ide)
    } catch { /* not installed */ }
  }
  detectedIDEs = results
  return results
}

ipcMain.handle('shell:detectIDEs', async () => {
  return detectIDEs()
})

ipcMain.handle('shell:openInIDE', async (_e, ideCmd: string, dirPath: string) => {
  const { exec } = require('child_process')
  exec(`"${ideCmd}" "${dirPath}"`)
})

// ── IPC: Detect Claude Code CLI ─────────────────────────────────────────────
let detectedClaude: boolean | null = null

async function detectClaude(): Promise<boolean> {
  if (detectedClaude !== null) return detectedClaude
  const which = process.platform === 'win32' ? 'where' : 'which'
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(which, ['claude'], (err) => err ? reject(err) : resolve())
    })
    detectedClaude = true
  } catch {
    detectedClaude = false
  }
  return detectedClaude
}

ipcMain.handle('shell:detectClaude', async () => {
  return detectClaude()
})

// Windows Terminal (wt.exe) handles Korean IME composition properly, unlike
// legacy conhost which is what `start cmd` lands in. We auto-detect and prefer
// it when present so Claude Code's prompt accepts 한글 input without dropped
// or mis-placed characters.
let detectedWT: boolean | null = null
async function detectWindowsTerminal(): Promise<boolean> {
  if (detectedWT !== null) return detectedWT
  if (process.platform !== 'win32') { detectedWT = false; return false }
  try {
    await new Promise<void>((resolve, reject) => {
      execFile('where', ['wt'], (err) => err ? reject(err) : resolve())
    })
    detectedWT = true
  } catch {
    detectedWT = false
  }
  return detectedWT
}

// Open a new terminal in `dirPath` and start `claude` (optionally with
// --dangerously-skip-permissions). Must spawn a real OS terminal — Claude
// Code requires a TTY, so we can't run it with plain child_process.exec.
ipcMain.handle('shell:openClaude', async (_e, dirPath: string, skipPerms: boolean) => {
  const { exec } = require('child_process')
  const flag = skipPerms ? ' --dangerously-skip-permissions' : ''
  if (process.platform === 'win32') {
    const hasWT = await detectWindowsTerminal()
    if (hasWT) {
      exec(`wt -d "${dirPath}" cmd /k "claude${flag}"`)
    } else {
      exec(`start cmd /k "cd /d "${dirPath}" && claude${flag}"`)
    }
  } else if (process.platform === 'darwin') {
    const script = `tell application "Terminal" to do script "cd ${JSON.stringify(dirPath)}; claude${flag}"`
    exec(`osascript -e ${JSON.stringify(script)}`)
  } else {
    exec(`x-terminal-emulator -e bash -c 'cd "${dirPath}"; claude${flag}; exec bash'`)
  }
})

// ── IPC: Open file with default OS app ───────────────────────────────────────
ipcMain.handle('shell:openPath', async (_e, filePath: string) => {
  const err = await shell.openPath(filePath)
  return err || null  // null = success, string = error message
})

// ── IPC: Open file in Obsidian via obsidian:// URI ──────────────────────────
// Obsidian's URI scheme opens a file in whichever vault contains it.
// Docs: https://help.obsidian.md/Concepts/Obsidian+URI
// Important: Obsidian expects forward-slash paths, even on Windows. Passing
// an encoded backslash (%5C) silently fails to match any vault.
ipcMain.handle('shell:openInObsidian', async (_e, filePath: string) => {
  try {
    if (!existsSync(filePath)) {
      return { success: false, error: `파일을 찾을 수 없습니다: ${filePath}` }
    }
    // Normalize to forward slashes, then encode each segment so spaces,
    // Korean characters, etc. are valid URI components while the `/`
    // structure remains intact.
    const normalized = filePath.replace(/\\/g, '/')
    const encoded = normalized.split('/').map(encodeURIComponent).join('/')
    const uri = `obsidian://open?path=${encoded}`
    console.log('[openInObsidian] URI:', uri)
    await shell.openExternal(uri)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Native drag to external apps ────────────────────────────────────────
ipcMain.on('native:startDrag', (event, filePath: string) => {
  try {
    const icon = nativeImage.createFromPath(filePath).resize({ width: 64, height: 64 })
    event.sender.startDrag({ file: filePath, icon })
  } catch {
    // For non-image files or if icon creation fails, use a blank icon
    const icon = nativeImage.createEmpty()
    event.sender.startDrag({ file: filePath, icon })
  }
})

// ── IPC: Copy image to clipboard ─────────────────────────────────────────────
ipcMain.handle('clipboard:copyImage', async (_e, filePath: string) => {
  try {
    const img = nativeImage.createFromPath(filePath)
    if (img.isEmpty()) return { success: false, error: '이미지를 로드할 수 없습니다.' }
    clipboard.writeImage(img)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Get file stats ──────────────────────────────────────────────────────
ipcMain.handle('fs:stat', (_e, filePath: string) => {
  try {
    if (!existsSync(filePath)) return null
    const s = statSync(filePath)
    return { size: s.size, mtime: s.mtime.toISOString() }
  } catch {
    return null
  }
})

// ── IPC: Copy image to ./images/ dir ────────────────────────────────────────
ipcMain.handle('fs:copyImageToDir', async (_e, srcPath: string, destDir: string) => {
  try {
    const imagesDir = join(destDir, 'images')
    if (!existsSync(imagesDir)) {
      await mkdir(imagesDir, { recursive: true })
    }
    let fileName = basename(srcPath)
    let destPath = join(imagesDir, fileName)
    let counter = 1
    while (existsSync(destPath)) {
      const ext = extname(fileName)
      const name = fileName.slice(0, -ext.length)
      destPath = join(imagesDir, `${name}_${counter}${ext}`)
      counter++
    }
    await copyFile(srcPath, destPath)
    return { success: true, fileName: basename(destPath) }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: List images in project ─────────────────────────────────────────────
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']

async function collectImages(dirPath: string, results: string[], depth = 0) {
  if (depth > 6) return
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await collectImages(fullPath, results, depth + 1)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (IMAGE_EXTENSIONS.includes(ext)) {
          results.push(fullPath)
        }
      }
    }
  } catch {}
}

ipcMain.handle('fs:listImages', async (_e, dirPath: string) => {
  const results: string[] = []
  await collectImages(dirPath, results)
  return results
})

// ── IPC: List videos in project ──────────────────────────────────────────────
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv']

async function collectVideos(dirPath: string, results: string[], depth = 0) {
  if (depth > 6) return
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await collectVideos(fullPath, results, depth + 1)
      } else if (entry.isFile()) {
        const ext = extname(entry.name).toLowerCase()
        if (VIDEO_EXTENSIONS.includes(ext)) {
          results.push(fullPath)
        }
      }
    }
  } catch {}
}

ipcMain.handle('fs:listVideos', async (_e, dirPath: string) => {
  const results: string[] = []
  await collectVideos(dirPath, results)
  return results
})

// ── IPC: Collect tags from all .md files in project ─────────────────────────
const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/

function extractFrontmatterTags(content: string): string[] {
  const match = content.match(FM_REGEX)
  if (!match) return []
  const yaml = match[1]
  const inlineMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m)
  if (inlineMatch) {
    return inlineMatch[1].split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  const listMatch = yaml.match(/^tags:\s*\n((?:\s*-\s*.+\n?)*)/m)
  if (listMatch) {
    return listMatch[1].split('\n').map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  }
  return []
}

/** Extract Obsidian-style inline `#tag` mentions from the document body,
 *  while skipping fenced code blocks and markdown headings (which use `#`).
 *  Supports nested tags like `#project/alpha` and Korean characters. */
function extractInlineTags(content: string): string[] {
  // Strip frontmatter first
  const bodyWithoutFm = content.replace(FM_REGEX, '')
  // Remove fenced code blocks so `#comment` in code isn't picked up
  const stripped = bodyWithoutFm.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '')
  const found = new Set<string>()
  // Process line by line so we can skip markdown heading lines (# Title)
  for (const rawLine of stripped.split('\n')) {
    const line = rawLine
    // Skip pure heading lines
    if (/^\s{0,3}#{1,6}\s+/.test(line)) continue
    // Remove inline code spans within the line
    const cleaned = line.replace(/`[^`]*`/g, '')
    // Match #tag: letters, digits, Korean, `-`, `_`, `/` (for nested).
    // Must be preceded by whitespace or start of string.
    const tagRe = /(^|[\s([{,;:!?])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(cleaned)) !== null) {
      const tag = m[2]
      // Skip pure-numeric to avoid matching things like `#123` issue refs
      if (/^\d+$/.test(tag)) continue
      found.add(tag)
    }
  }
  return [...found]
}

function extractTags(content: string): string[] {
  const fm = extractFrontmatterTags(content)
  const inline = extractInlineTags(content)
  // Merge + dedupe, preserving frontmatter order first
  const seen = new Set<string>(fm)
  const merged = [...fm]
  for (const t of inline) {
    if (!seen.has(t)) { seen.add(t); merged.push(t) }
  }
  return merged
}

async function collectTags(dirPath: string, results: { filePath: string; fileName: string; tags: string[] }[], depth = 0) {
  if (depth > 6) return
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await collectTags(fullPath, results, depth + 1)
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        try {
          const content = await readFile(fullPath, 'utf-8')
          const tags = extractTags(content)
          if (tags.length > 0) {
            results.push({ filePath: fullPath, fileName: entry.name, tags })
          }
        } catch {}
      }
    }
  } catch {}
}

ipcMain.handle('fs:collectTags', async (_e, dirPath: string) => {
  const results: { filePath: string; fileName: string; tags: string[] }[] = []
  await collectTags(dirPath, results)
  return results
})

// ── IPC: Collect links from all .md files in project ────────────────────────
async function collectLinksInDir(
  dirPath: string,
  results: { filePath: string; fileName: string; targets: string[] }[],
  depth = 0
) {
  if (depth > 6) return
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await collectLinksInDir(fullPath, results, depth + 1)
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        try {
          const content = await readFile(fullPath, 'utf-8')
          const targets = new Set<string>()
          // [[wikilink]] and [[wikilink|label]]
          const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
          let m: RegExpExecArray | null
          while ((m = wikiRe.exec(content)) !== null) {
            targets.add(m[1].trim())
          }
          // [text](file.md) - local (non-http) links
          const mdLinkRe = /\[([^\]]+)\]\(([^)]+)\)/g
          while ((m = mdLinkRe.exec(content)) !== null) {
            const href = m[2].trim()
            if (!href.startsWith('http') && !href.startsWith('mailto') && !href.startsWith('#') && !href.startsWith('docuflow')) {
              const name = href.split('/').pop()?.split('\\').pop() || href
              targets.add(name)
            }
          }
          if (targets.size > 0) {
            results.push({ filePath: fullPath, fileName: entry.name, targets: [...targets] })
          }
        } catch {}
      }
    }
  } catch {}
}

ipcMain.handle('fs:collectLinks', async (_e, dirPath: string) => {
  const results: { filePath: string; fileName: string; targets: string[] }[] = []
  await collectLinksInDir(dirPath, results)
  return results
})

// ── IPC: Find file by name in directory ─────────────────────────────────────
async function findFileInDir(dirPath: string, name: string, depth = 0): Promise<string | null> {
  if (depth > 6) return null
  // Normalize separators so wikilinks like [[sub/folder/file]] work on Windows.
  const nameLower = name.toLowerCase().replace(/\\/g, '/')
  const nameWithMd = nameLower.endsWith('.md') ? nameLower : nameLower + '.md'
  const hasPath = nameLower.includes('/')
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const found = await findFileInDir(fullPath, name, depth + 1)
        if (found) return found
      } else if (entry.isFile()) {
        if (hasPath) {
          // Path-qualified target: match when the file's full path ends with
          // the requested sub-path (e.g. ".../10-소식/보도자료/README.md").
          const fullLower = fullPath.toLowerCase().replace(/\\/g, '/')
          if (fullLower.endsWith('/' + nameLower) || fullLower.endsWith('/' + nameWithMd)) {
            return fullPath
          }
        } else {
          const entryLower = entry.name.toLowerCase()
          if (entryLower === nameLower || entryLower === nameWithMd) {
            return fullPath
          }
        }
      }
    }
  } catch {}
  return null
}

ipcMain.handle('fs:findFile', async (_e, dirPath: string, name: string) => {
  return findFileInDir(dirPath, name)
})

// ── IPC: List all .md files in project ──────────────────────────────────────
async function listMdFilesInDir(dirPath: string, results: string[], depth = 0) {
  if (depth > 6) return
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        await listMdFilesInDir(fullPath, results, depth + 1)
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === '.md') {
        results.push(fullPath)
      }
    }
  } catch {}
}

ipcMain.handle('fs:listMdFiles', async (_e, dirPath: string) => {
  const results: string[] = []
  await listMdFilesInDir(dirPath, results)
  return results
})

// Same as fs:listMdFiles but also returns mtime for each file so the renderer
// can sort by recency. statSync per file is acceptable at typical project size
// because readdir already walks the tree.
ipcMain.handle('fs:listMdFilesWithMtime', async (_e, dirPath: string) => {
  const paths: string[] = []
  await listMdFilesInDir(dirPath, paths)
  const results: { path: string; mtime: number }[] = []
  for (const p of paths) {
    let mtime = 0
    try { mtime = statSync(p).mtimeMs } catch { /* unreadable file */ }
    results.push({ path: p, mtime })
  }
  return results
})

// ── IPC: Create file ────────────────────────────────────────────────────────
ipcMain.handle('fs:createFile', async (_e, filePath: string, content: string = '') => {
  try {
    if (existsSync(filePath)) {
      return { success: false, error: '이미 존재하는 파일입니다.' }
    }
    await writeFile(filePath, content, 'utf-8')
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Create directory ───────────────────────────────────────────────────
ipcMain.handle('fs:createDir', async (_e, dirPath: string) => {
  try {
    if (existsSync(dirPath)) {
      return { success: false, error: '이미 존재하는 폴더입니다.' }
    }
    await mkdir(dirPath, { recursive: true })
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Rename file/folder ──────────────────────────────────────────────────
ipcMain.handle('fs:rename', async (_e, oldPath: string, newName: string) => {
  try {
    const dir = join(oldPath, '..')
    const newPath = join(dir, newName)
    if (oldPath === newPath) return { success: true, newPath: oldPath }
    if (existsSync(newPath)) {
      return { success: false, error: '같은 이름의 파일/폴더가 이미 존재합니다.' }
    }
    const { rename } = await import('fs/promises')
    await rename(oldPath, newPath)
    return { success: true, newPath }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Delete file (move to trash) ────────────────────────────────────────
ipcMain.handle('fs:deleteFile', async (_e, filePath: string) => {
  try {
    await shell.trashItem(filePath)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Move file/folder ────────────────────────────────────────────────────
ipcMain.handle('fs:copyFileToDir', async (_e, srcPath: string, destDir: string) => {
  try {
    const name = basename(srcPath)
    let destPath = join(destDir, name)
    let counter = 1
    while (existsSync(destPath)) {
      const ext = extname(name)
      const base = name.slice(0, -ext.length || undefined)
      destPath = join(destDir, `${base}_${counter}${ext}`)
      counter++
    }
    await copyFile(srcPath, destPath)
    return { success: true, newPath: destPath }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('fs:move', async (_e, srcPath: string, destDir: string) => {
  try {
    const name = basename(srcPath)
    let destPath = join(destDir, name)
    if (srcPath === destPath) return { success: true }
    // Check if destination already exists
    let counter = 1
    while (existsSync(destPath)) {
      const ext = extname(name)
      const base = name.slice(0, -ext.length || undefined)
      destPath = join(destDir, `${base}_${counter}${ext}`)
      counter++
    }
    const { rename } = await import('fs/promises')
    await rename(srcPath, destPath)
    return { success: true, newPath: destPath }
  } catch (err: unknown) {
    return { success: false, error: String(err) }
  }
})

// ── IPC: Save folder dialog (for creating new project) ─────────────────────
ipcMain.handle('dialog:saveFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '새 프로젝트 폴더 위치 선택',
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: Clone folder dialog (starts at home directory) ─────────────────────
ipcMain.handle('dialog:cloneFolder', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: '저장소를 Clone할 상위 폴더 선택',
    defaultPath: app.getPath('home'),
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// ── IPC: Git Operations ─────────────────────────────────────────────────────
// Force UTF-8 output so Korean (and other multi-byte) author names, commit
// messages, and file contents don't come back as mojibake on systems whose
// locale defaults git to legacy codepages (e.g. CP949 on Korean Windows).
const GIT_UTF8_FLAGS = ['-c', 'i18n.logOutputEncoding=UTF-8', '-c', 'i18n.commitEncoding=UTF-8']

function gitExec(args: string[], cwd: string): Promise<{ success: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    execFile('git', [...GIT_UTF8_FLAGS, ...args], {
      cwd,
      timeout: 30000,
      shell: true,
      env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' },
    }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr.trim() || err.message })
      } else {
        resolve({ success: true, output: stdout.trimEnd() })
      }
    })
  })
}

ipcMain.handle('git:isRepo', async (_e, cwd: string) => {
  // Walk up directory tree like git itself does
  let dir = cwd.replace(/\\/g, '/')
  while (true) {
    if (existsSync(join(dir, '.git'))) return true
    const parent = dir.replace(/\/[^/]+$/, '')
    if (parent === dir) return false
    dir = parent
  }
})

ipcMain.handle('git:clone', async (_e, url: string, destDir: string) => {
  return gitExec(['clone', url, destDir], destDir.replace(/[/\\][^/\\]*$/, ''))
})

ipcMain.handle('git:init', async (_e, cwd: string) => {
  return gitExec(['init'], cwd)
})

ipcMain.handle('git:status', async (_e, cwd: string) => {
  return gitExec(['-c', 'core.quotePath=false', 'status', '--porcelain', '-uall'], cwd)
})

ipcMain.handle('git:branch', async (_e, cwd: string) => {
  return gitExec(['branch', '--show-current'], cwd)
})

ipcMain.handle('git:stage', async (_e, cwd: string, file: string) => {
  return gitExec(['add', '--', file], cwd)
})

ipcMain.handle('git:unstage', async (_e, cwd: string, file: string) => {
  // Try restore --staged first; if it fails (e.g. no commits yet), fallback to rm --cached
  const result = await gitExec(['restore', '--staged', '--', file], cwd)
  if (!result.success) {
    return gitExec(['rm', '--cached', '--', file], cwd)
  }
  return result
})

ipcMain.handle('git:stageAll', async (_e, cwd: string) => {
  return gitExec(['add', '-A'], cwd)
})

ipcMain.handle('git:discard', async (_e, cwd: string, file: string) => {
  return gitExec(['checkout', '--', file], cwd)
})

ipcMain.handle('git:commit', async (_e, cwd: string, message: string) => {
  // Use shell: false to pass the message directly without shell interpretation
  // This prevents special characters (commas, quotes, etc.) from being mishandled
  return new Promise((resolve) => {
    execFile('git', ['commit', '-m', message], { cwd, timeout: 30000 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr.trim() || err.message })
      } else {
        resolve({ success: true, output: stdout.trimEnd() })
      }
    })
  })
})

ipcMain.handle('git:log', async (_e, cwd: string) => {
  return gitExec(['log', '--oneline', '-10'], cwd)
})

ipcMain.handle('git:pull', async (_e, cwd: string) => {
  // Capture HEAD before the pull so we can compute exactly what arrived.
  const beforeRes = await gitExec(['rev-parse', 'HEAD'], cwd)
  const before = beforeRes.success ? (beforeRes.output || '').trim() : ''

  const pullRes = await gitExec(['pull'], cwd)
  if (!pullRes.success) return pullRes

  const afterRes = await gitExec(['rev-parse', 'HEAD'], cwd)
  const after = afterRes.success ? (afterRes.output || '').trim() : ''

  // HEAD didn't advance → nothing was pulled (already up to date).
  if (!before || !after || before === after) {
    return { ...pullRes, alreadyUpToDate: true, commits: [], files: [] }
  }

  // New commits, tab-separated to be safe with Korean/punctuated subjects.
  const logRes = await gitExec(
    ['log', `${before}..${after}`, '--pretty=format:%h%x09%an%x09%ad%x09%s', '--date=short'],
    cwd,
  )
  const commits = logRes.success && logRes.output
    ? logRes.output.split('\n').filter(Boolean).map((line) => {
        const [hash, author, date, ...rest] = line.split('\t')
        return { hash, author, date, subject: rest.join('\t') }
      })
    : []

  // Files changed across the pulled range.
  const diffRes = await gitExec(['diff', '--name-status', `${before}..${after}`], cwd)
  const files = diffRes.success && diffRes.output
    ? diffRes.output.split('\n').filter(Boolean).map((line) => {
        const [status, ...pathParts] = line.split('\t')
        return { status: (status || '')[0] || '?', path: pathParts.join('\t') }
      })
    : []

  const fastForward = (pullRes.output || '').toLowerCase().includes('fast-forward')
  return { ...pullRes, commits, files, fastForward, alreadyUpToDate: false }
})

ipcMain.handle('git:push', async (_e, cwd: string) => {
  // Check if there are any commits at all
  const logCheck = await gitExec(['rev-parse', 'HEAD'], cwd)
  if (!logCheck.success) {
    return { success: false, error: '커밋이 없습니다. 먼저 커밋을 생성하세요.' }
  }
  // Get current branch
  const branchRes = await gitExec(['branch', '--show-current'], cwd)
  const branch = branchRes.output?.trim() || 'master'
  // Push with a generous timeout — first-time auth prompts (credential
  // helper opening a browser for OAuth) and large pack transfers can
  // legitimately exceed 30s. A premature timeout would leave the UI in a
  // misleading "apparently-failed but actually-succeeded" state.
  const pushResult = await new Promise<{ ok: boolean; out: string; err: string }>((resolve) => {
    execFile('git', ['push', '-u', 'origin', branch], { cwd, timeout: 300000, shell: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: stdout || '', err: stderr || (err ? err.message : '') })
    })
  })

  if (pushResult.ok) {
    const combined = (pushResult.out + pushResult.err).toLowerCase()
    if (combined.includes('everything up-to-date') || combined.includes('up to date')) {
      return { success: false, error: '올릴 커밋이 없습니다. 변경사항을 먼저 커밋하세요.' }
    }
    return { success: true, output: pushResult.out.trimEnd() || pushResult.err.trimEnd() }
  }

  // Push reported an error — verify against the real remote state. A
  // timeout or flaky connection can drop the transport *after* git has
  // already shipped the pack to the server, so the push is effectively
  // successful even though execFile returned an error.
  const fetchOk = await new Promise<boolean>((resolve) => {
    execFile('git', ['fetch', 'origin', branch], { cwd, timeout: 60000, shell: true }, (err) => resolve(!err))
  })
  if (fetchOk) {
    const aheadOut = await new Promise<string | null>((resolve) => {
      execFile('git', ['rev-list', '--count', `origin/${branch}..HEAD`], { cwd, timeout: 10000 }, (err, stdout) => {
        resolve(err ? null : (stdout || ''))
      })
    })
    if (aheadOut !== null && parseInt(aheadOut.trim() || '0', 10) === 0) {
      return { success: true, output: '업로드가 이미 완료된 것으로 확인되었습니다. (이전 시도가 실제로는 성공)' }
    }
  }
  return { success: false, error: pushResult.err.trim() || 'Push 실패' }
})

ipcMain.handle('git:revert', async (_e, cwd: string, hash: string) => {
  return gitExec(['revert', '--no-edit', hash], cwd)
})

// ── Per-file history operations ─────────────────────────────────────────────
// List the commits that touched a specific file. Tab-separated to avoid the
// `|` character being parsed as a shell pipe by cmd.exe under shell: true.
// Output rows: "<hash>\t<authorDate>\t<author>\t<subject>"
ipcMain.handle('git:fileLog', async (_e, cwd: string, relativePath: string) => {
  return gitExec(
    ['log', '--pretty=format:%h%x09%ad%x09%an%x09%s', '--date=short', '--', relativePath],
    cwd,
  )
})

// Read the contents of a specific file at a specific commit (for preview).
ipcMain.handle('git:fileShow', async (_e, cwd: string, hash: string, relativePath: string) => {
  return gitExec(['show', `${hash}:${relativePath}`], cwd)
})

// Restore a specific file to its state at a given commit. Stages the change.
ipcMain.handle('git:checkoutFileAtCommit', async (_e, cwd: string, hash: string, relativePath: string) => {
  return gitExec(['checkout', hash, '--', relativePath], cwd)
})

ipcMain.handle('git:remoteAdd', async (_e, cwd: string, url: string) => {
  return gitExec(['remote', 'add', 'origin', url], cwd)
})

ipcMain.handle('git:ahead', async (_e, cwd: string) => {
  // Use @{u} (upstream) notation without shell so it's interpreted by git, not cmd.exe
  return new Promise((resolve) => {
    execFile('git', ['rev-list', '--count', '@{u}..HEAD'], { cwd, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) resolve({ success: false, error: stderr.trim() || err.message })
      else resolve({ success: true, output: stdout.trim() })
    })
  })
})

ipcMain.handle('git:remoteGet', async (_e, cwd: string) => {
  return gitExec(['remote', 'get-url', 'origin'], cwd)
})

ipcMain.handle('git:config', async (_e, cwd: string) => {
  const [userName, userEmail, remoteFetch, remotePush, defaultBranch] = await Promise.all([
    gitExec(['config', 'user.name'], cwd),
    gitExec(['config', 'user.email'], cwd),
    gitExec(['remote', 'get-url', 'origin'], cwd),
    gitExec(['remote', 'get-url', '--push', 'origin'], cwd),
    gitExec(['config', 'init.defaultBranch'], cwd),
  ])
  return {
    success: true,
    output: JSON.stringify({
      userName: userName.output || '',
      userEmail: userEmail.output || '',
      remoteFetch: remoteFetch.output || '',
      remotePush: remotePush.output || '',
      defaultBranch: defaultBranch.output || '',
    }),
  }
})

// ── IPC: Save As dialog ────────────────────────────────────────────────────
// Generic save dialog so renderer can pick an output path for exports.
// Renderer passes a default path (usually source-file-next-door) + extension
// filters; Electron returns the absolute path the user chose (or null if
// cancelled). Keeping the policy in main lets all export/import flows share
// the same picker, and keeps the "output location" UX identical across them.
ipcMain.handle('dialog:saveAs', async (_e, defaultPath: string, filters: Electron.FileFilter[]) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '다른 이름으로 저장',
    defaultPath,
    filters,
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

// ── Markdown → HTML (shared) ───────────────────────────────────────────────
// GFM options (tables/task-lists) are set once in loadMarked() when the
// module first loads.

async function buildPrintableHtml(md: string, baseDir: string, title: string): Promise<string> {
  const { marked } = await loadMarked()
  const bodyHtml = marked.parse(md, { async: false }) as string
  // Minimal but readable print style. No reliance on app CSS so the output
  // is self-contained and doesn't drag in Docuflow's sidebar/toolbar styles.
  const css = `
    @page { margin: 18mm 16mm; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: 'Malgun Gothic', 'Segoe UI', -apple-system, sans-serif;
      color: #222; line-height: 1.65; font-size: 11pt;
    }
    h1, h2, h3, h4, h5, h6 { font-weight: 600; margin: 1.2em 0 0.5em; line-height: 1.3; }
    h1 { font-size: 1.9em; border-bottom: 2px solid #ddd; padding-bottom: 0.2em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.15em; }
    h3 { font-size: 1.25em; } h4 { font-size: 1.1em; }
    p { margin: 0.6em 0; }
    code { background: #f5f5f5; padding: 1px 5px; border-radius: 3px; font-family: Consolas, monospace; font-size: 0.92em; }
    pre { background: #f6f8fa; padding: 12px 14px; border-radius: 6px; overflow: auto; font-size: 0.88em; page-break-inside: avoid; }
    pre code { background: transparent; padding: 0; }
    blockquote { margin: 0.6em 0; padding: 0.2em 1em; border-left: 4px solid #ccc; color: #555; }
    ul, ol { padding-left: 1.6em; }
    li { margin: 0.15em 0; }
    table { border-collapse: collapse; margin: 0.8em 0; max-width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
    th { background: #f3f4f6; }
    img { max-width: 100%; height: auto; }
    a { color: #0366d6; text-decoration: none; }
    hr { border: 0; border-top: 1px solid #ddd; margin: 1.2em 0; }
  `
  // <base> lets relative image paths in the markdown resolve against the
  // source file's folder when the print window loads this HTML.
  const baseHref = 'file:///' + baseDir.replace(/\\/g, '/').replace(/^\/+/, '') + '/'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><base href="${baseHref}"><title>${title}</title><style>${css}</style></head><body>${bodyHtml}</body></html>`
}

// ── IPC: Export MD → PDF ───────────────────────────────────────────────────
// Strategy: render markdown to self-contained HTML in main, load it in a
// hidden BrowserWindow, then printToPDF. Keeps the main UI untouched during
// export (no CSS contamination, no flicker) and gives a clean output.
ipcMain.handle('export:pdf', async (_e, srcMdPath: string, destPath: string) => {
  try {
    const md = await readFile(srcMdPath, 'utf-8')
    const baseDir = dirname(srcMdPath)
    const html = await buildPrintableHtml(md, baseDir, basename(srcMdPath))
    const tmpHtml = join(app.getPath('temp'), `docuflow-pdf-${Date.now()}.html`)
    await writeFile(tmpHtml, html, 'utf-8')

    const win = new BrowserWindow({
      show: false,
      webPreferences: { webSecurity: false, sandbox: false },
    })
    try {
      await win.loadFile(tmpHtml)
      // Give browser a tick to lay out images/fonts.
      await new Promise((r) => setTimeout(r, 200))
      const pdfBuffer = await win.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 },
      })
      await writeFile(destPath, pdfBuffer)
    } finally {
      if (!win.isDestroyed()) win.close()
      await unlink(tmpHtml).catch(() => {})
    }
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Export MD → DOCX ──────────────────────────────────────────────────
// Delegates to html-to-docx: marked renders MD → HTML, then the library maps
// HTML elements (headings, paragraphs, lists, tables, blockquote, code,
// inline strong/em/del/link/img) to OOXML. Avoids the bugs in our previous
// hand-rolled token→docx walker (style propagation, nested lists, etc.).
// Local images referenced by relative path are read from disk and inlined
// as data URIs so Word embeds them rather than showing broken links.
async function inlineLocalImagesInHtml(html: string, baseDir: string): Promise<string> {
  const imgRe = /<img([^>]*?)\ssrc=["']([^"']+)["']([^>]*)>/gi
  const replacements: { match: string; replacement: string }[] = []
  let match: RegExpExecArray | null
  while ((match = imgRe.exec(html)) !== null) {
    const src = match[2]
    if (/^(https?:|data:)/i.test(src)) continue
    try {
      const absPath = /^[a-zA-Z]:[\\/]|^[\\/]/.test(src) ? src : join(baseDir, src)
      if (!existsSync(absPath)) continue
      const buf = await readFile(absPath)
      const ext = extname(absPath).slice(1).toLowerCase() || 'png'
      const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
      const dataUri = `data:${mime};base64,${buf.toString('base64')}`
      replacements.push({
        match: match[0],
        replacement: `<img${match[1]} src="${dataUri}"${match[3]}>`,
      })
    } catch { /* skip broken images */ }
  }
  let out = html
  for (const r of replacements) out = out.replace(r.match, r.replacement)
  return out
}

ipcMain.handle('export:docx', async (_e, srcMdPath: string, destPath: string) => {
  try {
    const md = await readFile(srcMdPath, 'utf-8')
    // Strip YAML frontmatter — it's metadata, not document body content.
    const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    const { marked } = await loadMarked()
    const rawHtml = marked.parse(body, { async: false }) as string
    const baseDir = dirname(srcMdPath)
    const htmlWithImages = await inlineLocalImagesInHtml(rawHtml, baseDir)
    // Wrap in a minimal document — html-to-docx expects a full or fragment
    // HTML; giving it a <html><body> shell avoids edge cases.
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>${htmlWithImages}</body></html>`

    // html-to-docx ships CJS (dist/html-to-docx.umd.js). The default export
    // is the async converter. TS types are loose, so cast.
    const htmlToDocxMod = require('html-to-docx')
    const htmlToDocx: (html: string, header?: string | null, opts?: Record<string, unknown>) => Promise<Buffer | ArrayBuffer> =
      htmlToDocxMod.default || htmlToDocxMod
    // html-to-docx@1.8.0 reads each `margins` field directly and serializes
    // missing ones as the literal string "undefined", which violates the
    // pgMar schema and makes Word refuse to open the file. All six fields
    // (top/bottom/left/right/header/footer/gutter) must be supplied.
    const result = await htmlToDocx(fullHtml, null, {
      margins: {
        top: 1440, bottom: 1440, left: 1440, right: 1440, // 1 inch (twips)
        header: 720, footer: 720, gutter: 0,
      },
      table: { row: { cantSplit: true } },
      font: 'Malgun Gothic',
      fontSize: 22, // half-points → 11pt
    })
    const buf = Buffer.isBuffer(result) ? result : Buffer.from(result as ArrayBuffer)
    await writeFile(destPath, buf)
    return { success: true }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Import DOCX → MD ──────────────────────────────────────────────────
// mammoth's bundled `convertToMarkdown` does not support tables. We go through
// HTML and let turndown+GFM build pipe tables. Two HTML post-processes are
// required before turndown:
//
// 1. Promote the first <tr>'s <td>s to <th>. turndown-plugin-gfm's table rule
//    ONLY fires when the first row is all <th>; Word docs rarely flag a header
//    style so mammoth emits <td>s throughout and the table would fall back to
//    `keep()` (raw HTML) — which our markdown renderer then strips.
//
// 2. Flatten <p> tags inside <td>/<th>. GFM pipe tables must stay on one line
//    per row; a literal newline inside a cell splits the row into paragraphs.
//    mammoth wraps every cell's text in <p>, so without this step the pipes
//    land on their own lines and the table is mangled into scattered text.
function promoteFirstRowToTh(html: string): string {
  return html.replace(/<table(\b[^>]*)>([\s\S]*?)<\/table>/gi, (match, attrs: string, inner: string) => {
    if (/<th[\s>]/i.test(inner)) return match
    const trMatch = inner.match(/<tr(\b[^>]*)>([\s\S]*?)<\/tr>/i)
    if (!trMatch) return match
    const [fullTr, trAttrs, trInner] = trMatch
    const promotedInner = trInner.replace(/<td(\b[^>]*)>([\s\S]*?)<\/td>/gi, '<th$1>$2</th>')
    const promotedTr = `<tr${trAttrs}>${promotedInner}</tr>`
    return `<table${attrs}>${inner.replace(fullTr, promotedTr)}</table>`
  })
}

function flattenTableCells(html: string): string {
  return html.replace(/<(td|th)(\b[^>]*)>([\s\S]*?)<\/\1>/gi, (_m, tag: string, attrs: string, inner: string) => {
    // Replace <p>…</p> blocks with their text + <br>, then drop the trailing <br>.
    let body = inner.replace(/<p(\b[^>]*)>([\s\S]*?)<\/p>/gi, (_pm, _pa, pc: string) => pc + '<br>')
    body = body.replace(/(?:<br\s*\/?\s*>\s*)+$/i, '')
    // Collapse whitespace and escape pipes so raw `|` in cell text doesn't
    // split the row.
    body = body.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').replace(/ {2,}/g, ' ').trim()
    return `<${tag}${attrs}>${body}</${tag}>`
  })
}

ipcMain.handle('import:docxToMd', async (_e, srcDocxPath: string, destPath: string) => {
  try {
    const { value: rawHtml, messages } = await mammoth.convertToHtml({ path: srcDocxPath })
    const html = flattenTableCells(promoteFirstRowToTh(rawHtml))
    const td = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '_',
      strongDelimiter: '**',
      linkStyle: 'inlined',
    })
    td.use(turndownPluginGfm.gfm)
    const md = td.turndown(html)
    await writeFile(destPath, md, 'utf-8')
    return { success: true, messages: messages.map((m) => m.message) }
  } catch (err: unknown) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
})

// ── IPC: Google Calendar ──────────────────────────────────────────────────────
ipcMain.handle('calendar:signIn', async () => {
  try {
    return await googleAuth.signIn()
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('calendar:signOut', () => {
  googleAuth.signOut()
  return { success: true }
})

ipcMain.handle('calendar:isSignedIn', () => {
  return googleAuth.isSignedIn()
})

ipcMain.handle('calendar:listCalendars', async () => {
  try {
    const calendars = await googleCalendar.listCalendars()
    return { success: true, data: calendars }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('calendar:selectCalendars', (_e, ids: string[]) => {
  googleAuth.setSelectedCalendarIds(ids)
  return { success: true }
})

ipcMain.handle('calendar:getSelectedCalendars', () => {
  return googleAuth.getSelectedCalendarIds()
})

ipcMain.handle('calendar:listEvents', async (_e, timeMin: string, timeMax: string) => {
  try {
    const calendarIds = googleAuth.getSelectedCalendarIds()
    if (calendarIds.length === 0) return { success: false, error: '캘린더를 선택해주세요.' }
    // 여러 캘린더의 이벤트를 병렬로 조회 후 병합
    const results = await Promise.all(
      calendarIds.map(id => googleCalendar.listEvents(id, timeMin, timeMax).catch(() => []))
    )
    const allEvents = results.flat()
    // 시작 시간 기준 정렬
    allEvents.sort((a, b) => {
      const aTime = a.start.dateTime || a.start.date || ''
      const bTime = b.start.dateTime || b.start.date || ''
      return aTime.localeCompare(bTime)
    })
    return { success: true, data: allEvents }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('calendar:createEvent', async (_e, calendarId: string, event: googleCalendar.CalendarEventData) => {
  try {
    if (!calendarId) return { success: false, error: '캘린더를 선택해주세요.' }
    const created = await googleCalendar.createEvent(calendarId, event)
    return { success: true, data: created }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('calendar:updateEvent', async (_e, calendarId: string, eventId: string, updates: Partial<googleCalendar.CalendarEventData>) => {
  try {
    if (!calendarId) return { success: false, error: '캘린더를 선택해주세요.' }
    const updated = await googleCalendar.updateEvent(calendarId, eventId, updates)
    return { success: true, data: updated }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

ipcMain.handle('calendar:deleteEvent', async (_e, calendarId: string, eventId: string) => {
  try {
    if (!calendarId) return { success: false, error: '캘린더를 선택해주세요.' }
    await googleCalendar.deleteEvent(calendarId, eventId)
    return { success: true }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})
