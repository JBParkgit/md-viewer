import { useEffect, useCallback } from 'react'
import { useAppStore, projectCounter, setProjectCounter } from './stores/useAppStore'
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import MarkdownEditor from './components/MarkdownEditor'
import ImageViewer from './components/ImageViewer'
import PdfViewer from './components/PdfViewer'
import DocxViewer from './components/DocxViewer'
import VideoPlayer from './components/VideoPlayer'
import WelcomeScreen from './components/WelcomeScreen'
import { isRecentlySaved } from './utils/recentSave'

export default function App() {
  const {
    tabs,
    activeTabId,
    darkMode,
    projects,
    addProject,
    openTab,
    setTabFileChanged,
  } = useAppStore()

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  // ── Initialize from electron-store ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [savedDark, savedSize, savedFavs, savedRecent, savedProjects, savedTags] = await Promise.all([
        window.electronAPI.storeGet('darkMode'),
        window.electronAPI.storeGet('fontSize'),
        window.electronAPI.storeGet('favorites'),
        window.electronAPI.storeGet('recentFiles'),
        window.electronAPI.storeGet('projects'),
        window.electronAPI.storeGet('fileTags'),
      ])

      const dark = (savedDark as string) || 'system'
      const size = (savedSize as number) || 16
      const favs = (savedFavs as string[]) || []
      const recent = (savedRecent as { path: string; name: string }[]) || []
      const projs = (savedProjects as { path: string; name: string }[]) || []
      const tags = (savedTags as Record<string, string[]>) || {}

      document.documentElement.style.setProperty('--md-font-size', `${size}px`)

      const isDark = await window.electronAPI.isDark()
      if (dark === 'dark' || (dark === 'system' && isDark)) {
        document.documentElement.classList.add('dark')
      }

      // Restore projects (sync shared counter to avoid ID collisions)
      let counter = projectCounter
      const restoredProjects = projs.map(p => ({
        id: `proj-${++counter}`,
        path: p.path,
        name: p.name,
        collapsed: true,
      }))
      setProjectCounter(counter)

      useAppStore.setState({
        darkMode: dark as 'system' | 'light' | 'dark',
        fontSize: size,
        favorites: favs,
        recentFiles: recent,
        projects: restoredProjects,
        fileTags: tags,
      })
    }
    init()
  }, [])

  // ── File change watcher ───────────────────────────────────────────────────
  // Ignore file-change events for files recently saved by the app itself
  useEffect(() => {
    const unsub = window.electronAPI.onFileChanged((filePath) => {
      if (isRecentlySaved(filePath)) return
      setTabFileChanged(filePath, true)
    })
    return unsub
  }, [setTabFileChanged])

  // ── Open file helpers ─────────────────────────────────────────────────────
  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const VIDEO_EXTS = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv']
  const PDF_EXTS = ['pdf']
  const DOCX_EXTS = ['doc', 'docx']
  const TEXT_EXTS = ['txt', 'log', 'ini', 'env', 'toml']

  const openFile = useCallback(async (filePath: string, fileName: string, preview = true) => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTS.includes(ext)) {
      openTab(filePath, fileName, '', 'image', preview)
      useAppStore.getState().addRecentFile(filePath, fileName)
      return
    }
    if (VIDEO_EXTS.includes(ext)) {
      openTab(filePath, fileName, '', 'video', preview)
      useAppStore.getState().addRecentFile(filePath, fileName)
      return
    }
    if (PDF_EXTS.includes(ext)) {
      openTab(filePath, fileName, '', 'pdf', preview)
      useAppStore.getState().addRecentFile(filePath, fileName)
      return
    }
    if (DOCX_EXTS.includes(ext)) {
      openTab(filePath, fileName, '', 'docx', preview)
      useAppStore.getState().addRecentFile(filePath, fileName)
      return
    }
    if (TEXT_EXTS.includes(ext)) {
      const result = await window.electronAPI.readFile(filePath)
      if (result.success && result.content !== undefined) {
        openTab(filePath, fileName, result.content, 'md', preview)
        useAppStore.getState().addRecentFile(filePath, fileName)
        window.electronAPI.watchFile(filePath)
      }
      return
    }
    const result = await window.electronAPI.readFile(filePath)
    if (result.success && result.content !== undefined) {
      openTab(filePath, fileName, result.content, 'md', preview)
      useAppStore.getState().addRecentFile(filePath, fileName)
      window.electronAPI.watchFile(filePath)
    }
  }, [openTab])

  // ── Dark mode class sync ──────────────────────────────────────────────────
  useEffect(() => {
    if (darkMode === 'dark') document.documentElement.classList.add('dark')
    else if (darkMode === 'light') document.documentElement.classList.remove('dark')
  }, [darkMode])

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <Toolbar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onOpenFile={(p, n) => openFile(p, n, true)}
          onOpenFilePinned={(p, n) => openFile(p, n, false)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar />
          <main className="flex-1 overflow-hidden">
          {activeTab ? (
            activeTab.fileType === 'image'
              ? <ImageViewer tab={activeTab} />
              : activeTab.fileType === 'video'
              ? <VideoPlayer tab={activeTab} />
              : activeTab.fileType === 'pdf'
              ? <PdfViewer tab={activeTab} />
              : activeTab.fileType === 'docx'
              ? <DocxViewer tab={activeTab} />
              : <MarkdownEditor tab={activeTab} />
          ) : (
            <WelcomeScreen />
          )}
          </main>
        </div>
      </div>
    </div>
  )
}
