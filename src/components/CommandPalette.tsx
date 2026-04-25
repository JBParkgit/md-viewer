import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { exportMdToDocx, exportMdToPdf } from '../utils/exportImport'

interface Props {
  openFile: (filePath: string, fileName: string, preview?: boolean) => Promise<void> | void
}

type CommandItem = {
  id: string
  title: string
  subtitle?: string
  keywords: string
  kind: 'action' | 'file' | 'recent' | 'tab'
  run: () => void | Promise<void>
}

interface IndexedFile {
  path: string
  name: string
  projectName: string
}

function matchScore(query: string, ...parts: Array<string | undefined>): number {
  if (!query.trim()) return 1
  const haystack = parts.filter(Boolean).join(' ').toLowerCase()
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 1
  let score = 0
  for (const term of terms) {
    const idx = haystack.indexOf(term)
    if (idx === -1) return -1
    score += idx === 0 ? 100 : Math.max(10, 60 - idx)
  }
  return score
}

export default function CommandPalette({ openFile }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([])
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [anchorPos, setAnchorPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // VSCode-style anchored placement: compute panel position from the toolbar
  // search button's bounding rect each time the palette opens, and re-run on
  // window resize so dragging/maximizing keeps the panel under the button.
  useEffect(() => {
    if (!open) { setAnchorPos(null); return }
    const compute = () => {
      const anchor = document.querySelector<HTMLElement>('[data-command-palette-anchor]')
      if (!anchor) {
        // Fallback: keep VSCode-like vertical offset, horizontally centered.
        setAnchorPos({ top: Math.round(window.innerHeight * 0.1), left: -1, width: 600 })
        return
      }
      const rect = anchor.getBoundingClientRect()
      const desiredWidth = Math.min(720, Math.max(rect.width, 600))
      const margin = 8
      // Center the panel on the button, then clamp inside the viewport.
      let left = Math.round(rect.left + rect.width / 2 - desiredWidth / 2)
      if (left + desiredWidth + margin > window.innerWidth) left = window.innerWidth - desiredWidth - margin
      if (left < margin) left = margin
      setAnchorPos({ top: Math.round(rect.bottom + 4), left, width: desiredWidth })
    }
    compute()
    window.addEventListener('resize', compute)
    return () => window.removeEventListener('resize', compute)
  }, [open])

  const projects = useAppStore(s => s.projects)
  const tabs = useAppStore(s => s.tabs)
  const rightTabs = useAppStore(s => s.rightTabs)
  const activeTabId = useAppStore(s => s.activeTabId)
  const rightActiveTabId = useAppStore(s => s.rightActiveTabId)
  const recentFiles = useAppStore(s => s.recentFiles)
  const sidebarTab = useAppStore(s => s.sidebarTab)
  const splitMode = useAppStore(s => s.splitMode)
  const darkMode = useAppStore(s => s.darkMode)
  const showTOC = useAppStore(s => s.showTOC)
  const setSidebarTab = useAppStore(s => s.setSidebarTab)
  const toggleSplit = useAppStore(s => s.toggleSplit)
  const setShowTOC = useAppStore(s => s.setShowTOC)
  const setDarkMode = useAppStore(s => s.setDarkMode)
  const setActiveTab = useAppStore(s => s.setActiveTab)
  const setActivePane = useAppStore(s => s.setActivePane)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('command-palette:open', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('command-palette:open', onOpen)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setSelectedIdx(0)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingFiles(true)
    Promise.all(
      projects.map(async (project) => {
        const files = await window.electronAPI.listMdFiles(project.path).catch(() => [])
        return files.map((path) => ({
          path,
          name: path.replace(/\\/g, '/').split('/').pop() || path,
          projectName: project.name,
        }))
      }),
    ).then((groups) => {
      if (cancelled) return
      setIndexedFiles(groups.flat())
      setLoadingFiles(false)
    }).catch(() => {
      if (cancelled) return
      setIndexedFiles([])
      setLoadingFiles(false)
    })
    return () => { cancelled = true }
  }, [open, projects])

  const activeTab = useMemo(() => {
    const state = useAppStore.getState()
    const pane = state.activePaneId
    const id = pane === 'right' ? state.rightActiveTabId : state.activeTabId
    const list = pane === 'right' ? state.rightTabs : state.tabs
    return list.find(t => t.id === id) || null
  }, [activeTabId, rightActiveTabId, tabs, rightTabs])

  const actionItems = useMemo<CommandItem[]>(() => {
    const sidebarActions: Array<{ id: typeof sidebarTab; label: string }> = [
      { id: 'tree', label: '파일 트리' },
      { id: 'favorites', label: '즐겨찾기' },
      { id: 'recent', label: '최근 문서' },
      { id: 'tags', label: '태그' },
      { id: 'docs', label: '문서 목록' },
      { id: 'git', label: 'Git' },
      { id: 'kanban', label: '칸반' },
      { id: 'calendar', label: '캘린더' },
      { id: 'workflow', label: '워크플로우' },
    ]

    const actions: CommandItem[] = sidebarActions.map((item) => ({
      id: `sidebar:${item.id}`,
      title: `${item.label} 열기`,
      subtitle: '사이드바/메인 뷰 전환',
      keywords: `${item.label} sidebar tab panel`,
      kind: 'action',
      run: () => setSidebarTab(item.id),
    }))

    actions.push({
      id: 'action:split',
      title: splitMode ? '분할 보기 끄기' : '분할 보기 켜기',
      subtitle: '에디터 좌우 분할',
      keywords: 'split pane editor view',
      kind: 'action',
      run: () => toggleSplit(),
    })
    actions.push({
      id: 'action:toc',
      title: showTOC ? '목차 패널 숨기기' : '목차 패널 보이기',
      subtitle: '우측 목차 패널 토글',
      keywords: 'toc outline right panel',
      kind: 'action',
      run: () => setShowTOC(!showTOC),
    })
    actions.push({
      id: 'action:theme',
      title: darkMode === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환',
      subtitle: '테마 전환',
      keywords: 'theme dark light mode',
      kind: 'action',
      run: () => setDarkMode(darkMode === 'dark' ? 'light' : 'dark'),
    })
    actions.push({
      id: 'action:open-file-dialog',
      title: '파일 열기',
      subtitle: '시스템 파일 선택 창 열기',
      keywords: 'open file dialog',
      kind: 'action',
      run: async () => {
        const paths = await window.electronAPI.openFileDialog()
        if (!paths) return
        for (const p of paths) {
          const name = p.replace(/\\/g, '/').split('/').pop() || p
          await openFile(p, name, false)
        }
      },
    })

    if (activeTab && /\.(md|markdown)$/i.test(activeTab.fileName)) {
      actions.push({
        id: 'action:export-pdf',
        title: '현재 문서를 PDF로 내보내기',
        subtitle: activeTab.fileName,
        keywords: 'export pdf current markdown',
        kind: 'action',
        run: () => exportMdToPdf(activeTab.filePath, activeTab.fileName),
      })
      actions.push({
        id: 'action:export-docx',
        title: '현재 문서를 Word로 내보내기',
        subtitle: activeTab.fileName,
        keywords: 'export docx word current markdown',
        kind: 'action',
        run: () => exportMdToDocx(activeTab.filePath, activeTab.fileName),
      })
    }
    return actions
  }, [activeTab, darkMode, openFile, setDarkMode, setShowTOC, setSidebarTab, showTOC, sidebarTab, splitMode, toggleSplit])

  const tabItems = useMemo<CommandItem[]>(() => {
    const left = tabs.map((tab) => ({
      id: `tab:left:${tab.id}`,
      title: tab.fileName,
      subtitle: `왼쪽 탭 · ${tab.filePath}`,
      keywords: `${tab.fileName} ${tab.filePath} open tab left`,
      kind: 'tab' as const,
      run: () => {
        setActivePane('left')
        setActiveTab(tab.id)
      },
    }))
    const right = rightTabs.map((tab) => ({
      id: `tab:right:${tab.id}`,
      title: tab.fileName,
      subtitle: `오른쪽 탭 · ${tab.filePath}`,
      keywords: `${tab.fileName} ${tab.filePath} open tab right`,
      kind: 'tab' as const,
      run: () => {
        setActivePane('right')
        setActiveTab(tab.id)
      },
    }))
    return [...left, ...right]
  }, [rightTabs, setActivePane, setActiveTab, tabs])

  const recentItems = useMemo<CommandItem[]>(() => (
    recentFiles.map((file) => ({
      id: `recent:${file.path}`,
      title: file.name,
      subtitle: `최근 문서 · ${file.path}`,
      keywords: `${file.name} ${file.path} recent`,
      kind: 'recent',
      run: () => openFile(file.path, file.name, false),
    }))
  ), [openFile, recentFiles])

  const fileItems = useMemo<CommandItem[]>(() => (
    indexedFiles.map((file) => ({
      id: `file:${file.path}`,
      title: file.name,
      subtitle: `${file.projectName} · ${file.path}`,
      keywords: `${file.name} ${file.projectName} ${file.path} markdown file`,
      kind: 'file',
      run: () => openFile(file.path, file.name, false),
    }))
  ), [indexedFiles, openFile])

  const filteredItems = useMemo(() => {
    const seen = new Set<string>()
    const all = [...actionItems, ...tabItems, ...recentItems, ...fileItems]
    const scored = all
      .map((item, idx) => ({
        item,
        idx,
        score: matchScore(query, item.title, item.subtitle, item.keywords),
      }))
      .filter(v => v.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score
        const weight = { action: 5, tab: 4, recent: 3, file: 2 }
        if (weight[b.item.kind] !== weight[a.item.kind]) return weight[b.item.kind] - weight[a.item.kind]
        return a.idx - b.idx
      })
      .map(v => v.item)
      .filter((item) => {
        if (seen.has(item.id)) return false
        seen.add(item.id)
        return true
      })
    return scored.slice(0, 40)
  }, [actionItems, fileItems, query, recentItems, tabItems])

  useEffect(() => {
    if (!open) return
    setSelectedIdx(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx(i => Math.min(filteredItems.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx(i => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filteredItems[selectedIdx]
        if (!item) return
        void Promise.resolve(item.run()).finally(() => setOpen(false))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [filteredItems, open, selectedIdx])

  if (!open) return null

  // Until the anchor rect has been measured, hold the panel's render so it
  // doesn't flash at (0,0) for one frame before the layout effect runs.
  const panelStyle: React.CSSProperties = anchorPos
    ? {
        top: anchorPos.top,
        left: anchorPos.left < 0 ? '50%' : anchorPos.left,
        transform: anchorPos.left < 0 ? 'translateX(-50%)' : undefined,
        width: anchorPos.width,
        maxHeight: '70vh',
      }
    : { visibility: 'hidden' }

  return (
    <div className="fixed inset-0 z-[1100] bg-black/30 backdrop-blur-[1px]" onMouseDown={() => setOpen(false)}>
      <div
        className="absolute rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl flex flex-col"
        style={panelStyle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="파일, 탭, 액션 검색..."
            className="w-full bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {filteredItems.length === 0 ? (
            <div className="px-3 py-4 text-xs text-gray-500 dark:text-gray-400">
              {loadingFiles ? '파일 인덱스를 불러오는 중입니다.' : '일치하는 항목이 없습니다.'}
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <button
                key={item.id}
                onMouseEnter={() => setSelectedIdx(idx)}
                onClick={() => { void Promise.resolve(item.run()).finally(() => setOpen(false)) }}
                className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                  idx === selectedIdx ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/80'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-900 dark:text-gray-100 truncate">{item.title}</div>
                    {item.subtitle && (
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">{item.subtitle}</div>
                    )}
                  </div>
                  <span className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 flex-shrink-0">
                    {item.kind}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
        <div className="px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/80">
          `Ctrl+K` 열기 · `↑/↓` 이동 · `Enter` 실행 · `Esc` 닫기
        </div>
      </div>
    </div>
  )
}
