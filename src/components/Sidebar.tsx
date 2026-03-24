import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import ProjectTree from './ProjectTree'
import ImageGallery from './ImageGallery'
import TagPanel from './TagPanel'
import GitPanel from './GitPanel'
import CalendarPanel from './CalendarPanel'
import type { SearchResult } from '../types/electron'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
  onOpenFilePinned: (filePath: string, fileName: string) => void
}

// ── Kanban project row with git remote + pull ────────────────────────────────
interface KanbanProjectRowProps {
  project: { id: string; name: string; path: string }
  isActive: boolean
  onClick: () => void
}

function KanbanProjectRow({ project, isActive, onClick }: KanbanProjectRowProps) {
  const setSidebarTab = useAppStore(s => s.setSidebarTab)
  const setGitSelectedProject = useAppStore(s => s.setGitSelectedProject)
  const [gitBranch, setGitBranch] = useState<string | null>(null)
  const [hasRemote, setHasRemote] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [pullMsg, setPullMsg] = useState<string | null>(null)

  const loadGit = useCallback(async () => {
    try {
      const isRepo = await window.electronAPI.gitIsRepo(project.path)
      if (!isRepo) { setGitBranch(null); setHasRemote(false); return }
      const [branchRes, remoteRes] = await Promise.all([
        window.electronAPI.gitBranch(project.path),
        window.electronAPI.gitRemoteGet(project.path),
      ])
      setGitBranch(branchRes.success ? branchRes.output || '' : null)
      setHasRemote(remoteRes.success && !!remoteRes.output?.trim())
    } catch {
      setGitBranch(null); setHasRemote(false)
    }
  }, [project.path])

  useEffect(() => { loadGit() }, [loadGit])

  const handlePull = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsPulling(true)
    const res = await window.electronAPI.gitPull(project.path)
    setIsPulling(false)
    setPullMsg(res.success ? '완료' : '실패')
    setTimeout(() => setPullMsg(null), 2500)
  }

  const goToGit = (e: React.MouseEvent) => {
    e.stopPropagation()
    setGitSelectedProject(project.path)
    setSidebarTab('git')
  }

  return (
    <div
      className={`w-full flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
        isActive
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
      }`}
      onClick={onClick}
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
      <span className="flex-1 truncate">{project.name}</span>
      {gitBranch !== null && (
        <span className="px-1 rounded text-[9px] bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 font-mono flex-shrink-0">
          {gitBranch || 'HEAD'}
        </span>
      )}
      {pullMsg && (
        <span className={`text-[9px] flex-shrink-0 ${pullMsg === '완료' ? 'text-green-500' : 'text-red-500'}`}>
          {pullMsg}
        </span>
      )}
      {gitBranch !== null && hasRemote && (
        <>
          <button
            onClick={handlePull}
            disabled={isPulling}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-gray-400 hover:text-blue-500 disabled:opacity-50 flex-shrink-0 transition-colors"
            title="Pull"
          >
            {isPulling ? (
              <div className="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
            )}
          </button>
          <button
            onClick={goToGit}
            className="w-4 h-4 flex items-center justify-center rounded hover:bg-green-200 dark:hover:bg-green-800 text-gray-400 hover:text-green-500 flex-shrink-0 transition-colors"
            title="Push — Git 탭으로 이동"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          </button>
        </>
      )}
    </div>
  )
}

// Tab definitions with icons
const TABS = [
  {
    id: 'tree' as const,
    title: '프로젝트',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
      </svg>
    ),
  },
  {
    id: 'favorites' as const,
    title: '즐겨찾기',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    id: 'recent' as const,
    title: '최근 파일',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    id: 'tags' as const,
    title: '태그',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    id: 'gallery' as const,
    title: '갤러리',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'kanban' as const,
    title: '칸반 보드',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
  {
    id: 'calendar' as const,
    title: '캘린더',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: 'git' as const,
    title: 'Git',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7a4 4 0 108 0 4 4 0 00-8 0zM6 21v-2a4 4 0 014-4h0" />
        <circle cx="18" cy="18" r="3" strokeWidth={1.7} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 11v4" />
      </svg>
    ),
  },
]

export default function Sidebar({ onOpenFile, onOpenFilePinned }: Props) {
  const {
    sidebarTab,
    setSidebarTab,
    searchQuery,
    setSearchQuery,
    fullTextQuery,
    setFullTextQuery,
    projects,
    addProject,
    favorites,
    removeFavorite,
    recentFiles,
    reorderProject,
  } = useAppStore()

  const [fullTextResults, setFullTextResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [width, setWidth] = useState(280)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [emptyContextMenu, setEmptyContextMenu] = useState<{ x: number; y: number } | null>(null)

  // Full-text search across all projects
  useEffect(() => {
    if (!fullTextQuery.trim() || projects.length === 0) {
      setFullTextResults([])
      return
    }
    const timeout = setTimeout(async () => {
      setIsSearching(true)
      const allResults: SearchResult[] = []
      for (const project of projects) {
        const results = await window.electronAPI.search(project.path, fullTextQuery)
        allResults.push(...results)
      }
      setFullTextResults(allResults.slice(0, 300))
      setIsSearching(false)
    }, 400)
    return () => clearTimeout(timeout)
  }, [fullTextQuery, projects])

  // Sidebar panel resize
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startWidth = width
    const onMove = (me: MouseEvent) => {
      setWidth(Math.min(500, Math.max(180, startWidth + me.clientX - startX)))
    }
    const onUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleAddProject = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) addProject(folder)
  }

  return (
    <div className="flex flex-row flex-shrink-0 select-none">
      {/* ── Activity Bar (vertical icon strip) ── */}
      <div className="flex flex-col items-center w-10 bg-gray-100 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 py-1 gap-0.5 flex-shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id)}
            className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors relative ${
              sidebarTab === tab.id
                ? 'text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-800'
            }`}
            title={tab.title}
          >
            {sidebarTab === tab.id && (
              <div className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-blue-500 rounded-r" />
            )}
            {tab.icon}
          </button>
        ))}
      </div>

      {/* ── Panel ── */}
      <div
        className="flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 relative"
        style={{ width }}
      >
        {/* Action toolbar (tree tab only) */}
        {sidebarTab === 'tree' && (
          <div className="flex items-center justify-end gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                const store = useAppStore.getState()
                const target = store.projects.find(p => !p.collapsed) || store.projects[0]
                if (target) {
                  window.dispatchEvent(new CustomEvent('create-file-in-project', { detail: target.id }))
                } else {
                  alert('먼저 프로젝트를 추가하세요.')
                }
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              title="새 파일"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 3v2m0-2h2m-2 0V1" />
              </svg>
            </button>
            <button
              onClick={() => {
                const store = useAppStore.getState()
                const target = store.projects.find(p => !p.collapsed) || store.projects[0]
                if (target) {
                  window.dispatchEvent(new CustomEvent('create-folder-in-project', { detail: target.id }))
                } else {
                  alert('먼저 프로젝트를 추가하세요.')
                }
              }}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              title="새 폴더"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11v4m2-2h-4" />
              </svg>
            </button>
            <button
              onClick={handleAddProject}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400"
              title="프로젝트 폴더 추가"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </button>
          </div>
        )}

        {/* Search bar (tree tab only) */}
        {sidebarTab === 'tree' && (
          <div className="p-2 space-y-1.5">
            <div className="relative">
              <input
                type="text"
                placeholder="파일명 검색..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
              />
              <svg className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="내용 전문 검색..."
                value={fullTextQuery}
                onChange={e => setFullTextQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
              />
              <svg className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h8M4 14h16M4 18h8" />
              </svg>
              {isSearching && (
                <div className="absolute right-2 top-2 w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              )}
              {!isSearching && fullTextQuery && (
                <button onClick={() => setFullTextQuery('')} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Content */}
        <div
          className="flex-1 overflow-y-auto"
          onContextMenu={(e) => {
            if (sidebarTab === 'tree') {
              const target = e.target as HTMLElement
              if (target.closest('[data-project-tree]') || target.closest('[data-search-result]')) return
              e.preventDefault()
              setEmptyContextMenu({ x: e.clientX, y: e.clientY })
            }
          }}
        >

          {/* ── 프로젝트 탭 ── */}
          {sidebarTab === 'tree' && (
            <>
              {/* Full-text search results */}
              {fullTextQuery && (
                <div className="pb-2">
                  <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
                    {isSearching ? '검색 중...' : `${fullTextResults.length}개 결과`}
                  </div>
                  {fullTextResults.map((r, i) => (
                    <div
                      key={i}
                      data-search-result
                      onClick={() => onOpenFile(r.filePath, r.fileName)}
                      className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
                    >
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400 truncate">
                        {r.fileName}
                        <span className="text-gray-400 font-normal ml-1">:{r.lineNumber}</span>
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                        {r.lineText}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Project trees (when not searching full-text) */}
              {!fullTextQuery && (
                <>
                  {projects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 px-4">
                      <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      </svg>
                      <p className="text-xs text-gray-400 text-center">
                        프로젝트 폴더를 추가하세요
                      </p>
                      <button
                        onClick={handleAddProject}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        폴더 추가
                      </button>
                    </div>
                  ) : (
                    <div>
                      {projects.map((project, index) => (
                        <div
                          key={project.id}
                          data-project-tree
                          onDragOver={(e) => {
                            // Only show project reorder indicator for project drags, not file drags
                            if (e.dataTransfer.types.includes('application/x-filepath') || e.dataTransfer.types.includes('application/x-filepaths')) return
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            setDragOverIndex(index)
                          }}
                          onDragLeave={() => setDragOverIndex(null)}
                          onDrop={(e) => {
                            // Only handle project reorder, not file drops
                            if (e.dataTransfer.types.includes('application/x-filepath') || e.dataTransfer.types.includes('application/x-filepaths')) return
                            e.preventDefault()
                            const fromIndex = Number(e.dataTransfer.getData('text/plain'))
                            if (!isNaN(fromIndex)) reorderProject(fromIndex, index)
                            setDragOverIndex(null)
                          }}
                          onDragEnd={() => setDragOverIndex(null)}
                          className={dragOverIndex === index ? 'border-t-2 border-blue-500' : ''}
                        >
                          <ProjectTree
                            project={project}
                            projectIndex={index}
                            searchQuery={searchQuery}
                            onOpenFile={onOpenFile}
                            onOpenFilePinned={onOpenFilePinned}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* ── 즐겨찾기 탭 ── */}
          {sidebarTab === 'favorites' && (
            <div className="p-1">
              {favorites.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                  <span>즐겨찾기가 없습니다</span>
                  <span className="text-gray-300 dark:text-gray-600">파일 우클릭 &rarr; 즐겨찾기 추가</span>
                </div>
              ) : (
                favorites.map((fav) => {
                  const name = fav.replace(/\\/g, '/').split('/').pop() || fav
                  return (
                    <div key={fav} className="group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30">
                      <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                      </svg>
                      <span className="flex-1 text-xs truncate" onClick={() => onOpenFile(fav, name)} title={fav}>{name}</span>
                      <button
                        onClick={() => removeFavorite(fav)}
                        className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:text-red-500"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── 최근 파일 탭 ── */}
          {sidebarTab === 'recent' && (
            <div className="p-1">
              {recentFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>최근 파일이 없습니다</span>
                </div>
              ) : (
                recentFiles.map((f) => (
                  <div
                    key={f.path}
                    onClick={() => onOpenFile(f.path, f.name)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    title={f.path}
                  >
                    <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs truncate">{f.name}</div>
                      <div className="text-xs text-gray-400 truncate">{f.path.replace(/\\/g, '/').split('/').slice(-3, -1).join('/')}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── 태그 탭 ── */}
          {sidebarTab === 'tags' && (
            <TagPanel onOpenFile={onOpenFile} />
          )}

          {/* ── 갤러리 탭 ── */}
          {sidebarTab === 'gallery' && (
            <ImageGallery onOpenFile={onOpenFile} onOpenFilePinned={onOpenFilePinned} />
          )}

          {/* ── 칸반 탭 (프로젝트 선택) ── */}
          {sidebarTab === 'kanban' && (
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 px-2 py-1 mb-1">프로젝트 선택</div>
              {projects.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                  </svg>
                  <span>프로젝트를 먼저 추가하세요</span>
                </div>
              ) : (
                projects.map(p => {
                  const kanbanProject = useAppStore.getState().kanbanProjectPath
                  return (
                    <KanbanProjectRow
                      key={p.id}
                      project={p}
                      isActive={kanbanProject === p.path}
                      onClick={() => useAppStore.getState().setKanbanProjectPath(p.path)}
                    />
                  )
                })
              )}
            </div>
          )}

          {/* ── 캘린더 탭 ── */}
          {sidebarTab === 'calendar' && (
            <CalendarPanel onOpenFile={onOpenFile} />
          )}

          {/* ── Git 탭 ── */}
          {sidebarTab === 'git' && (
            <GitPanel />
          )}
        </div>

        {/* Empty area context menu */}
        {emptyContextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setEmptyContextMenu(null)} />
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-44"
              style={{ left: emptyContextMenu.x, top: emptyContextMenu.y }}
            >
              <button
                onClick={() => { handleAddProject(); setEmptyContextMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                프로젝트 폴더 추가
              </button>
              {projects.length > 0 && (
                <>
                  <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                  <button
                    onClick={() => {
                      setEmptyContextMenu(null)
                      const store = useAppStore.getState()
                      const target = store.projects.find(p => !p.collapsed) || store.projects[0]
                      if (target) {
                        window.dispatchEvent(new CustomEvent('create-file-in-project', { detail: target.id }))
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                  >
                    <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    새 마크다운 파일
                  </button>
                  <button
                    onClick={() => {
                      setEmptyContextMenu(null)
                      const store = useAppStore.getState()
                      const target = store.projects.find(p => !p.collapsed) || store.projects[0]
                      if (target) {
                        window.dispatchEvent(new CustomEvent('create-folder-in-project', { detail: target.id }))
                      }
                    }}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                  >
                    <svg className="w-3.5 h-3.5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                    새 폴더
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* Resize handle */}
        <div
          onMouseDown={handleMouseDown}
          className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors ${isDragging ? 'bg-blue-400' : ''}`}
        />
      </div>
    </div>
  )
}
