import { useEffect, useCallback } from 'react'
import { useAppStore } from './stores/useAppStore'
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import MarkdownEditor from './components/MarkdownEditor'
import ImageViewer from './components/ImageViewer'
import WelcomeScreen from './components/WelcomeScreen'

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
      const [savedDark, savedSize, savedFavs, savedRecent, savedProjects] = await Promise.all([
        window.electronAPI.storeGet('darkMode'),
        window.electronAPI.storeGet('fontSize'),
        window.electronAPI.storeGet('favorites'),
        window.electronAPI.storeGet('recentFiles'),
        window.electronAPI.storeGet('projects'),
      ])

      const dark = (savedDark as string) || 'system'
      const size = (savedSize as number) || 16
      const favs = (savedFavs as string[]) || []
      const recent = (savedRecent as { path: string; name: string }[]) || []
      const projs = (savedProjects as { path: string; name: string }[]) || []

      document.documentElement.style.setProperty('--md-font-size', `${size}px`)

      const isDark = await window.electronAPI.isDark()
      if (dark === 'dark' || (dark === 'system' && isDark)) {
        document.documentElement.classList.add('dark')
      }

      // Restore projects with counters
      let projectCounter = 0
      const restoredProjects = projs.map(p => ({
        id: `proj-${++projectCounter}`,
        path: p.path,
        name: p.name,
        collapsed: true,
      }))

      useAppStore.setState({
        darkMode: dark as 'system' | 'light' | 'dark',
        fontSize: size,
        favorites: favs,
        recentFiles: recent,
        projects: restoredProjects,
      })
    }
    init()
  }, [])

  // ── File change watcher ───────────────────────────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI.onFileChanged((filePath) => {
      setTabFileChanged(filePath, true)
    })
    return unsub
  }, [setTabFileChanged])

  // ── Open file helpers ─────────────────────────────────────────────────────
  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']

  const openFile = useCallback(async (filePath: string, fileName: string, preview = true) => {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
    if (IMAGE_EXTS.includes(ext)) {
      openTab(filePath, fileName, '', 'image', preview)
      useAppStore.getState().addRecentFile(filePath, fileName)
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
      <TabBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onOpenFile={(p, n) => openFile(p, n, true)}
          onOpenFilePinned={(p, n) => openFile(p, n, false)}
        />
        <main className="flex-1 overflow-hidden">
          {activeTab ? (
            activeTab.fileType === 'image'
              ? <ImageViewer tab={activeTab} />
              : <MarkdownEditor tab={activeTab} />
          ) : (
            <WelcomeScreen />
          )}
        </main>
      </div>
    </div>
  )
}
