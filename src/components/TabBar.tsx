import { useRef, useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { FileTypeIcon } from '../utils/fileType'

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab, pinTab } = useAppStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  // 스크롤 가능 여부 업데이트
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
  }, [tabs, updateScrollState])

  // 활성 탭이 보이도록 스크롤
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !activeTabId) return
    const tabEl = el.querySelector(`[data-tab-id="${activeTabId}"]`) as HTMLElement
    if (!tabEl) return
    const { offsetLeft, offsetWidth } = tabEl
    if (offsetLeft < el.scrollLeft) {
      el.scrollTo({ left: offsetLeft - 4, behavior: 'smooth' })
    } else if (offsetLeft + offsetWidth > el.scrollLeft + el.clientWidth) {
      el.scrollTo({ left: offsetLeft + offsetWidth - el.clientWidth + 4, behavior: 'smooth' })
    }
  }, [activeTabId])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -160 : 160, behavior: 'smooth' })
  }

  if (tabs.length === 0) return (
    <div className="h-9 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0" />
  )

  return (
    <div className="flex items-stretch bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 select-none">
      {/* 왼쪽 스크롤 화살표 */}
      {canScrollLeft && (
        <button
          onClick={() => scroll('left')}
          className="flex-shrink-0 w-6 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 border-r border-gray-200 dark:border-gray-700"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      )}

      {/* 탭 목록 */}
      <div
        ref={scrollRef}
        className="flex items-end overflow-x-auto flex-1"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => { if (tab.isPreview) pinTab(tab.id) }}
              className={`
                group flex items-center gap-1.5 px-3 py-2 cursor-pointer whitespace-nowrap
                border-r border-gray-200 dark:border-gray-700 transition-colors flex-shrink-0
                ${isActive
                  ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-t-2 border-t-blue-500'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 border-t-2 border-t-transparent'
                }
              `}
              title={tab.isPreview ? `${tab.filePath}\n(미리보기 탭 — 더블클릭하여 고정)` : tab.filePath}
              style={{ maxWidth: '200px' }}
            >
              {/* 파일 타입 아이콘 */}
              <FileTypeIcon name={tab.fileName} className="w-3.5 h-3.5 flex-shrink-0" />

              {/* 탭 이름 */}
              <span
                className={`text-xs truncate ${tab.isPreview ? 'italic opacity-80' : ''}`}
                style={{ maxWidth: '120px' }}
              >
                {tab.isDirty && <span className="text-orange-400 mr-0.5">●</span>}
                {tab.fileName}
                {tab.fileChangedOnDisk && !tab.isDirty && (
                  <span className="ml-1 text-orange-500" title="파일이 외부에서 변경됨">⚡</span>
                )}
              </span>

              {/* 미리보기 표시 핀 / 닫기 버튼 */}
              {tab.isPreview ? (
                // preview 탭: 닫기 버튼만 (항상 표시)
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-300 dark:hover:bg-gray-600 flex-shrink-0 opacity-60 hover:opacity-100"
                  title="탭 닫기"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : (
                // 고정 탭: hover 시 닫기 버튼
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                  className="w-4 h-4 flex items-center justify-center rounded hover:bg-gray-300 dark:hover:bg-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                  title="탭 닫기"
                >
                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 오른쪽 스크롤 화살표 */}
      {canScrollRight && (
        <button
          onClick={() => scroll('right')}
          className="flex-shrink-0 w-6 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 border-l border-gray-200 dark:border-gray-700"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}
    </div>
  )
}
