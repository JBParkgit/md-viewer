import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

interface MdFile {
  path: string
  name: string
  rel: string        // relative path from project root
  projectName: string
  projectPath: string
  mtime: number
}

type SortBy = 'name' | 'path' | 'recent'

const SORT_LABELS: Record<SortBy, string> = {
  recent: '최신순',
  name: '이름순',
  path: '경로순',
}
const SORT_ORDER: SortBy[] = ['recent', 'name', 'path']

function formatRelativeTime(mtime: number): string {
  if (!mtime) return ''
  const diffMs = Date.now() - mtime
  if (diffMs < 0) return '방금'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return '방금'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}일 전`
  if (day < 30) return `${Math.floor(day / 7)}주 전`
  if (day < 365) return `${Math.floor(day / 30)}개월 전`
  return `${Math.floor(day / 365)}년 전`
}

const DEFAULT_IGNORE = ['node_modules', '.claude', '.git', '.docuflow', '.vscode', '.idea', 'dist', 'dist-electron', 'release', 'out', '.omc']

export default function DocsPanel({ onOpenFile }: Props) {
  const projects = useAppStore(s => s.projects)
  const [files, setFiles] = useState<MdFile[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [sortBy, setSortByState] = useState<SortBy>('recent')
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const [showAll, setShowAllState] = useState(false)
  const [selectedProject, setSelectedProject] = useState<string | null>(null)
  const [ignoreDirs, setIgnoreDirs] = useState<string[]>(DEFAULT_IGNORE)
  const [showIgnoreSettings, setShowIgnoreSettings] = useState(false)
  const [visibleCount, setVisibleCount] = useState(50)
  const listRef = useRef<HTMLDivElement>(null)

  // Load saved settings
  useEffect(() => {
    (async () => {
      const [savedIgnore, savedSort, savedShowAll] = await Promise.all([
        window.electronAPI.storeGet('docsIgnoreDirs') as Promise<string[] | null>,
        window.electronAPI.storeGet('docsSortBy') as Promise<string | null>,
        window.electronAPI.storeGet('docsShowAll') as Promise<boolean | null>,
      ])
      if (savedIgnore) setIgnoreDirs(savedIgnore)
      if (savedSort === 'name' || savedSort === 'path' || savedSort === 'recent') setSortByState(savedSort)
      if (savedShowAll !== null) setShowAllState(savedShowAll)
    })()
  }, [])

  const setSortBy = (v: SortBy) => {
    setSortByState(v)
    window.electronAPI.storeSet('docsSortBy', v)
    setSortMenuOpen(false)
  }

  // Close the sort dropdown on outside click.
  useEffect(() => {
    if (!sortMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [sortMenuOpen])

  const setShowAll = (v: boolean) => {
    setShowAllState(v)
    window.electronAPI.storeSet('docsShowAll', v)
  }

  const saveIgnoreDirs = (dirs: string[]) => {
    setIgnoreDirs(dirs)
    window.electronAPI.storeSet('docsIgnoreDirs', dirs)
  }

  const [topDirs, setTopDirs] = useState<string[]>([]) // 프로젝트 내 최상위 폴더들

  const toggleIgnoreDir = (dir: string) => {
    if (ignoreDirs.includes(dir)) {
      saveIgnoreDirs(ignoreDirs.filter(d => d !== dir))
    } else {
      saveIgnoreDirs([...ignoreDirs, dir])
    }
  }

  const resetIgnoreDirs = () => {
    saveIgnoreDirs(DEFAULT_IGNORE)
  }

  // 설정 패널 열릴 때 프로젝트 최상위 폴더 로드
  useEffect(() => {
    if (!showIgnoreSettings) return
    const loadDirs = async () => {
      const targetProjects = selectedProject
        ? projects.filter(p => p.path === selectedProject)
        : projects
      const allDirs = new Set<string>()
      await Promise.all(
        targetProjects.map(async (proj) => {
          const tree = await window.electronAPI.readDir(proj.path)
          tree.forEach(node => {
            if (node.type === 'directory') allDirs.add(node.name)
          })
        })
      )
      setTopDirs([...allDirs].sort((a, b) => a.localeCompare(b, 'ko')))
    }
    loadDirs()
  }, [showIgnoreSettings, projects, selectedProject])

  const loadFiles = useCallback(async () => {
    setLoading(true)
    const targetProjects = selectedProject
      ? projects.filter(p => p.path === selectedProject)
      : projects

    const allFiles: MdFile[] = []
    await Promise.all(
      targetProjects.map(async (proj) => {
        const entries = await window.electronAPI.listMdFilesWithMtime(proj.path)
        for (const { path: fullPath, mtime } of entries) {
          const name = fullPath.split(/[/\\]/).pop() || fullPath
          const rel = fullPath.replace(/\\/g, '/').replace(proj.path.replace(/\\/g, '/') + '/', '')
          allFiles.push({
            path: fullPath,
            name,
            rel,
            projectName: proj.name,
            projectPath: proj.path,
            mtime,
          })
        }
      })
    )

    if (sortBy === 'name') {
      allFiles.sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    } else if (sortBy === 'recent') {
      allFiles.sort((a, b) => b.mtime - a.mtime)
    } else {
      allFiles.sort((a, b) => a.rel.localeCompare(b.rel, 'ko'))
    }

    setFiles(allFiles)
    setLoading(false)
  }, [projects, selectedProject, sortBy])

  useEffect(() => {
    if (projects.length > 0) loadFiles()
  }, [projects, loadFiles])

  // Refresh on directory changes
  useEffect(() => {
    const targetPaths = selectedProject
      ? [selectedProject]
      : projects.map(p => p.path)

    const unsubs = targetPaths.map(path => {
      return window.electronAPI.onDirChanged((changedPath) => {
        if (changedPath === path) loadFiles()
      })
    })
    return () => unsubs.forEach(u => u())
  }, [projects, selectedProject, loadFiles])

  // Reset visible count when filters change
  useEffect(() => { setVisibleCount(50) }, [search, sortBy, showAll, selectedProject, ignoreDirs])

  const handleScroll = useCallback(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
      setVisibleCount(prev => prev + 50)
    }
  }, [])

  const filtered = (() => {
    let result = files
    // showAll 꺼짐 → 무시 폴더 제외
    if (!showAll) {
      result = result.filter(f => !ignoreDirs.some(dir => f.rel.startsWith(dir + '/') || f.rel === dir))
    }
    if (search) {
      result = result.filter(f =>
        f.name.toLowerCase().includes(search.toLowerCase()) ||
        f.rel.toLowerCase().includes(search.toLowerCase())
      )
    }
    return result
  })()

  // Group by folder
  const grouped = new Map<string, MdFile[]>()
  filtered.forEach(f => {
    const folder = f.rel.includes('/') ? f.rel.substring(0, f.rel.lastIndexOf('/')) : ''
    const key = projects.length > 1 ? `${f.projectName}${folder ? '/' + folder : ''}` : folder || '/'
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(f)
  })

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>프로젝트를 먼저 추가하세요</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header controls */}
      <div className="px-2 pt-2 pb-1 space-y-1 flex-shrink-0">
        {/* Project filter */}
        {projects.length > 1 && (
          <select
            value={selectedProject || ''}
            onChange={e => setSelectedProject(e.target.value || null)}
            className="w-full text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-blue-400"
          >
            <option value="">모든 프로젝트</option>
            {projects.map(p => <option key={p.id} value={p.path}>{p.name}</option>)}
          </select>
        )}

        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="문서 검색..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
          />
          <svg className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Sort + count */}
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-gray-400">
            {filtered.length}개 문서
            {!showAll && filtered.length < files.length && (
              <span className="text-gray-300"> (숨김 {files.length - filtered.length})</span>
            )}
          </span>
          <div className="flex gap-1 items-center">
            <button
              onClick={() => setShowAll(!showAll)}
              title={showAll ? '제외 폴더 숨기기' : '모든 파일 보기'}
              className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                showAll ? 'bg-orange-100 dark:bg-orange-900/40 text-orange-600' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {showAll ? '전체' : '필터'}
            </button>
            <button
              onClick={() => setShowIgnoreSettings(!showIgnoreSettings)}
              title="제외 폴더 설정"
              className={`w-4 h-4 flex items-center justify-center rounded transition-colors ${
                showIgnoreSettings ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <div ref={sortMenuRef} className="relative">
              <button
                onClick={() => setSortMenuOpen(o => !o)}
                className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                title="정렬 기준"
              >
                {SORT_LABELS[sortBy]}
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {sortMenuOpen && (
                <div className="absolute right-0 top-full mt-1 z-30 min-w-[90px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg py-1">
                  {SORT_ORDER.map(opt => (
                    <button
                      key={opt}
                      onClick={() => setSortBy(opt)}
                      className={`w-full text-left text-xs px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                        sortBy === opt ? 'text-blue-600 font-medium' : 'text-gray-700 dark:text-gray-200'
                      }`}
                    >
                      {SORT_LABELS[opt]}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Ignore settings panel */}
      {showIgnoreSettings && (
        <div className="px-2 pb-1 flex-shrink-0">
          <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400">제외 폴더 (체크 = 숨김)</span>
              <button onClick={resetIgnoreDirs} className="text-[9px] text-gray-400 hover:text-blue-500 transition-colors">
                초기화
              </button>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-px">
              {topDirs.map(dir => {
                const isIgnored = ignoreDirs.includes(dir)
                return (
                  <button
                    key={dir}
                    onClick={() => toggleIgnoreDir(dir)}
                    className={`w-full flex items-center gap-2 px-2 py-1 text-[10px] rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left ${
                      isIgnored ? 'text-gray-400' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      isIgnored ? 'bg-red-400 border-red-400' : 'border-gray-300 dark:border-gray-500'
                    }`}>
                      {isIgnored && (
                        <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </div>
                    <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                    </svg>
                    <span className={`truncate ${isIgnored ? 'line-through' : ''}`}>{dir}</span>
                  </button>
                )
              })}
              {topDirs.length === 0 && (
                <div className="text-[10px] text-gray-400 text-center py-2">폴더 없음</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* File list */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-1 py-1">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[11px]">{search ? '검색 결과 없음' : 'md 파일 없음'}</span>
          </div>
        ) : sortBy !== 'path' ? (
          /* 이름순 / 최신순: 폴더 그룹 없이 플랫 리스트 */
          filtered.slice(0, visibleCount).map(f => {
            const dir = f.rel.substring(0, f.rel.lastIndexOf('/')) || '/'
            const subtitle = sortBy === 'recent' ? `${formatRelativeTime(f.mtime)} · ${dir}` : dir
            return (
              <button
                key={f.path}
                onClick={() => onOpenFile(f.path, f.name)}
                className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
              >
                <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-gray-700 dark:text-gray-200">{f.name.replace(/\.md$/i, '')}</div>
                  <div className="truncate text-[9px] text-gray-400">{subtitle}</div>
                </div>
              </button>
            )
          })
        ) : (
          /* 경로순: 폴더별 그룹 (visibleCount 제한) */
          (() => {
            let count = 0
            const entries = Array.from(grouped.entries())
            const result: JSX.Element[] = []
            for (const [folder, folderFiles] of entries) {
              if (count >= visibleCount) break
              const visibleFiles = folderFiles.slice(0, visibleCount - count)
              count += visibleFiles.length
              result.push(
                <div key={folder} className="mb-1.5">
                  {folder && folder !== '/' && (
                    <div className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-gray-400 font-medium">
                      <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                      </svg>
                      <span className="truncate">{folder}</span>
                    </div>
                  )}
                  {visibleFiles.map(f => (
                    <button
                      key={f.path}
                      onClick={() => onOpenFile(f.path, f.name)}
                      className="w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left"
                    >
                      <svg className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate text-gray-700 dark:text-gray-200">{f.name.replace(/\.md$/i, '')}</span>
                    </button>
                  ))}
                </div>
              )
            }
            return result
          })()
        )}
      </div>
    </div>
  )
}
