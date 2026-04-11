import { useEffect, useCallback } from 'react'
import { useAppStore, projectCounter, setProjectCounter } from './stores/useAppStore'
import { registerCurrentUserGetter } from './utils/mdTemplates'
import { useWorkflowStore } from './stores/useWorkflowStore'
import Toolbar from './components/Toolbar'
import TabBar from './components/TabBar'
import Sidebar from './components/Sidebar'
import MarkdownEditor from './components/MarkdownEditor'
import ImageViewer from './components/ImageViewer'
import PdfViewer from './components/PdfViewer'
import DocxViewer from './components/DocxViewer'
import VideoPlayer from './components/VideoPlayer'
import WelcomeScreen from './components/WelcomeScreen'
import KanbanBoard from './components/KanbanBoard'
import CalendarView from './components/CalendarView'
import WorkflowBoard from './components/WorkflowBoard'
import { isRecentlySaved } from './utils/recentSave'

// Allow mdTemplates to resolve the current user (for {{author}}) without a circular import
registerCurrentUserGetter(() => useAppStore.getState().currentUser)

export default function App() {
  const {
    tabs,
    activeTabId,
    darkMode,
    projects,
    addProject,
    openTab,
    setTabFileChanged,
    sidebarTab,
  } = useAppStore()

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  // ── Initialize from electron-store ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [savedDark, savedSize, savedFont, savedFavs, savedRecent, savedProjects, savedTags, savedTagColors, savedProjectColors, savedSidebarCollapsed, savedSpellcheck, savedCurrentUser] = await Promise.all([
        window.electronAPI.storeGet('darkMode'),
        window.electronAPI.storeGet('fontSize'),
        window.electronAPI.storeGet('fontFamily'),
        window.electronAPI.storeGet('favorites'),
        window.electronAPI.storeGet('recentFiles'),
        window.electronAPI.storeGet('projects'),
        window.electronAPI.storeGet('fileTags'),
        window.electronAPI.storeGet('tagColors'),
        window.electronAPI.storeGet('projectColors'),
        window.electronAPI.storeGet('sidebarCollapsed'),
        window.electronAPI.storeGet('spellcheckEnabled'),
        window.electronAPI.storeGet('currentUser'),
      ])

      const dark = (savedDark as string) || 'system'
      const size = (savedSize as number) || 16
      const font = (savedFont as string) || 'default'
      const favs = (savedFavs as string[]) || []
      const recent = (savedRecent as { path: string; name: string }[]) || []
      const projs = (savedProjects as { path: string; name: string }[]) || []
      const tags = (savedTags as Record<string, string[]>) || {}
      const tagColors = (savedTagColors as Record<string, string>) || {}
      const projectColors = (savedProjectColors as Record<string, number>) || {}
      const sidebarCollapsed = (savedSidebarCollapsed as boolean) || false
      const spellcheckEnabled = (savedSpellcheck as boolean) ?? false
      const currentUser = (savedCurrentUser as string) || ''

      document.documentElement.style.setProperty('--md-font-size', `${size}px`)
      // Apply saved font family
      const families: Record<string, string> = {
        'default': "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif",
        'pretendard': "'Pretendard', 'Malgun Gothic', sans-serif",
        'noto-sans': "'Noto Sans KR', 'Malgun Gothic', sans-serif",
        'nanumgothic': "'NanumGothic', 'Malgun Gothic', sans-serif",
        'nanummyeongjo': "'NanumMyeongjo', 'Batang', serif",
        'malgun': "'Malgun Gothic', sans-serif",
        'gulim': "'Gulim', sans-serif",
      }
      document.documentElement.style.setProperty('--md-font-family', families[font] || families['default'])

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
        fontFamily: font,
        favorites: favs,
        recentFiles: recent,
        projects: restoredProjects,
        fileTags: tags,
        tagColors,
        projectColors,
        sidebarCollapsed,
        spellcheckEnabled,
        currentUser,
      })
    }
    init()
  }, [])

  // ── Workflow index: scan all projects when project list changes ──────────
  useEffect(() => {
    if (projects.length === 0) return
    useWorkflowStore.getState().scanProjects(projects.map(p => p.path))
  }, [projects])

  // Refresh workflow entries when directories change on disk (file created/removed/edited externally)
  useEffect(() => {
    const unsub = window.electronAPI.onDirChanged((changedPath) => {
      const matchingProject = projects.find(p => changedPath === p.path || changedPath.startsWith(p.path))
      if (matchingProject) {
        useWorkflowStore.getState().scanProject(matchingProject.path)
      }
    })
    return unsub
  }, [projects])

  // ── File change watcher ───────────────────────────────────────────────────
  // Ignore file-change events for files recently saved by the app itself
  useEffect(() => {
    const unsub = window.electronAPI.onFileChanged((filePath) => {
      if (isRecentlySaved(filePath)) return
      setTabFileChanged(filePath, true)
    })
    return unsub
  }, [setTabFileChanged])

  // ── Warn before closing with unsaved changes ─────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI.onBeforeClose(() => {
      const hasDirty = useAppStore.getState().tabs.some(t => t.isDirty)
      if (hasDirty) {
        const ok = window.confirm('저장하지 않은 문서가 있습니다. 저장하지 않고 종료하시겠습니까?')
        window.electronAPI.confirmClose(ok)
      } else {
        window.electronAPI.confirmClose(true)
      }
    })
    return unsub
  }, [])

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
    // Markdown files
    if (ext === 'md' || ext === 'markdown') {
      const result = await window.electronAPI.readFile(filePath)
      if (result.success && result.content !== undefined) {
        openTab(filePath, fileName, result.content, 'md', preview)
        useAppStore.getState().addRecentFile(filePath, fileName)
        window.electronAPI.watchFile(filePath)
      }
      return
    }
    // Unsupported file types — show guide screen
    openTab(filePath, fileName, '', 'other', preview)
  }, [openTab])

  // ── Open file from menu ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { path, name } = (e as CustomEvent).detail
      openFile(path, name, false)
    }
    window.addEventListener('menu:openFile', handler)
    return () => window.removeEventListener('menu:openFile', handler)
  }, [openFile])

  // ── Open file from OS (command line, file association, second-instance) ───
  useEffect(() => {
    const unsub = window.electronAPI.onOpenExternal((filePath) => {
      const name = filePath.split(/[/\\]/).pop() || filePath
      openFile(filePath, name, false)
    })
    return unsub
  }, [openFile])

  // ── Ctrl+O: Open file dialog ─────────────────────────────────────────────
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault()
        const paths = await window.electronAPI.openFileDialog()
        if (paths) {
          for (const p of paths) {
            const name = p.split(/[/\\]/).pop() || p
            openFile(p, name, false)
          }
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openFile])

  // ── Drag & drop files onto app ────────────────────────────────────────────
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
    }
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer?.files) {
        for (const file of Array.from(e.dataTransfer.files)) {
          const filePath = window.electronAPI.getPathForFile(file)
          if (filePath) {
            openFile(filePath, file.name, false)
          }
        }
      }
    }
    document.addEventListener('dragover', handleDragOver)
    document.addEventListener('drop', handleDrop)
    return () => {
      document.removeEventListener('dragover', handleDragOver)
      document.removeEventListener('drop', handleDrop)
    }
  }, [openFile])

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
          {sidebarTab !== 'kanban' && sidebarTab !== 'calendar' && sidebarTab !== 'workflow' && <TabBar />}
          <main className="flex-1 overflow-hidden">
          {sidebarTab === 'calendar' ? (
            <CalendarView onOpenFile={(p, n) => { useAppStore.getState().setSidebarTab('tree'); openFile(p, n, false) }} />
          ) : sidebarTab === 'kanban' ? (
            <KanbanBoard onOpenFile={(p, n) => { useAppStore.getState().setSidebarTab('tree'); openFile(p, n, false) }} />
          ) : sidebarTab === 'workflow' ? (
            <WorkflowBoard onOpenFile={(p, n) => { useAppStore.getState().setSidebarTab('tree'); openFile(p, n, false) }} />
          ) : activeTab ? (
            activeTab.fileType === 'image'
              ? <ImageViewer tab={activeTab} onOpenFile={(p, n) => openFile(p, n, true)} />
              : activeTab.fileType === 'video'
              ? <VideoPlayer tab={activeTab} />
              : activeTab.fileType === 'pdf'
              ? <PdfViewer tab={activeTab} />
              : activeTab.fileType === 'docx'
              ? <DocxViewer tab={activeTab} />
              : activeTab.fileType === 'other'
              ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400 dark:text-gray-500">
                  <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div className="text-center">
                    <p className="text-lg font-medium text-gray-500 dark:text-gray-400">{activeTab.fileName}</p>
                    <p className="text-sm mt-1">이 파일 형식은 Docuflow에서 미리볼 수 없습니다.</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">기본 프로그램으로 열려면 아래 버튼을 클릭하세요.</p>
                  </div>
                  <button
                    onClick={() => window.electronAPI.openPath(activeTab.filePath)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    기본 앱으로 열기
                  </button>
                  <button
                    onClick={() => window.electronAPI.showItemInFolder(activeTab.filePath)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                    탐색기에서 보기
                  </button>
                </div>
              )
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
