import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'

interface MenuItem {
  label: string
  shortcut?: string
  action?: () => void
  separator?: boolean
  checked?: boolean
}

interface MenuDef {
  label: string
  items: MenuItem[]
}

export default function Toolbar() {
  const {
    addProject, darkMode, setDarkMode, fontSize, setFontSize, fontFamily, setFontFamily,
    showTOC, setShowTOC, toggleSidebar, sidebarCollapsed,
    spellcheckEnabled, setSpellcheckEnabled,
  } = useAppStore()
  const [openIdx, setOpenIdx] = useState<number | null>(null)

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
      alert('탐색기의 .md 파일 "연결 프로그램" 목록에 Docuflow가 등록되었습니다.\n\n탐색기에서 .md 파일을 우클릭 → "연결 프로그램" → Docuflow를 선택하면 기본 앱으로 지정됩니다.')
    } else {
      alert('등록 실패: ' + (res.error || '알 수 없는 오류'))
    }
  }, [])

  const menus: MenuDef[] = [
    {
      label: '파일',
      items: [
        { label: '파일 열기', shortcut: 'Ctrl+O', action: handleOpenFile },
        { label: '프로젝트 폴더 추가', shortcut: 'Ctrl+Shift+O', action: handleAddProject },
        { separator: true },
        { label: '탐색기에서 .md 파일 연결 등록', action: handleRegisterMdAssociation },
        { separator: true },
        { label: '종료', shortcut: 'Ctrl+Q', action: () => window.close() },
      ],
    },
    {
      label: '보기',
      items: [
        { label: '사이드바 토글', action: toggleSidebar, checked: !sidebarCollapsed },
        { label: '목차 패널', shortcut: 'Ctrl+Shift+T', action: () => setShowTOC(!showTOC), checked: showTOC },
        { label: '맞춤법 검사', action: () => setSpellcheckEnabled(!spellcheckEnabled), checked: spellcheckEnabled },
        { separator: true },
        { label: darkMode === 'dark' ? '라이트 모드' : '다크 모드', action: toggleDark },
        { separator: true },
        { label: '글자 크기 키우기', shortcut: 'Ctrl+=', action: () => setFontSize(fontSize + 1) },
        { label: '글자 크기 줄이기', shortcut: 'Ctrl+-', action: () => setFontSize(fontSize - 1) },
      ],
    },
    {
      label: '도움말',
      items: [
        { label: 'Docuflow v2.0', action: () => {} },
      ],
    },
  ]

  // Close menu on Escape
  useEffect(() => {
    if (openIdx === null) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenIdx(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openIdx])

  // Global shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey
      if (!ctrl) return
      if (e.shiftKey && e.key === 'O') { e.preventDefault(); handleAddProject() }
      else if (e.shiftKey && (e.key === 't' || e.key === 'T')) { e.preventDefault(); setShowTOC(!useAppStore.getState().showTOC) }
      else if (e.key === 'q') { e.preventDefault(); window.close() }
      else if (e.key === '=' || e.key === '+') { e.preventDefault(); setFontSize(useAppStore.getState().fontSize + 1) }
      else if (e.key === '-') { e.preventDefault(); setFontSize(useAppStore.getState().fontSize - 1) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleAddProject, setShowTOC, setFontSize])

  const close = () => setOpenIdx(null)

  return (
    <div
      className="flex items-center gap-0.5 px-2 h-9 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag', paddingRight: '150px' } as React.CSSProperties}
    >
      {/* Logo */}
      <span
        className="text-sm font-semibold text-blue-600 dark:text-blue-400 mr-1.5 px-1 flex-shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        Docuflow
      </span>

      {/* Menu buttons — z-50 so they stay above the backdrop */}
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
                {menu.items.map((item, j) =>
                  item.separator ? (
                    <div key={j} className="border-t border-gray-200 dark:border-gray-700 my-1" />
                  ) : (
                    <button
                      key={j}
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
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Backdrop — closes menu on click outside */}
      {openIdx !== null && (
        <div className="fixed inset-0 z-40" onMouseDown={close} />
      )}

      <div className="flex-1" />

      {/* Font family */}
      <div className="flex items-center flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <select
          value={fontFamily}
          onChange={e => setFontFamily(e.target.value)}
          className="text-xs px-1.5 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none cursor-pointer"
          title="글꼴 변경"
        >
          <option value="default">시스템 기본</option>
          <option value="pretendard">Pretendard</option>
          <option value="noto-sans">Noto Sans KR</option>
          <option value="nanumgothic">나눔고딕</option>
          <option value="nanummyeongjo">나눔명조</option>
          <option value="malgun">맑은 고딕</option>
          <option value="gulim">굴림</option>
        </select>
      </div>

      {/* Font size */}
      <div className="flex items-center gap-1 flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => setFontSize(fontSize - 1)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold"
          title="글자 크기 줄이기"
        >
          A-
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400 w-8 text-center">{fontSize}</span>
        <button
          onClick={() => setFontSize(fontSize + 1)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-sm font-bold"
          title="글자 크기 키우기"
        >
          A+
        </button>
      </div>

      {/* TOC toggle */}
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

      {/* Dark mode toggle */}
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
  )
}
