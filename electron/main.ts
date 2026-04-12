import { app, BrowserWindow, ipcMain, dialog, nativeTheme, shell, nativeImage, clipboard } from 'electron'
import { join, basename, extname } from 'path'
import { readdir, readFile, writeFile, stat, mkdir, copyFile } from 'fs/promises'
import { statSync, existsSync } from 'fs'
import { execFile } from 'child_process'
import mammoth from 'mammoth'
import Store from 'electron-store'
import chokidar from 'chokidar'
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
        nodes.push({ name: entry.name, path: fullPath, type: 'file' })
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

ipcMain.handle('fs:watchDir', (_e, dirPath: string) => {
  if (dirWatchers.has(dirPath)) return
  const watcher = chokidar.watch(dirPath, {
    ignoreInitial: true,
    usePolling: false,
    depth: 8,
    ignored: /(^|[/\\])\../,   // 숨김 파일 무시
  })
  const notify = () => {
    // 연속 변경을 300ms 디바운스로 묶어서 한 번만 알림
    const existing = dirTimers.get(dirPath)
    if (existing) clearTimeout(existing)
    dirTimers.set(dirPath, setTimeout(() => {
      mainWindow?.webContents.send('fs:dirChanged', dirPath)
      dirTimers.delete(dirPath)
    }, 300))
  }
  watcher.on('add', notify).on('unlink', notify).on('addDir', notify).on('unlinkDir', notify)
  dirWatchers.set(dirPath, watcher)
})

ipcMain.handle('fs:unwatchDir', (_e, dirPath: string) => {
  const existing = dirTimers.get(dirPath)
  if (existing) { clearTimeout(existing); dirTimers.delete(dirPath) }
  const watcher = dirWatchers.get(dirPath)
  if (watcher) { watcher.close(); dirWatchers.delete(dirPath) }
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
  const nameLower = name.toLowerCase()
  const nameWithMd = nameLower.endsWith('.md') ? nameLower : nameLower + '.md'
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = join(dirPath, entry.name)
      if (entry.isDirectory()) {
        const found = await findFileInDir(fullPath, name, depth + 1)
        if (found) return found
      } else if (entry.isFile()) {
        const entryLower = entry.name.toLowerCase()
        if (entryLower === nameLower || entryLower === nameWithMd) {
          return fullPath
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
  return existsSync(join(cwd, '.git'))
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
  return gitExec(['pull'], cwd)
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
  // Push and capture both stdout+stderr to detect "Everything up-to-date"
  return new Promise((resolve) => {
    execFile('git', ['push', '-u', 'origin', branch], { cwd, timeout: 30000, shell: true }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, error: stderr.trim() || err.message })
      } else {
        const combined = (stdout + stderr).toLowerCase()
        if (combined.includes('everything up-to-date') || combined.includes('up to date')) {
          resolve({ success: false, error: '올릴 커밋이 없습니다. 변경사항을 먼저 커밋하세요.' })
        } else {
          resolve({ success: true, output: stdout.trimEnd() || stderr.trimEnd() })
        }
      }
    })
  })
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
