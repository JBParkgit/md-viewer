import { useEffect, useCallback, useState, useRef } from 'react'
import { useAppStore, projectCounter, setProjectCounter } from './stores/useAppStore'
import { registerCurrentUserGetter } from './utils/mdTemplates'
import { useWorkflowStore } from './stores/useWorkflowStore'
import Toolbar from './components/Toolbar'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import KanbanBoard from './components/KanbanBoard'
import CalendarView from './components/CalendarView'
import WorkflowBoard from './components/WorkflowBoard'
import PullResultModal from './components/PullResultModal'
import DialogHost from './components/DialogHost'
import { confirm } from './utils/dialog'
import { isRecentlySaved } from './utils/recentSave'

// Allow mdTemplates to resolve the current user (for {{author}}) without a circular import
registerCurrentUserGetter(() => useAppStore.getState().currentUser)

function SplitDivider() {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setDragging(true)
    const parent = ref.current?.parentElement
    if (!parent) return
    const startX = e.clientX
    const startWidth = (parent.children[0] as HTMLElement).getBoundingClientRect().width
    const totalWidth = parent.getBoundingClientRect().width

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX
      const pct = Math.min(80, Math.max(20, ((startWidth + delta) / totalWidth) * 100))
      ;(parent.children[0] as HTMLElement).style.flex = `0 0 ${pct}%`
      ;(parent.children[2] as HTMLElement).style.flex = `0 0 ${100 - pct}%`
    }
    const onUp = () => {
      setDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  return (
    <div
      ref={ref}
      onMouseDown={onMouseDown}
      className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 transition-colors ${
        dragging ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'
      }`}
    />
  )
}

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
    splitMode,
  } = useAppStore()

  // ── Initialize from electron-store ────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [savedDark, savedSize, savedFont, savedFavs, savedRecent, savedProjects, savedTags, savedTagColors, savedProjectColors, savedSidebarCollapsed, savedSpellcheck, savedCurrentUser, savedOpenDirs] = await Promise.all([
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
        window.electronAPI.storeGet('openDirs'),
      ])

      const dark = (savedDark as string) || 'system'
      const size = (savedSize as number) || 16
      const font = (savedFont as string) || 'default'
      const favs = (savedFavs as string[]) || []
      const recent = (savedRecent as { path: string; name: string }[]) || []
      const projs = ((savedProjects as { path: string; name: string }[]) || []).map(p => ({
        ...p,
        path: p.path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
          .replace(/^([a-zA-Z]):\//, (_, d: string) => d.toUpperCase() + ':/')
      }))
      const tags = (savedTags as Record<string, string[]>) || {}
      const tagColors = (savedTagColors as Record<string, string>) || {}
      const projectColors = (savedProjectColors as Record<string, number>) || {}
      const sidebarCollapsed = (savedSidebarCollapsed as boolean) || false
      const spellcheckEnabled = (savedSpellcheck as boolean) ?? false
      const currentUser = (savedCurrentUser as string) || ''
      const openDirs = (savedOpenDirs as Record<string, string[]>) || {}

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
        openDirs,
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
  // Ignore file-change events for files recently saved by the app itself.
  // If no user edit is pending, reload silently so external edits (e.g. Claude
  // Code, git pull) appear instantly. If the tab has unsaved changes, keep the
  // existing "externally changed" banner so the user chooses what to keep.
  useEffect(() => {
    const unsub = window.electronAPI.onFileChanged(async (filePath) => {
      if (isRecentlySaved(filePath)) return
      const s = useAppStore.getState()
      const matches = [...s.tabs, ...s.rightTabs].filter(t => t.filePath === filePath)
      if (matches.length === 0) return
      const hasDirty = matches.some(t => t.isDirty)
      if (!hasDirty) {
        const res = await window.electronAPI.readFile(filePath)
        if (res.success && res.content !== undefined) {
          for (const t of matches) useAppStore.getState().markTabSaved(t.id, res.content)
        }
        return
      }
      setTabFileChanged(filePath, true)
    })
    return unsub
  }, [setTabFileChanged])

  // ── Warn before closing with unsaved changes ─────────────────────────────
  useEffect(() => {
    const unsub = window.electronAPI.onBeforeClose(async () => {
      const s = useAppStore.getState()
      const hasDirty = s.tabs.some(t => t.isDirty) || s.rightTabs.some(t => t.isDirty)
      if (hasDirty) {
        const ok = await confirm({
          title: '저장하지 않은 문서가 있습니다',
          message: '저장하지 않고 종료하시겠습니까?',
          confirmLabel: '종료',
          variant: 'danger',
        })
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
  const TEXT_EXTS = [
    'txt', 'log', 'ini', 'env', 'toml',
    'json', 'yml', 'yaml', 'xml', 'csv',
    'js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs',
    'py', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
    'html', 'htm', 'css', 'scss', 'sass', 'less',
    'sh', 'bash', 'zsh', 'bat', 'cmd', 'ps1',
    'sql', 'graphql', 'dockerfile', 'gitignore', 'editorconfig', 'conf', 'cfg', 'properties',
  ]

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

  // ── Back/forward preview navigation ────────────────────────────────────────
  useEffect(() => {
    const go = async (direction: 'back' | 'forward') => {
      const store = useAppStore.getState()
      const path = direction === 'back' ? store.navigateBack() : store.navigateForward()
      if (!path) return
      const name = path.split(/[/\\]/).pop() || path
      try {
        await openFile(path, name, true)
      } finally {
        useAppStore.setState({ _skipNavPush: false })
      }
    }
    const navHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { direction: 'back' | 'forward' }
      go(detail.direction)
    }
    const keyHandler = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key === 'ArrowLeft') { e.preventDefault(); go('back') }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go('forward') }
    }
    window.addEventListener('nav:go', navHandler)
    window.addEventListener('keydown', keyHandler)
    return () => {
      window.removeEventListener('nav:go', navHandler)
      window.removeEventListener('keydown', keyHandler)
    }
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
      <PullResultModal />
      <DialogHost />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onOpenFile={(p, n) => openFile(p, n, true)}
          onOpenFilePinned={(p, n) => openFile(p, n, false)}
        />
        <div className="flex-1 flex flex-col overflow-hidden">
          {sidebarTab === 'calendar' ? (
            <CalendarView onOpenFile={(p, n) => { useAppStore.getState().setSidebarTab('tree'); openFile(p, n, false) }} />
          ) : sidebarTab === 'kanban' ? (
            <KanbanBoard onOpenFile={(p, n) => { useAppStore.getState().setSidebarTab('tree'); openFile(p, n, false) }} />
          ) : sidebarTab === 'workflow' ? (
            <WorkflowBoard onOpenFile={(p, n) => { useAppStore.getState().setSidebarTab('tree'); openFile(p, n, false) }} />
          ) : (
            <div className="flex-1 flex overflow-hidden">
              <EditorPane paneId="left" openFile={openFile} />
              {splitMode && (
                <>
                  <SplitDivider />
                  <EditorPane paneId="right" openFile={openFile} />
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
