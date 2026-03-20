import { useCallback, useEffect, useState } from 'react'
import { useAppStore, type Tab } from '../stores/useAppStore'
import MarkdownView from './MarkdownView'
import LiveEditor from './LiveEditor'
import TableOfContents from './TableOfContents'

interface Props {
  tab: Tab
}

// Layout modes
type Layout = 'editor' | 'split' | 'preview'

export default function MarkdownEditor({ tab }: Props) {
  const {
    setTabEditMode,
    markTabSaved,
    setTabFileChanged,
    showTOC,
  } = useAppStore()

  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // isEditMode reused as: false=preview, true=split or editor
  // We store layout in local state (persists per component mount)
  const [layout, setLayout] = useState<Layout>(tab.isEditMode ? 'split' : 'preview')

  // Sync layout → tab.isEditMode for dirty tracking
  useEffect(() => {
    setTabEditMode(tab.id, layout !== 'preview')
  }, [layout, tab.id, setTabEditMode])

  // ── Save file ─────────────────────────────────────────────────────────────
  const handleSave = useCallback(async (content?: string) => {
    const c = content ?? tab.content
    const result = await window.electronAPI.writeFile(tab.filePath, c)
    if (result.success) {
      markTabSaved(tab.id, c)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 1500)
    } else {
      setSaveError(result.error || '저장 실패')
      setTimeout(() => setSaveError(null), 3000)
    }
  }, [tab.filePath, tab.id, tab.content, markTabSaved])

  // ── Ctrl+S ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleSave])

  // ── Reload from disk ──────────────────────────────────────────────────────
  const handleReload = async () => {
    const result = await window.electronAPI.readFile(tab.filePath)
    if (result.success && result.content !== undefined) {
      markTabSaved(tab.id, result.content)
      setTabFileChanged(tab.filePath, false)
    }
  }

  const layoutBtn = (l: Layout, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setLayout(l)}
      className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded transition-colors ${
        layout === l
          ? 'bg-blue-600 text-white'
          : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
      title={label}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Editor header bar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0">
        {/* Breadcrumb */}
        <span className="text-xs text-gray-400 truncate flex-1" title={tab.filePath}>
          {tab.filePath}
        </span>

        {/* Status */}
        {saveSuccess && <span className="text-xs text-green-500 font-medium">저장됨 ✓</span>}
        {saveError && <span className="text-xs text-red-500 font-medium">{saveError}</span>}
        {tab.isDirty && !saveSuccess && (
          <span className="text-xs text-orange-400 font-medium">● 미저장</span>
        )}

        {/* Layout switcher */}
        <div className="flex items-center rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden divide-x divide-gray-200 dark:divide-gray-600">
          {layoutBtn('editor', '편집', (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          ))}
          {layoutBtn('split', '분할', (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          ))}
          {layoutBtn('preview', '미리보기', (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          ))}
        </div>

        {/* Save button (when in edit modes) */}
        {layout !== 'preview' && (
          <button
            onClick={() => handleSave()}
            className="flex items-center gap-1 px-3 py-1 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            title="저장 (Ctrl+S)"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            저장
          </button>
        )}
      </div>

      {/* File changed on disk banner */}
      {tab.fileChangedOnDisk && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/30 border-b border-orange-200 dark:border-orange-700 text-xs text-orange-700 dark:text-orange-300 flex-shrink-0">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="flex-1">파일이 외부에서 변경되었습니다.</span>
          <button onClick={handleReload} className="px-2 py-0.5 rounded bg-orange-600 text-white hover:bg-orange-700 transition-colors">
            새로고침
          </button>
          <button onClick={() => setTabFileChanged(tab.filePath, false)} className="px-2 py-0.5 rounded border border-orange-400 hover:bg-orange-100 dark:hover:bg-orange-900 transition-colors">
            무시
          </button>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {layout === 'preview' && (
          <>
            <div className="flex-1 overflow-hidden">
              <MarkdownView tab={tab} />
            </div>
            {showTOC && <TableOfContents content={tab.content} />}
          </>
        )}

        {layout === 'editor' && (
          <LiveEditor
            tab={tab}
            onSave={handleSave}
            onChange={(content) => useAppStore.getState().updateTabContent(tab.id, content)}
          />
        )}

        {layout === 'split' && (
          <SplitView
            tab={tab}
            onSave={handleSave}
            onChange={(content) => useAppStore.getState().updateTabContent(tab.id, content)}
            showTOC={showTOC}
          />
        )}
      </div>
    </div>
  )
}

// ── Split View ─────────────────────────────────────────────────────────────
interface SplitViewProps {
  tab: Tab
  onSave: (content: string) => void
  onChange: (content: string) => void
  showTOC: boolean
}

function SplitView({ tab, onSave, onChange, showTOC }: SplitViewProps) {
  const [splitRatio, setSplitRatio] = useState(50)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useState<HTMLDivElement | null>(null)

  const handleDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    const startX = e.clientX
    const startRatio = splitRatio
    const parent = (e.currentTarget as HTMLElement).parentElement!
    const parentWidth = parent.getBoundingClientRect().width

    const onMove = (me: MouseEvent) => {
      const diff = me.clientX - startX
      const newRatio = Math.min(80, Math.max(20, startRatio + (diff / parentWidth) * 100))
      setSplitRatio(newRatio)
    }
    const onUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Editor pane */}
      <div style={{ width: `${splitRatio}%` }} className="flex flex-col overflow-hidden border-r border-gray-200 dark:border-gray-700">
        <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          마크다운 편집
        </div>
        <LiveEditor
          tab={tab}
          onSave={onSave}
          onChange={onChange}
        />
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleDividerMouseDown}
        className={`w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 transition-colors ${isDragging ? 'bg-blue-400' : 'bg-gray-200 dark:bg-gray-700'}`}
      />

      {/* Preview pane */}
      <div style={{ width: `${100 - splitRatio}%` }} className="flex overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-3 py-1 text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            미리보기
          </div>
          <MarkdownView tab={tab} />
        </div>
        {showTOC && <TableOfContents content={tab.content} />}
      </div>
    </div>
  )
}
