import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useAppStore, type Project } from '../stores/useAppStore'
import FileTree from './FileTree'
import type { FileNode } from '../types/electron'
import { type MdTemplate, loadCustomTemplates, saveAsTemplate, getCategories } from '../utils/mdTemplates'

const PROJECT_COLORS = [
  { dot: 'bg-blue-500',    header: 'hover:bg-blue-50 dark:hover:bg-blue-900/20',    text: 'text-blue-700 dark:text-blue-300' },
  { dot: 'bg-emerald-500', header: 'hover:bg-emerald-50 dark:hover:bg-emerald-900/20', text: 'text-emerald-700 dark:text-emerald-300' },
  { dot: 'bg-violet-500',  header: 'hover:bg-violet-50 dark:hover:bg-violet-900/20',  text: 'text-violet-700 dark:text-violet-300' },
  { dot: 'bg-amber-500',   header: 'hover:bg-amber-50 dark:hover:bg-amber-900/20',   text: 'text-amber-700 dark:text-amber-300' },
  { dot: 'bg-rose-500',    header: 'hover:bg-rose-50 dark:hover:bg-rose-900/20',    text: 'text-rose-700 dark:text-rose-300' },
  { dot: 'bg-cyan-500',    header: 'hover:bg-cyan-50 dark:hover:bg-cyan-900/20',    text: 'text-cyan-700 dark:text-cyan-300' },
]

interface Props {
  project: Project
  projectIndex: number
  searchQuery: string
  onOpenFile: (filePath: string, fileName: string) => void
  onOpenFilePinned: (filePath: string, fileName: string) => void
}

export interface GitStatusMap {
  [relativePath: string]: { index: string; worktree: string }
}

export default function ProjectTree({ project, projectIndex, searchQuery, onOpenFile, onOpenFilePinned }: Props) {
  const toggleProjectCollapsed = useAppStore(s => s.toggleProjectCollapsed)
  const removeProject = useAppStore(s => s.removeProject)
  const renameProject = useAppStore(s => s.renameProject)
  const openDirsList = useAppStore(s => s.openDirs[project.id])
  const toggleOpenDirAction = useAppStore(s => s.toggleOpenDir)
  const openDirs = useMemo(() => new Set(openDirsList || []), [openDirsList])
  const [nodes, setNodes] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [gitStatusMap, setGitStatusMap] = useState<GitStatusMap>({})
  const [gitChangedCount, setGitChangedCount] = useState(0)
  const [hasRemote, setHasRemote] = useState(false)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [isPulling, setIsPulling] = useState(false)

  // Multi-selection
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [lastClickedPath, setLastClickedPath] = useState<string | null>(null)

  // Collect flat list of all node paths for Shift+Click range selection
  const collectFlatPaths = useCallback((nodeList: FileNode[]): string[] => {
    const result: string[] = []
    for (const n of nodeList) {
      result.push(n.path)
      if (n.children) result.push(...collectFlatPaths(n.children))
    }
    return result
  }, [])

  const flatPaths = useMemo(() => collectFlatPaths(nodes), [nodes, collectFlatPaths])

  const handleSelect = useCallback((path: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths(prev => {
        const next = new Set(prev)
        if (next.has(path)) next.delete(path)
        else next.add(path)
        return next
      })
      setLastClickedPath(path)
    } else if (e.shiftKey && lastClickedPath) {
      const fromIdx = flatPaths.indexOf(lastClickedPath)
      const toIdx = flatPaths.indexOf(path)
      if (fromIdx !== -1 && toIdx !== -1) {
        const start = Math.min(fromIdx, toIdx)
        const end = Math.max(fromIdx, toIdx)
        setSelectedPaths(new Set(flatPaths.slice(start, end + 1)))
      }
    } else {
      setSelectedPaths(new Set([path]))
      setLastClickedPath(path)
    }
  }, [lastClickedPath, flatPaths])

  const selection = useMemo(() => ({
    selectedPaths,
    lastClickedPath,
    onSelect: handleSelect,
  }), [selectedPaths, lastClickedPath, handleSelect])

  const toggleDir = (path: string, isOpen: boolean) => {
    toggleOpenDirAction(project.id, path, isOpen)
  }
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return
    const el = contextMenuRef.current
    const rect = el.getBoundingClientRect()
    const margin = 4
    let nextLeft = contextMenu.x
    let nextTop = contextMenu.y
    if (nextLeft + rect.width + margin > window.innerWidth) {
      nextLeft = Math.max(margin, window.innerWidth - rect.width - margin)
    }
    if (nextTop + rect.height + margin > window.innerHeight) {
      nextTop = Math.max(margin, window.innerHeight - rect.height - margin)
    }
    if (nextLeft !== contextMenu.x || nextTop !== contextMenu.y) {
      el.style.left = `${nextLeft}px`
      el.style.top = `${nextTop}px`
    }
  }, [contextMenu])
  const [installedIDEs, setInstalledIDEs] = useState<{ id: string; name: string; cmd: string }[]>([])
  useEffect(() => {
    window.electronAPI.detectIDEs().then(setInstalledIDEs)
  }, [])
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(project.name)
  const [isCreatingFile, setIsCreatingFile] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showRemoteInput, setShowRemoteInput] = useState(false)
  const [remoteInputValue, setRemoteInputValue] = useState('')
  const [gitActionMsg, setGitActionMsg] = useState<string | null>(null)
  const [headerDragOver, setHeaderDragOver] = useState(false)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const newFileInputRef = useRef<HTMLInputElement>(null)
  const newFolderInputRef = useRef<HTMLInputElement>(null)

  const projectColors = useAppStore(s => s.projectColors)
  const setProjectColor = useAppStore(s => s.setProjectColor)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorIndex = projectColors[project.id] ?? projectIndex
  const color = PROJECT_COLORS[colorIndex % PROJECT_COLORS.length]

  const loadNodes = () => {
    setLoading(true)
    window.electronAPI.readDir(project.path).then(data => {
      setNodes(data)
      setLoading(false)
    })
  }

  // Load nodes when expanded; watch directory for auto-refresh
  useEffect(() => {
    if (project.collapsed) {
      window.electronAPI.unwatchDir(project.path)
      return
    }
    loadNodes()
    window.electronAPI.watchDir(project.path)
    return () => {
      window.electronAPI.unwatchDir(project.path)
    }
  }, [project.path, project.collapsed])

  // Reload tree when directory changes on disk
  useEffect(() => {
    const unsub = window.electronAPI.onDirChanged((changedPath) => {
      if (!project.collapsed && changedPath === project.path) {
        loadNodes()
        loadGitStatus()
      }
    })
    return unsub
  }, [project.path, project.collapsed])

  // Load git status when expanded
  const loadGitStatus = async () => {
    try {
      const isRepo = await window.electronAPI.gitIsRepo(project.path)
      if (!isRepo) { setGitBranch(null); setGitStatusMap({}); setGitChangedCount(0); return }
      const [branchRes, statusRes, remoteRes] = await Promise.all([
        window.electronAPI.gitBranch(project.path),
        window.electronAPI.gitStatus(project.path),
        window.electronAPI.gitRemoteGet(project.path),
      ])
      setGitBranch(branchRes.success ? branchRes.output || '' : null)
      const remoteUrlVal = remoteRes.success ? (remoteRes.output?.trim() || '') : ''
      setHasRemote(!!remoteUrlVal)
      setRemoteUrl(remoteUrlVal)
      if (statusRes.success && statusRes.output) {
        const map: GitStatusMap = {}
        let count = 0
        for (const line of statusRes.output.split('\n')) {
          if (!line) continue
          const index = line[0]
          const worktree = line[1]
          let file = line.slice(3).replace(/\\/g, '/')
          // Remove surrounding quotes (git quotes paths with special chars)
          if (file.startsWith('"') && file.endsWith('"')) {
            file = file.slice(1, -1)
          }
          map[file] = { index, worktree }
          count++
        }
        setGitStatusMap(map)
        setGitChangedCount(count)
      } else {
        setGitStatusMap({})
        setGitChangedCount(0)
      }
    } catch {
      setGitBranch(null)
      setGitStatusMap({})
      setGitChangedCount(0)
      setHasRemote(false)
    }
  }

  useEffect(() => {
    loadGitStatus()
  }, [project.path])

  // Listen for git-status-changed events from GitPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const changedPath = (e as CustomEvent).detail
      if (changedPath === project.path) loadGitStatus()
    }
    window.addEventListener('git-status-changed', handler)
    return () => window.removeEventListener('git-status-changed', handler)
  }, [project.path])

  // Refresh git status whenever a file inside this project is saved.
  // Without this the M/A indicators only updated on a manual refresh.
  useEffect(() => {
    const handler = (e: Event) => {
      const savedPath = (e as CustomEvent).detail as string
      if (!savedPath) return
      const np = savedPath.replace(/\\/g, '/').toLowerCase()
      const pp = project.path.replace(/\\/g, '/').toLowerCase()
      if (np === pp || np.startsWith(pp + '/')) loadGitStatus()
    }
    window.addEventListener('file-saved', handler)
    return () => window.removeEventListener('file-saved', handler)
  }, [project.path])

  // Focus input when rename mode starts
  useEffect(() => {
    if (isRenaming) {
      setRenameValue(project.name)
      setTimeout(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      }, 0)
    }
  }, [isRenaming])

  const commitRename = () => {
    renameProject(project.id, renameValue)
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setRenameValue(project.name)
    setIsRenaming(false)
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename()
    else if (e.key === 'Escape') cancelRename()
  }

  const startRename = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setContextMenu(null)
    setIsRenaming(true)
  }

  const [selectedTemplate, setSelectedTemplate] = useState<MdTemplate | null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [allTemplates, setAllTemplates] = useState<MdTemplate[]>([])
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [saveTemplateName, setSaveTemplateName] = useState('')
  const [templateManageMode, setTemplateManageMode] = useState(false)

  const startCreateFile = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setContextMenu(null)
    setNewFileName('')
    setSelectedTemplate(null)
    const templates = await loadCustomTemplates(project.path)
    setAllTemplates(templates)
    setShowTemplatePicker(true)
    if (project.collapsed) toggleProjectCollapsed(project.id)
  }

  // Auto-focus new file input when it appears
  useEffect(() => {
    if (isCreatingFile) {
      const tryFocus = () => {
        if (newFileInputRef.current) {
          newFileInputRef.current.focus()
        } else {
          requestAnimationFrame(tryFocus)
        }
      }
      requestAnimationFrame(tryFocus)
    }
  }, [isCreatingFile])

  const commitCreateFile = async () => {
    const name = newFileName.trim()
    if (!name) { setIsCreatingFile(false); return }
    const finalName = name.endsWith('.md') ? name : name + '.md'
    const sep = project.path.includes('/') ? '/' : '\\'
    const targetDir = useAppStore.getState().lastOpenedDir[project.id] || project.path
    const filePath = targetDir + sep + finalName
    const title = name.replace(/\.md$/, '')
    const content = selectedTemplate ? selectedTemplate.generate(title) : `# ${title}\n\n`
    const result = await window.electronAPI.createFile(filePath, content)
    if (result.success) {
      // Ensure parent folders are expanded so the new file is visible
      const { toggleOpenDir: tod } = useAppStore.getState()
      let dir = targetDir
      const root = project.path.replace(/\\/g, '/')
      while (dir.replace(/\\/g, '/') !== root && dir.length > root.length) {
        tod(project.id, dir, true)
        const lastSep = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'))
        if (lastSep <= 0) break
        dir = dir.slice(0, lastSep)
      }
      loadNodes()
      onOpenFilePinned(filePath, finalName)
    } else {
      alert(result.error || '파일 생성 실패')
    }
    setIsCreatingFile(false)
    setShowTemplatePicker(false)
  }

  const cancelCreateFile = () => {
    setIsCreatingFile(false)
    setShowTemplatePicker(false)
    setTemplateManageMode(false)
    setNewFileName('')
  }

  const handleNewFileKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitCreateFile()
    else if (e.key === 'Escape') cancelCreateFile()
  }

  // Listen for create-file event from toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === project.id) {
        setNewFileName('')
        setSelectedTemplate(null)
        loadCustomTemplates(project.path).then(templates => setAllTemplates(templates))
        setShowTemplatePicker(true)
        if (project.collapsed) toggleProjectCollapsed(project.id)
      }
    }
    window.addEventListener('create-file-in-project', handler)
    return () => window.removeEventListener('create-file-in-project', handler)
  }, [project.id, project.collapsed, toggleProjectCollapsed])

  // ── Create folder ─────────────────────────────────────────────────────
  const startCreateFolder = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setContextMenu(null)
    setNewFolderName('')
    setIsCreatingFolder(true)
    if (project.collapsed) toggleProjectCollapsed(project.id)
  }

  useEffect(() => {
    if (isCreatingFolder) {
      const tryFocus = () => {
        if (newFolderInputRef.current) {
          newFolderInputRef.current.focus()
        } else {
          requestAnimationFrame(tryFocus)
        }
      }
      requestAnimationFrame(tryFocus)
    }
  }, [isCreatingFolder])

  const commitCreateFolder = async () => {
    const name = newFolderName.trim()
    if (!name) { setIsCreatingFolder(false); return }
    const sep = project.path.includes('/') ? '/' : '\\'
    const dirPath = project.path + sep + name
    const result = await window.electronAPI.createDir(dirPath)
    if (result.success) {
      loadNodes()
    } else {
      alert(result.error || '폴더 생성 실패')
    }
    setIsCreatingFolder(false)
  }

  const cancelCreateFolder = () => {
    setIsCreatingFolder(false)
    setNewFolderName('')
  }

  const handleNewFolderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitCreateFolder()
    else if (e.key === 'Escape') cancelCreateFolder()
  }

  // Listen for create-folder event from toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail === project.id) {
        setNewFolderName('')
        setIsCreatingFolder(true)
        if (project.collapsed) toggleProjectCollapsed(project.id)
      }
    }
    window.addEventListener('create-folder-in-project', handler)
    return () => window.removeEventListener('create-folder-in-project', handler)
  }, [project.id, project.collapsed, toggleProjectCollapsed])

  return (
    <div
      className={`border-b border-gray-200 dark:border-gray-700 last:border-0 pb-1 ${headerDragOver ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-filepath') || e.dataTransfer.types.includes('application/x-filepaths') || e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = e.dataTransfer.types.includes('Files') ? 'copy' : 'move'
          setHeaderDragOver(true)
        }
      }}
      onDragLeave={() => setHeaderDragOver(false)}
      onDrop={async (e) => {
        e.preventDefault()
        setHeaderDragOver(false)

        // External files from OS explorer
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const hasInternal = e.dataTransfer.getData('application/x-filepath') || e.dataTransfer.getData('application/x-filepaths')
          if (!hasInternal) {
            let copied = 0
            for (const file of Array.from(e.dataTransfer.files)) {
              const srcPath = window.electronAPI.getPathForFile(file)
              if (!srcPath) continue
              const result = await window.electronAPI.copyFileToDir(srcPath, project.path)
              if (result.success) copied++
              else alert(result.error || '복사 실패: ' + file.name)
            }
            return
          }
        }

        // Internal drag
        const multiData = e.dataTransfer.getData('application/x-filepaths')
        const srcPaths: string[] = multiData ? JSON.parse(multiData) : []
        if (srcPaths.length === 0) {
          const single = e.dataTransfer.getData('application/x-filepath')
          if (single) srcPaths.push(single)
        }
        for (const srcPath of srcPaths) {
          if (srcPath === project.path) continue
          const result = await window.electronAPI.move(srcPath, project.path)
          if (!result.success) alert(result.error || '이동 실패')
        }
      }}
    >
      {/* Project header */}
      <div
        draggable
        className={`group flex flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1.5 cursor-pointer transition-colors ${headerDragOver ? 'bg-blue-50 dark:bg-blue-900/30 outline outline-1 outline-blue-400 [&>*]:pointer-events-none' : isRenaming ? '' : color.header}`}
        onClick={() => { if (!isRenaming) toggleProjectCollapsed(project.id) }}
        onContextMenu={(e) => { e.preventDefault(); if (!isRenaming) setContextMenu({ x: e.clientX, y: e.clientY }) }}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          e.dataTransfer.setData('text/plain', String(projectIndex))
        }}
        title={project.path}
      >
        {/* Collapse arrow */}
        <svg
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${project.collapsed ? '' : 'rotate-90'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>

        {/* Color dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${color.dot}`} />

        {/* Project name / rename input */}
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
            className="flex-1 text-xs font-semibold px-1 py-0.5 rounded border border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
          />
        ) : (
          <>
            <span
              className={`flex-1 text-xs font-semibold truncate ${color.text}`}
              onDoubleClick={startRename}
            >
              {project.name}
            </span>
            {gitBranch !== null && (
              <span
                className="flex items-center gap-1 flex-shrink-0 cursor-pointer hover:opacity-80"
                onClick={(e) => {
                  e.stopPropagation()
                  useAppStore.getState().setGitSelectedProject(project.path)
                  useAppStore.getState().setSidebarTab('git')
                }}
                title="Git 탭으로 이동"
              >
                <span className="px-1.5 py-0 rounded text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 font-mono">
                  {gitBranch || 'HEAD'}
                </span>
                {gitChangedCount > 0 && (
                  <span className="px-1 py-0 rounded text-[9px] bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-300 font-mono">
                    {gitChangedCount}
                  </span>
                )}
              </span>
            )}
          </>
        )}

        {/* Second row: git info + action buttons (right-aligned) */}
        {!isRenaming && (
          <div className="w-full flex items-center justify-end gap-1 pl-6">
            <div className="flex items-center gap-0.5">
              <button onClick={startCreateFile} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="새 마크다운 파일">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              </button>
              <button onClick={startCreateFolder} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="새 폴더">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg>
              </button>
              <button onClick={startRename} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="이름 변경">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
              </button>
              {gitBranch !== null && hasRemote && (
                <button
                  onClick={async (e) => {
                    e.stopPropagation()
                    setIsPulling(true)
                    const res = await window.electronAPI.gitPull(project.path)
                    setIsPulling(false)
                    if (res.success) {
                      loadNodes()
                      loadGitStatus()
                      setGitActionMsg('Pull 완료')
                    } else {
                      setGitActionMsg(res.error || 'Pull 실패')
                    }
                    setTimeout(() => setGitActionMsg(null), 3000)
                  }}
                  disabled={isPulling}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-blue-100 dark:hover:bg-blue-900/40 hover:text-blue-500 disabled:opacity-50"
                  title="Pull (원격에서 받기)"
                >
                  {isPulling ? (
                    <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  )}
                </button>
              )}
              {gitBranch !== null && hasRemote && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    useAppStore.getState().setGitSelectedProject(project.path)
                    useAppStore.getState().setSidebarTab('git')
                  }}
                  className="w-5 h-5 flex items-center justify-center rounded hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-500"
                  title="Push — Git 탭으로 이동"
                >
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); loadNodes(); loadGitStatus() }} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="새로고침">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>
              <button onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${project.name}" 프로젝트를 목록에서 제거하시겠습니까?`)) removeProject(project.id) }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500" title="프로젝트 제거">
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>
        )}

        {/* Rename confirm/cancel buttons */}
        {isRenaming && (
          <div className="flex items-center gap-0.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <button
              onMouseDown={(e) => { e.preventDefault(); commitRename() }}
              className="w-5 h-5 flex items-center justify-center rounded bg-blue-500 hover:bg-blue-600 text-white"
              title="확인 (Enter)"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); cancelRename() }}
              className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600"
              title="취소 (Esc)"
            >
              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {loading && (
          <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Template picker */}
      {showTemplatePicker && (
        <div className="border-b border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/10">
          <div className="px-3 py-1.5 flex items-center justify-between">
            {templateManageMode ? (
              <>
                <div className="flex items-center gap-1">
                  <button onClick={() => setTemplateManageMode(false)} className="text-gray-400 hover:text-gray-600" title="뒤로">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">템플릿 편집</span>
                </div>
                <button onClick={() => { setShowTemplatePicker(false); setTemplateManageMode(false) }} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">템플릿 선택</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setTemplateManageMode(true); setSavingTemplate(false) }}
                    className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
                    title="템플릿 편집"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    관리
                  </button>
                  <button
                    onClick={() => setSavingTemplate(!savingTemplate)}
                    className="text-xs text-gray-400 hover:text-blue-500 flex items-center gap-0.5"
                    title="현재 문서를 템플릿으로 저장"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    저장
                  </button>
                  <button onClick={() => { setShowTemplatePicker(false); setSavingTemplate(false) }} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* ── 관리 모드: 템플릿 파일 목록 ── */}
          {templateManageMode && (
            <div className="px-2 pb-2 space-y-0.5 max-h-60 overflow-y-auto">
              {allTemplates.filter(t => t.filePath).length === 0 && (
                <p className="text-xs text-gray-400 px-2 py-2">편집 가능한 템플릿이 없습니다.</p>
              )}
              {getCategories(allTemplates).map(cat => {
                const editableTemplates = allTemplates.filter(t => t.category === cat && t.filePath)
                if (editableTemplates.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="text-xs text-gray-400 px-1 py-0.5">{cat}</div>
                    {editableTemplates.map(t => (
                      <div key={t.id} className="flex items-center group/tpl rounded hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                        <button
                          onClick={() => {
                            const fileName = t.filePath!.replace(/\\/g, '/').split('/').pop() || ''
                            onOpenFilePinned(t.filePath!, fileName)
                            setShowTemplatePicker(false)
                            setTemplateManageMode(false)
                          }}
                          className="flex-1 flex items-center gap-2 px-2 py-1.5 text-xs text-left text-gray-700 dark:text-gray-300"
                        >
                          <span>{t.icon}</span>
                          <span className="flex-1 truncate">{t.name}</span>
                          <svg className="w-3 h-3 text-gray-300 group-hover/tpl:text-blue-400 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            if (!window.confirm(`"${t.name}" 템플릿을 삭제하시겠습니까?`)) return
                            await window.electronAPI.deleteFile(t.filePath!)
                            const updated = await loadCustomTemplates(project.path)
                            setAllTemplates(updated)
                          }}
                          className="w-6 h-6 flex items-center justify-center opacity-0 group-hover/tpl:opacity-100 text-gray-300 hover:text-red-500 transition-all flex-shrink-0"
                          title="템플릿 삭제"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}

          {/* ── 선택 모드 ── */}
          {!templateManageMode && (
            <>
              {/* Save current doc as template */}
              {savingTemplate && (
                <div className="px-3 pb-2">
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={saveTemplateName}
                      onChange={e => setSaveTemplateName(e.target.value)}
                      onKeyDown={async e => {
                        if (e.key === 'Enter' && saveTemplateName.trim()) {
                          const activeTab = useAppStore.getState().tabs.find(t => t.id === useAppStore.getState().activeTabId)
                          const content = activeTab?.content || `# {{title}}\n\n`
                          const templateContent = content.replace(/^# .+$/m, '# {{title}}')
                          await saveAsTemplate(project.path, saveTemplateName.trim(), templateContent)
                          const custom = await loadCustomTemplates(project.path)
                          setAllTemplates(custom)
                          setSaveTemplateName('')
                          setSavingTemplate(false)
                        }
                        if (e.key === 'Escape') { setSavingTemplate(false); setSaveTemplateName('') }
                      }}
                      placeholder="템플릿 이름"
                      className="flex-1 text-xs px-2 py-1 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-1">현재 열린 문서를 템플릿으로 저장합니다</p>
                </div>
              )}
              <div className="px-2 pb-2 space-y-1 max-h-60 overflow-y-auto">
                {getCategories(allTemplates).map(cat => (
                  <div key={cat}>
                    <div className="text-xs text-gray-400 px-1 py-0.5">{cat}</div>
                    {allTemplates.filter(t => t.category === cat).map(t => (
                      <div key={t.id} className="flex items-center group/tpl">
                        <button
                          onClick={() => {
                            setSelectedTemplate(t)
                            setShowTemplatePicker(false)
                            setSavingTemplate(false)
                            setIsCreatingFile(true)
                          }}
                          className={`flex-1 flex items-center gap-2 px-2 py-1 rounded-l text-xs text-left transition-colors ${
                            selectedTemplate?.id === t.id
                              ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
                          }`}
                        >
                          <span>{t.icon}</span>
                          <span className="flex-1 truncate">{t.name}</span>
                        </button>
                        {t.filePath && (
                          <button
                            onClick={() => {
                              const fileName = t.filePath!.replace(/\\/g, '/').split('/').pop() || ''
                              onOpenFilePinned(t.filePath!, fileName)
                              setShowTemplatePicker(false)
                              setSavingTemplate(false)
                            }}
                            className="w-5 h-5 flex items-center justify-center rounded-r opacity-0 group-hover/tpl:opacity-100 text-gray-400 hover:text-blue-500 transition-all"
                            title="템플릿 편집"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* New file input */}
      {isCreatingFile && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <span className="text-xs flex-shrink-0" title={selectedTemplate?.name || '빈 문서'}>{selectedTemplate?.icon || '📄'}</span>
          <input
            ref={newFileInputRef}
            value={newFileName}
            onChange={e => setNewFileName(e.target.value)}
            onKeyDown={handleNewFileKeyDown}
            onBlur={commitCreateFile}
            placeholder="파일명.md"
            className="flex-1 text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
            onClick={e => e.stopPropagation()}
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); setShowTemplatePicker(true); setIsCreatingFile(false) }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0 text-gray-400 hover:text-blue-500"
            title="템플릿 변경"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); commitCreateFile() }}
            className="w-5 h-5 flex items-center justify-center rounded bg-blue-500 hover:bg-blue-600 text-white flex-shrink-0"
            title="생성 (Enter)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancelCreateFile() }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
            title="취소 (Esc)"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* New folder input */}
      {isCreatingFolder && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
          <svg className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <input
            ref={newFolderInputRef}
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={handleNewFolderKeyDown}
            onBlur={commitCreateFolder}
            placeholder="폴더명"
            className="flex-1 text-xs px-1.5 py-0.5 rounded border border-yellow-300 dark:border-yellow-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-yellow-400 min-w-0"
            onClick={e => e.stopPropagation()}
          />
          <button
            onMouseDown={(e) => { e.preventDefault(); commitCreateFolder() }}
            className="w-5 h-5 flex items-center justify-center rounded bg-yellow-500 hover:bg-yellow-600 text-white flex-shrink-0"
            title="생성 (Enter)"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); cancelCreateFolder() }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
            title="취소 (Esc)"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Git action message */}
      {gitActionMsg && (
        <div className="px-3 py-1 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-b border-green-200 dark:border-green-800">
          {gitActionMsg}
        </div>
      )}

      {/* Remote URL input */}
      {showRemoteInput && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <input
            value={remoteInputValue}
            onChange={e => setRemoteInputValue(e.target.value)}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' && remoteInputValue.trim()) {
                const res = await window.electronAPI.gitRemoteAdd(project.path, remoteInputValue.trim())
                if (res.success) {
                  setGitActionMsg('원격 저장소 설정 완료')
                  setTimeout(() => setGitActionMsg(null), 2000)
                } else {
                  setGitActionMsg(res.error || '원격 설정 실패')
                  setTimeout(() => setGitActionMsg(null), 3000)
                }
                setShowRemoteInput(false)
                setRemoteInputValue('')
              }
              if (e.key === 'Escape') { setShowRemoteInput(false); setRemoteInputValue('') }
            }}
            placeholder="https://github.com/user/repo.git"
            className="flex-1 text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
            autoFocus
          />
          <button
            onClick={() => { setShowRemoteInput(false); setRemoteInputValue('') }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0"
          >
            <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* File tree */}
      {!project.collapsed && (
        <div className="pl-1">
          {loading ? (
            <div className="px-6 py-2 text-xs text-gray-400">불러오는 중...</div>
          ) : (
            <FileTree nodes={nodes} onOpenFile={onOpenFile} onOpenFilePinned={onOpenFilePinned} searchQuery={searchQuery} depth={0} projectId={project.id} openDirs={openDirs} toggleDir={toggleDir} gitStatusMap={gitStatusMap} projectPath={project.path} selection={selection} />
          )}
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => { setContextMenu(null); setShowColorPicker(false) }} />
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-44"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={startCreateFile}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              새 마크다운 파일
            </button>
            <button
              onClick={startCreateFolder}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
              새 폴더
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
              onClick={startRename}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              이름 변경
            </button>
            <button
              onClick={() => setShowColorPicker(!showColorPicker)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <span className={`w-3.5 h-3.5 rounded-full ${color.dot}`} />
              프로젝트 색상
            </button>
            {showColorPicker && (
              <div className="flex gap-1.5 px-3 py-1.5">
                {PROJECT_COLORS.map((c, i) => (
                  <button
                    key={i}
                    onClick={() => { setProjectColor(project.id, i); setShowColorPicker(false); setContextMenu(null) }}
                    className={`w-5 h-5 rounded-full ${c.dot} transition-all ${
                      (colorIndex % PROJECT_COLORS.length) === i ? 'ring-2 ring-offset-1 ring-blue-400' : 'hover:ring-1 hover:ring-gray-400'
                    }`}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => { window.electronAPI.showItemInFolder(project.path); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              탐색기에서 열기
            </button>
            <button
              onClick={() => { window.electronAPI.openTerminal(project.path); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              터미널에서 열기
            </button>
            {installedIDEs.map(ide => (
              <button
                key={ide.id}
                onClick={() => { window.electronAPI.openInIDE(ide.cmd, project.path); setContextMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                {ide.name}로 열기
              </button>
            ))}
            <button
              onClick={() => { loadNodes(); loadGitStatus(); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              새로고침
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            {gitBranch === null ? (
              <button
                onClick={async () => {
                  setContextMenu(null)
                  const res = await window.electronAPI.gitInit(project.path)
                  if (res.success) {
                    setGitActionMsg('Git 저장소 초기화 완료')
                    setTimeout(() => setGitActionMsg(null), 2000)
                    loadGitStatus()
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Git 저장소 초기화
              </button>
            ) : (
              <button
                onClick={() => { setContextMenu(null); setRemoteInputValue(remoteUrl); setShowRemoteInput(true) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                원격 저장소 설정
              </button>
            )}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
              onClick={() => { if (window.confirm(`"${project.name}" 프로젝트를 목록에서 제거하시겠습니까?`)) { removeProject(project.id) } setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              프로젝트 제거
            </button>
          </div>
        </>
      )}
    </div>
  )
}
