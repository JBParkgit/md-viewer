import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../stores/useAppStore'
import ProjectTree from './ProjectTree'
import type { SearchResult } from '../types/electron'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
  onOpenFilePinned: (filePath: string, fileName: string) => void
}

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
  } = useAppStore()

  const [fullTextResults, setFullTextResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [width, setWidth] = useState(280)
  const [isDragging, setIsDragging] = useState(false)

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

  // Sidebar resize
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
    <div
      className="flex flex-col border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 relative select-none"
      style={{ width }}
    >
      {/* Sidebar tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        {(['tree', 'favorites', 'recent'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setSidebarTab(tab)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              sidebarTab === tab
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'tree' ? '프로젝트' : tab === 'favorites' ? '즐겨찾기' : '최근'}
          </button>
        ))}
      </div>

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
      <div className="flex-1 overflow-y-auto">

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
                    {projects.map(project => (
                      <ProjectTree
                        key={project.id}
                        project={project}
                        searchQuery={searchQuery}
                        onOpenFile={onOpenFile}
                        onOpenFilePinned={onOpenFilePinned}
                      />
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
                <span className="text-gray-300 dark:text-gray-600">파일 우클릭 → 즐겨찾기 추가</span>
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
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors ${isDragging ? 'bg-blue-400' : ''}`}
      />
    </div>
  )
}
