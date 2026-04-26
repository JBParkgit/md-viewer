import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '../stores/useAppStore'
import HelpModal from './HelpModal'
import { exportMdToPdf, exportMdToDocx, importDocxAsMd } from '../utils/exportImport'
import { alert } from '../utils/dialog'

const FONT_FAMILIES: Array<{ id: string; label: string }> = [
  { id: 'default', label: '시스템 기본' },
  { id: 'pretendard', label: 'Pretendard' },
  { id: 'noto-sans', label: 'Noto Sans KR' },
  { id: 'nanumgothic', label: '나눔고딕' },
  { id: 'nanummyeongjo', label: '나눔명조' },
  { id: 'malgun', label: '맑은 고딕' },
  { id: 'gulim', label: '굴림' },
]

interface MenuItem {
  label?: string
  shortcut?: string
  action?: () => void
  separator?: boolean
  checked?: boolean
  // When set, hovering this item opens a side panel with these children
  // instead of firing `action`. Children themselves should be leaf items
  // (no nested submenus — we only need one level for the font picker).
  submenu?: MenuItem[]
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

export default function Toolbar() {
  const {
    addProject, darkMode, setDarkMode, fontSize, setFontSize, fontFamily, setFontFamily,
    showTOC, setShowTOC, toggleSidebar, sidebarCollapsed, splitMode, toggleSplit,
    spellcheckEnabled, setSpellcheckEnabled,
  } = useAppStore()
  const canNavBack = useAppStore(s => s.navIndex > 0)
  const canNavForward = useAppStore(s => s.navIndex < s.navHistory.length - 1)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  // Index of the currently hovered submenu inside the open top-level menu —
  // null means no submenu is expanded.
  const [openSubIdx, setOpenSubIdx] = useState<number | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const dispatchNav = (direction: 'back' | 'forward') => {
    window.dispatchEvent(new CustomEvent('nav:go', { detail: { direction } }))
  }

  const openInlinePalette = useCallback((initial: string = '') => {
    setSearchOpen(true)
    window.dispatchEvent(new CustomEvent('command-palette:open', { detail: { mode: 'inline', query: initial } }))
  }, [])

  // Keep the palette query in sync with the toolbar input (single source of
  // truth lives in the input; the palette mirrors it for filtering).
  useEffect(() => {
    if (!searchOpen) return
    window.dispatchEvent(new CustomEvent('command-palette:set-query', { detail: { query: searchValue } }))
  }, [searchValue, searchOpen])

  // Palette can close itself (Esc, outside click, item run) — reflect that
  // in the toolbar input so the placeholder reappears.
  useEffect(() => {
    const onClosed = () => {
      setSearchOpen(false)
      setSearchValue('')
    }
    window.addEventListener('command-palette:closed', onClosed)
    return () => window.removeEventListener('command-palette:closed', onClosed)
  }, [])

  const handleAddProject = useCallback(async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) addProject(folder)
  }, [addProject])

  const handleOpenFile = useCallback(async () => {
    const paths = await window.electronAPI.openFileDialog()
    if (paths) {
      for (const p of paths) {
        const name = p.split(/[/\\]/).pop() || p
        window.dispatchEvent(new CustomEvent('menu:openFile', { detail: { path: p, name } }))
      }
    }
  }, [])

  const toggleDark = useCallback(() => {
    setDarkMode(darkMode === 'dark' ? 'light' : 'dark')
  }, [darkMode, setDarkMode])

  const handleRegisterMdAssociation = useCallback(async () => {
    const res = await window.electronAPI.registerMdAssociation()
    if (res.success) {
      alert('.md 파일 연결 프로그램 목록에 Docuflow를 등록했습니다.\n\n탐색기에서 .md 파일을 우클릭해 연결 프로그램으로 Docuflow를 선택하면 기본 앱으로 지정할 수 있습니다.')
    } else {
      alert('등록 실패: ' + (res.error || '알 수 없는 오류'))
    }
  }, [])

  const getActiveMdTab = () => {
    const s = useAppStore.getState()
    const pane = s.activePaneId
    const id = pane === 'right' ? s.rightActiveTabId : s.activeTabId
    const list = pane === 'right' ? s.rightTabs : s.tabs
    const tab = list.find(t => t.id === id)
    if (!tab) { alert('열려 있는 문서가 없습니다.'); return null }
    if (!/\.(md|markdown)$/i.test(tab.fileName)) {
      alert('Markdown 파일(.md)만 내보낼 수 있습니다.')
      return null
    }
    return tab
  }

  const handleExportPdf = useCallback(() => {
    const tab = getActiveMdTab()
    if (tab) exportMdToPdf(tab.filePath, tab.fileName)
  }, [])

  const handleExportDocx = useCallback(() => {
    const tab = getActiveMdTab()
    if (tab) exportMdToDocx(tab.filePath, tab.fileName)
  }, [])

  const handleImportDocx = useCallback(async () => {
    const docx = await window.electronAPI.openDocxDialog()
    if (!docx) return
    importDocxAsMd(docx)
  }, [])

  const menus: MenuDef[] = [
    {
      label: '파일',
      items: [
        { label: '파일 열기', shortcut: 'Ctrl+O', action: handleOpenFile },
        { label: '프로젝트 폴더 추가', shortcut: 'Ctrl+Shift+O', action: handleAddProject },
        { separator: true },
        { label: '현재 문서를 PDF로 내보내기...', action: handleExportPdf },
        { label: '현재 문서를 Word(DOCX)로 내보내기...', action: handleExportDocx },
        { label: 'Word 문서를 Markdown으로 가져오기...', action: handleImportDocx },
        { separator: true },
        { label: '.md 파일 연결 등록', action: handleRegisterMdAssociation },
        { separator: true },
        { label: '종료', shortcut: 'Ctrl+Q', action: () => window.close() },
      ],
    },
    {
      label: '보기',
      items: [
        { label: '사이드바 보이기', action: toggleSidebar, checked: !sidebarCollapsed },
        { label: '목차 패널', shortcut: 'Ctrl+Shift+T', action: () => setShowTOC(!showTOC), checked: showTOC },
        { label: '맞춤법 검사', action: () => setSpellcheckEnabled(!spellcheckEnabled), checked: spellcheckEnabled },
        { separator: true },
        { label: darkMode === 'dark' ? '라이트 모드' : '다크 모드', action: toggleDark },
        { separator: true },
        { label: '글꼴 크기 키우기', shortcut: 'Ctrl+=', action: () => setFontSize(fontSize + 1) },
        { label: '글꼴 크기 줄이기', shortcut: 'Ctrl+-', action: () => setFontSize(fontSize - 1) },
        {
          label: '글꼴',
          submenu: FONT_FAMILIES.map(f => ({
            label: f.label,
            action: () => setFontFamily(f.id),
            checked: fontFamily === f.id,
          })),
        },
      ],
    },
    {
      label: '도움말',
      items: [
        { label: '도움말 보기', shortcut: 'F1', action: () => setHelpOpen(true) },
        { separator: true },
        { label: `Docuflow v${__APP_VERSION__}`, action: () => setHelpOpen(true) },
      ],
    },
  ]

  useEffect(() => {
    if (openIdx === null) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenIdx(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openIdx])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setHelpOpen(true); return }
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (!e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
        openInlinePalette(searchInputRef.current?.value ?? '')
      } else if (e.shiftKey && e.key === 'O') {
        e.preventDefault()
        handleAddProject()
      } else if (e.shiftKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault()
        setShowTOC(!useAppStore.getState().showTOC)
      } else if (e.key === 'q') {
        e.preventDefault()
        window.close()
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setFontSize(useAppStore.getState().fontSize + 1)
      } else if (e.key === '-') {
        e.preventDefault()
        setFontSize(useAppStore.getState().fontSize - 1)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleAddProject, setShowTOC, setFontSize, openInlinePalette])

  const close = () => { setOpenIdx(null); setOpenSubIdx(null) }

  // Reset the submenu whenever the user opens a different top-level menu so
  // a stale 글꼴 panel doesn't appear under an unrelated parent.
  useEffect(() => { setOpenSubIdx(null) }, [openIdx])

  return (
    <>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <div
        className="flex items-center gap-0.5 px-2 h-9 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 select-none"
        style={{ WebkitAppRegion: 'drag', paddingRight: '150px' } as React.CSSProperties}
        onDoubleClick={(e) => {
          // Only treat double-click on the bar's bare drag region as a window
          // toggle — clicks on inner buttons/menus must not trigger maximize.
          // Inner interactive elements set WebkitAppRegion: 'no-drag' and have
          // their own onClick stopping propagation, but we still gate by target
          // here in case any pass-through reaches us.
          if (e.target === e.currentTarget) {
            window.electronAPI.toggleMaximize()
          }
        }}
      >
        <span
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 mr-1.5 px-1 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Docuflow <span className="text-[10px] font-normal text-gray-400 dark:text-gray-500 align-middle">v{__APP_VERSION__}</span>
        </span>

        <div className="flex items-center flex-shrink-0 relative z-50" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {menus.map((menu, i) => (
            <div key={menu.label} className="relative">
              <button
                onMouseDown={() => setOpenIdx(openIdx === i ? null : i)}
                onMouseEnter={() => { if (openIdx !== null && openIdx !== i) setOpenIdx(i) }}
                className={`px-2.5 py-1 text-xs whitespace-nowrap ${
                  openIdx === i
                    ? 'bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-100'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70'
                }`}
              >
                {menu.label}
              </button>
              {openIdx === i && (
                <div
                  className="absolute left-0 top-full z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 whitespace-nowrap"
                  style={{ minWidth: 220 }}
                >
                  {menu.items.map((item, j) => {
                    if (item.separator) {
                      return <div key={j} className="border-t border-gray-200 dark:border-gray-700 my-1" />
                    }
                    if (item.submenu) {
                      const isSubOpen = openSubIdx === j
                      return (
                        <div
                          key={j}
                          className="relative"
                          onMouseEnter={() => setOpenSubIdx(j)}
                        >
                          <button
                            onMouseDown={(e) => { e.preventDefault(); setOpenSubIdx(isSubOpen ? null : j) }}
                            className={`w-full flex items-center justify-between px-3 py-1.5 text-xs ${
                              isSubOpen
                                ? 'bg-blue-500 text-white dark:bg-blue-600'
                                : 'text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600'
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className="w-3.5" />
                              {item.label}
                            </span>
                            <span className="text-[10px] opacity-70 ml-8">▶</span>
                          </button>
                          {isSubOpen && (
                            <div
                              className="absolute left-full top-0 -ml-px bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 whitespace-nowrap"
                              style={{ minWidth: 200 }}
                            >
                              {item.submenu.map((sub, k) =>
                                sub.separator ? (
                                  <div key={k} className="border-t border-gray-200 dark:border-gray-700 my-1" />
                                ) : (
                                  <button
                                    key={k}
                                    onMouseDown={(e) => { e.preventDefault(); sub.action?.(); close() }}
                                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600"
                                  >
                                    <span className="flex items-center gap-2">
                                      {sub.checked !== undefined && (
                                        <span className="w-3.5 text-center">{sub.checked ? '✓' : ''}</span>
                                      )}
                                      {sub.label}
                                    </span>
                                    {sub.shortcut && (
                                      <span className="text-[10px] opacity-60 ml-8">{sub.shortcut}</span>
                                    )}
                                  </button>
                                ),
                              )}
                            </div>
                          )}
                        </div>
                      )
                    }
                    return (
                      <button
                        key={j}
                        onMouseEnter={() => setOpenSubIdx(null)}
                        onMouseDown={(e) => { e.preventDefault(); item.action?.(); close() }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600"
                      >
                        <span className="flex items-center gap-2">
                          {item.checked !== undefined && (
                            <span className="w-3.5 text-center">{item.checked ? '✓' : ''}</span>
                          )}
                          {item.label}
                        </span>
                        {item.shortcut && (
                          <span className="text-[10px] opacity-60 ml-8">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {openIdx !== null && (
          <div className="fixed inset-0 z-40" onMouseDown={close} />
        )}

        {/* Center: nav + search palette. The wrapper itself stays drag-able
            so the empty space around the search button can be used to move
            the window; only the interactive children opt out via no-drag. */}
        <div
          className="flex-1 flex items-center justify-center gap-1 px-3"
          onDoubleClick={(e) => {
            if (e.target === e.currentTarget) window.electronAPI.toggleMaximize()
          }}
        >
          <div className="flex items-center gap-0.5 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => dispatchNav('back')}
              disabled={!canNavBack}
              title="이전 파일 (Alt+Left)"
              className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => dispatchNav('forward')}
              disabled={!canNavForward}
              title="다음 파일 (Alt+Right)"
              className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200/70 dark:hover:bg-gray-700/70 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <div
            data-command-palette-anchor
            className={`w-full max-w-[320px] h-7 rounded-[10px] border bg-gray-100/90 dark:bg-gray-700/70 px-3 flex items-center gap-2 text-xs transition-colors ${
              searchOpen
                ? 'border-blue-400 dark:border-blue-500 bg-white dark:bg-gray-800'
                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-200/80 dark:hover:bg-gray-700'
            }`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.8 18a7.2 7.2 0 100-14.4 7.2 7.2 0 000 14.4z" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              value={searchValue}
              placeholder="작업, 텍스트, 도움말 등을 검색해 보세요."
              onFocus={() => openInlinePalette(searchValue)}
              onChange={e => {
                setSearchValue(e.target.value)
                if (!searchOpen) openInlinePalette(e.target.value)
              }}
              onKeyDown={e => {
                // Stop arrow keys from moving the input cursor — let them
                // bubble to the palette's window listener which moves the
                // selection. Esc / Enter keep their default bubble path so the
                // palette's existing handler runs (close / run selected item).
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault()
              }}
              title="전역 명령 팔레트 (Ctrl+K)"
              className="flex-1 min-w-0 bg-transparent text-xs text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none"
            />
            {!searchOpen && (
              <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0">Ctrl+K</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <button
            onClick={() => setFontSize(fontSize - 1)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold"
            title="글꼴 크기 줄이기"
          >
            A-
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-center">{fontSize}</span>
          <button
            onClick={() => setFontSize(fontSize + 1)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-bold"
            title="글꼴 크기 키우기"
          >
            A+
          </button>
        </div>

        <button
          onClick={() => toggleSplit()}
          className={`w-7 h-7 flex items-center justify-center rounded flex-shrink-0 ${
            splitMode
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="화면 분할"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16M4 4h16v16H4z" />
          </svg>
        </button>

        <button
          onClick={() => setShowTOC(!showTOC)}
          className={`w-7 h-7 flex items-center justify-center rounded flex-shrink-0 ${
            showTOC
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900 dark:text-blue-400'
              : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="목차 패널"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h10M4 14h14M4 18h8" />
          </svg>
        </button>

        <button
          onClick={toggleDark}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 flex-shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={darkMode === 'dark' ? '라이트 모드' : '다크 모드'}
        >
          {darkMode === 'dark' ? (
            <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-600" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>
    </>
  )
}
