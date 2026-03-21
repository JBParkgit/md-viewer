import { useCallback, useEffect, useRef, useState } from 'react'
import { EditorView } from '@uiw/react-codemirror'
import { useAppStore, type Tab } from '../stores/useAppStore'
import { markRecentlySaved } from '../utils/recentSave'
import { parseFrontmatterTags, updateFrontmatterTags } from '../utils/frontmatter'
import MarkdownView from './MarkdownView'
import LiveEditor from './LiveEditor'
import TableOfContents from './TableOfContents'
import TableEditor from './TableEditor'
import FloatingToolbar from './FloatingToolbar'

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
  const [showTableEditor, setShowTableEditor] = useState(false)
  const editorViewRef = useRef<EditorView | null>(null)

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
    markRecentlySaved(tab.filePath)
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

      {/* Tag bar */}
      <TagBar tab={tab} onSave={handleSave} />

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

      {/* Markdown formatting toolbar */}
      {layout !== 'preview' && (
        <MdToolbar editorViewRef={editorViewRef} onTableClick={() => setShowTableEditor(true)} />
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
            editorViewRef={editorViewRef}
          />
        )}

        {layout === 'split' && (
          <SplitView
            tab={tab}
            onSave={handleSave}
            onChange={(content) => useAppStore.getState().updateTabContent(tab.id, content)}
            showTOC={showTOC}
            editorViewRef={editorViewRef}
          />
        )}
      </div>

      {/* Floating selection toolbar */}
      {layout !== 'preview' && <FloatingToolbar editorViewRef={editorViewRef} />}

      {/* Table Editor Modal */}
      {showTableEditor && (
        <TableEditor
          onInsert={(md) => {
            const view = editorViewRef.current
            if (view) {
              const pos = view.state.selection.main.head
              const text = '\n' + md + '\n'
              view.dispatch({
                changes: { from: pos, insert: text },
                selection: { anchor: pos + text.length },
              })
            } else {
              // Fallback: append to content
              useAppStore.getState().updateTabContent(tab.id, tab.content + '\n' + md + '\n')
            }
          }}
          onClose={() => setShowTableEditor(false)}
        />
      )}
    </div>
  )
}

// ── Tag Bar ───────────────────────────────────────────────────────────────
function TagBar({ tab, onSave }: { tab: Tab; onSave: (content: string) => void }) {
  const tags = parseFrontmatterTags(tab.content)
  const tagColors = useAppStore(s => s.tagColors)
  const projects = useAppStore(s => s.projects)
  const [inputVisible, setInputVisible] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const [allTags, setAllTags] = useState<string[]>([])

  // Collect all existing tags for autocomplete
  useEffect(() => {
    const load = async () => {
      const tagSet = new Set<string>()
      for (const p of projects) {
        try {
          const results = await window.electronAPI.collectTags(p.path)
          for (const r of results) r.tags.forEach(t => tagSet.add(t))
        } catch {}
      }
      setAllTags([...tagSet].sort())
    }
    load()
  }, [projects])

  useEffect(() => {
    if (inputVisible) setTimeout(() => inputRef.current?.focus(), 0)
  }, [inputVisible])

  // Update suggestions when input changes
  useEffect(() => {
    if (!inputValue.trim()) { setSuggestions([]); setSelectedIdx(-1); return }
    const q = inputValue.toLowerCase()
    const filtered = allTags.filter(t => t.toLowerCase().includes(q) && !tags.includes(t))
    setSuggestions(filtered.slice(0, 8))
    setSelectedIdx(-1)
  }, [inputValue, allTags, tags])

  const addTag = (tag: string) => {
    const t = tag.trim()
    if (!t || tags.includes(t)) return
    const updated = updateFrontmatterTags(tab.content, [...tags, t])
    useAppStore.getState().updateTabContent(tab.id, updated)
    onSave(updated)
  }

  const removeTag = (tag: string) => {
    const updated = updateFrontmatterTags(tab.content, tags.filter(t => t !== tag))
    useAppStore.getState().updateTabContent(tab.id, updated)
    onSave(updated)
  }

  const commitInput = (value?: string) => {
    const v = value ?? inputValue
    if (v.trim()) addTag(v)
    setInputValue('')
    setSuggestions([])
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedIdx >= 0 && selectedIdx < suggestions.length) {
        commitInput(suggestions[selectedIdx])
      } else {
        commitInput()
      }
    } else if (e.key === 'Escape') {
      setInputVisible(false)
      setInputValue('')
      setSuggestions([])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIdx(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIdx(i => Math.max(i - 1, -1))
    }
  }

  const getColors = (tag: string) => {
    const colorId = tagColors[tag]
    const colorMap: Record<string, { bg: string; text: string }> = {
      blue: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
      green: { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
      red: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300' },
      purple: { bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300' },
      amber: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
      cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
      rose: { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },
      gray: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300' },
    }
    return colorMap[colorId] || colorMap.blue
  }

  return (
    <div className="flex items-center gap-1 px-4 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0 min-h-[28px] flex-wrap">
      <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
      {tags.map(tag => {
        const c = getColors(tag)
        return (
          <span
            key={tag}
            className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs ${c.bg} ${c.text}`}
          >
            {tag}
            <button
              onClick={() => removeTag(tag)}
              className="w-3 h-3 flex items-center justify-center rounded-full hover:opacity-70 ml-0.5"
            >
              ×
            </button>
          </span>
        )
      })}
      {inputVisible ? (
        <div className="relative">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => { commitInput(); setInputVisible(false); setSuggestions([]) }, 150)}
            placeholder="태그 입력..."
            className="text-xs px-1.5 py-0.5 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 w-28"
          />
          {suggestions.length > 0 && (
            <div className="absolute left-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-32 z-50">
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onMouseDown={(e) => { e.preventDefault(); commitInput(s) }}
                  className={`w-full text-left px-2.5 py-1 text-xs ${
                    i === selectedIdx ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  # {s}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button
          onClick={() => setInputVisible(true)}
          className="text-xs text-gray-400 hover:text-blue-500 px-1"
          title="태그 추가"
        >
          + 태그
        </button>
      )}
    </div>
  )
}

// ── Split View ─────────────────────────────────────────────────────────────
interface SplitViewProps {
  tab: Tab
  onSave: (content: string) => void
  onChange: (content: string) => void
  showTOC: boolean
  editorViewRef?: React.MutableRefObject<EditorView | null>
}

// ── Markdown Formatting Toolbar ──────────────────────────────────────────────
interface MdToolbarProps {
  editorViewRef: React.MutableRefObject<EditorView | null>
  onTableClick: () => void
}

function MdToolbar({ editorViewRef, onTableClick }: MdToolbarProps) {
  const insert = (text: string) => {
    const view = editorViewRef.current
    if (!view) return
    const pos = view.state.selection.main.head
    view.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
    view.focus()
  }

  const wrap = (before: string, after: string) => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    const replacement = before + (selected || '텍스트') + after
    view.dispatch({ changes: { from, to, insert: replacement }, selection: { anchor: from + before.length, head: from + replacement.length - after.length } })
    view.focus()
  }

  const wrapLine = (prefix: string) => {
    const view = editorViewRef.current
    if (!view) return
    const { from } = view.state.selection.main
    const line = view.state.doc.lineAt(from)
    const lineText = line.text
    if (lineText.startsWith(prefix)) {
      // Same prefix: toggle off
      view.dispatch({ changes: { from: line.from, to: line.from + prefix.length, insert: '' } })
    } else {
      // Replace existing heading prefix if any, otherwise just prepend
      const headingMatch = lineText.match(/^#{1,6}\s/)
      if (headingMatch) {
        view.dispatch({ changes: { from: line.from, to: line.from + headingMatch[0].length, insert: prefix } })
      } else {
        view.dispatch({ changes: { from: line.from, insert: prefix } })
      }
    }
    view.focus()
  }

  const btnCls = "w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors"
  const sepCls = "w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5"

  return (
    <div className="flex items-center gap-0.5 px-3 h-8 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex-shrink-0 overflow-x-auto">
      {/* Headings */}
      <button onClick={() => wrapLine('# ')} className={btnCls} title="제목 1 (H1)">
        <span className="text-xs font-bold">H1</span>
      </button>
      <button onClick={() => wrapLine('## ')} className={btnCls} title="제목 2 (H2)">
        <span className="text-xs font-bold">H2</span>
      </button>
      <button onClick={() => wrapLine('### ')} className={btnCls} title="제목 3 (H3)">
        <span className="text-xs font-bold">H3</span>
      </button>
      <div className={sepCls} />

      {/* Bold */}
      <button onClick={() => wrap('**', '**')} className={btnCls} title="굵게 (Ctrl+B)">
        <span className="text-xs font-bold">B</span>
      </button>
      {/* Italic */}
      <button onClick={() => wrap('*', '*')} className={btnCls} title="기울임 (Ctrl+I)">
        <span className="text-xs italic">I</span>
      </button>
      {/* Strikethrough */}
      <button onClick={() => wrap('~~', '~~')} className={btnCls} title="취소선">
        <span className="text-xs line-through">S</span>
      </button>
      {/* Inline code */}
      <button onClick={() => wrap('`', '`')} className={btnCls} title="인라인 코드">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      </button>
      <div className={sepCls} />

      {/* Unordered list */}
      <button onClick={() => wrapLine('- ')} className={btnCls} title="목록">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      {/* Ordered list */}
      <button onClick={() => wrapLine('1. ')} className={btnCls} title="번호 목록">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h8" />
        </svg>
      </button>
      {/* Checklist */}
      <button onClick={() => wrapLine('- [ ] ')} className={btnCls} title="체크리스트">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
      </button>
      <div className={sepCls} />

      {/* Blockquote */}
      <button onClick={() => wrapLine('> ')} className={btnCls} title="인용">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
      {/* Link */}
      <button onClick={() => wrap('[', '](url)')} className={btnCls} title="링크">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      {/* Image */}
      <button onClick={() => insert('![alt](url)')} className={btnCls} title="이미지">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      <div className={sepCls} />

      {/* Code block */}
      <button onClick={() => insert('\n```\n코드\n```\n')} className={btnCls} title="코드 블록">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {/* Table */}
      <button onClick={onTableClick} className={btnCls} title="표 삽입">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 3v18M14 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" />
        </svg>
      </button>
      {/* Horizontal rule */}
      <button onClick={() => insert('\n---\n')} className={btnCls} title="구분선">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12h16" />
        </svg>
      </button>
    </div>
  )
}

function SplitView({ tab, onSave, onChange, showTOC, editorViewRef }: SplitViewProps) {
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
          editorViewRef={editorViewRef}
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
