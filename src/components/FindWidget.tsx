import { useCallback, useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { EditorSelection } from '@codemirror/state'
import { SearchCursor } from '@codemirror/search'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  previewContainer: HTMLElement | null
  // Decides which target to search when both are present (e.g. split mode).
  prefer: 'editor' | 'preview'
}

interface Match {
  // Editor positions (only when editorView is the source)
  from: number
  to: number
  // Preview range (only when previewContainer is the source)
  range?: Range
}

const supportsCSSHighlight =
  typeof CSS !== 'undefined' && (CSS as any).highlights && typeof (window as any).Highlight !== 'undefined'

export default function FindWidget({ open, onClose, editorView, previewContainer, prefer }: Props) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [total, setTotal] = useState(0)
  const [error, setError] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const matchesRef = useRef<Match[]>([])

  const usingEditor = prefer === 'editor' && !!editorView
  const usingPreview = !usingEditor && !!previewContainer

  const clearPreviewHighlights = useCallback(() => {
    if (!supportsCSSHighlight) return
    ;(CSS as any).highlights.delete('find-match')
    ;(CSS as any).highlights.delete('find-match-current')
  }, [])

  const applyPreviewHighlights = useCallback((idx: number) => {
    if (!supportsCSSHighlight) return
    const all = new (window as any).Highlight()
    const cur = new (window as any).Highlight()
    matchesRef.current.forEach((m, i) => {
      if (!m.range) return
      if (i === idx) cur.add(m.range)
      else all.add(m.range)
    })
    ;(CSS as any).highlights.set('find-match', all)
    ;(CSS as any).highlights.set('find-match-current', cur)
  }, [])

  const scrollPreviewToCurrent = useCallback((idx: number) => {
    const m = matchesRef.current[idx]
    if (!m?.range || !previewContainer) return
    const rect = m.range.getBoundingClientRect()
    const containerRect = previewContainer.getBoundingClientRect()
    if (rect.top < containerRect.top + 40 || rect.bottom > containerRect.bottom - 40) {
      const target = previewContainer.scrollTop + (rect.top - containerRect.top) - containerRect.height / 3
      previewContainer.scrollTo({ top: target, behavior: 'smooth' })
    }
  }, [previewContainer])

  const highlightEditorMatch = useCallback((idx: number) => {
    const m = matchesRef.current[idx]
    if (!m || !editorView) return
    editorView.dispatch({
      selection: EditorSelection.single(m.from, m.to),
      scrollIntoView: true,
    })
  }, [editorView])

  // Recompute matches whenever query/options/source change
  useEffect(() => {
    if (!open) return
    setError(false)
    matchesRef.current = []
    if (!query) {
      clearPreviewHighlights()
      setTotal(0)
      setCurrentIdx(-1)
      return
    }

    if (usingEditor && editorView) {
      const matches: Match[] = []
      try {
        if (useRegex) {
          const re = new RegExp(query, caseSensitive ? 'g' : 'gi')
          const text = editorView.state.doc.toString()
          let m: RegExpExecArray | null
          while ((m = re.exec(text))) {
            if (m[0].length === 0) { re.lastIndex++; continue }
            const from = m.index
            const to = from + m[0].length
            if (wholeWord) {
              const before = from > 0 ? text[from - 1] : ' '
              const after = to < text.length ? text[to] : ' '
              if (/\w/.test(before) || /\w/.test(after)) continue
            }
            matches.push({ from, to })
          }
        } else {
          const norm = caseSensitive ? undefined : (s: string) => s.toLowerCase()
          const cursor = new SearchCursor(editorView.state.doc, query, 0, editorView.state.doc.length, norm)
          while (!cursor.next().done) {
            const { from, to } = cursor.value
            if (wholeWord) {
              const docText = editorView.state.doc
              const before = from > 0 ? docText.sliceString(from - 1, from) : ' '
              const after = to < docText.length ? docText.sliceString(to, to + 1) : ' '
              if (/\w/.test(before) || /\w/.test(after)) continue
            }
            matches.push({ from, to })
          }
        }
      } catch {
        setError(true)
        setTotal(0)
        setCurrentIdx(-1)
        return
      }
      matchesRef.current = matches
      setTotal(matches.length)
      if (matches.length === 0) { setCurrentIdx(-1); return }
      // Pick match closest to (and after) current cursor
      const cursorPos = editorView.state.selection.main.head
      let nearest = 0
      for (let i = 0; i < matches.length; i++) {
        if (matches[i].from >= cursorPos) { nearest = i; break }
        nearest = matches.length - 1
      }
      setCurrentIdx(nearest)
      highlightEditorMatch(nearest)
      return
    }

    if (usingPreview && previewContainer) {
      const matches: Match[] = []
      let regex: RegExp
      try {
        const pattern = useRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const wrapped = wholeWord ? `\\b(?:${pattern})\\b` : pattern
        regex = new RegExp(wrapped, caseSensitive ? 'g' : 'gi')
      } catch {
        setError(true)
        clearPreviewHighlights()
        setTotal(0)
        setCurrentIdx(-1)
        return
      }
      const walker = document.createTreeWalker(previewContainer, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => {
          // Skip text inside script/style/code blocks we don't want — keep it simple, allow all.
          const parent = (n as Text).parentElement
          if (!parent) return NodeFilter.FILTER_REJECT
          // Skip the find widget itself if it's inside container (it isn't, but defensive)
          if (parent.closest('[data-find-widget]')) return NodeFilter.FILTER_REJECT
          return NodeFilter.FILTER_ACCEPT
        },
      })
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = node.nodeValue || ''
        if (!text) continue
        regex.lastIndex = 0
        let m: RegExpExecArray | null
        while ((m = regex.exec(text))) {
          if (m[0].length === 0) { regex.lastIndex++; continue }
          const r = document.createRange()
          r.setStart(node, m.index)
          r.setEnd(node, m.index + m[0].length)
          matches.push({ from: 0, to: 0, range: r })
        }
      }
      matchesRef.current = matches
      setTotal(matches.length)
      if (matches.length === 0) {
        setCurrentIdx(-1)
        clearPreviewHighlights()
        return
      }
      setCurrentIdx(0)
      applyPreviewHighlights(0)
      scrollPreviewToCurrent(0)
    }
  }, [open, query, caseSensitive, wholeWord, useRegex, usingEditor, usingPreview, editorView, previewContainer, applyPreviewHighlights, clearPreviewHighlights, highlightEditorMatch, scrollPreviewToCurrent])

  // Clear highlights when widget closes
  useEffect(() => {
    if (!open) clearPreviewHighlights()
  }, [open, clearPreviewHighlights])

  // Cleanup highlights on unmount
  useEffect(() => () => clearPreviewHighlights(), [clearPreviewHighlights])

  // Focus input each time widget opens
  useEffect(() => {
    if (open) {
      // Pre-fill from current selection if non-empty and short
      const sel = window.getSelection()?.toString().trim() || ''
      if (sel && sel.length <= 200 && !sel.includes('\n')) {
        setQuery(sel)
      }
      setTimeout(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      }, 0)
    }
  }, [open])

  const goNext = useCallback(() => {
    if (total === 0) return
    const next = (currentIdx + 1) % total
    setCurrentIdx(next)
    if (usingEditor) highlightEditorMatch(next)
    else { applyPreviewHighlights(next); scrollPreviewToCurrent(next) }
  }, [total, currentIdx, usingEditor, highlightEditorMatch, applyPreviewHighlights, scrollPreviewToCurrent])

  const goPrev = useCallback(() => {
    if (total === 0) return
    const prev = (currentIdx - 1 + total) % total
    setCurrentIdx(prev)
    if (usingEditor) highlightEditorMatch(prev)
    else { applyPreviewHighlights(prev); scrollPreviewToCurrent(prev) }
  }, [total, currentIdx, usingEditor, highlightEditorMatch, applyPreviewHighlights, scrollPreviewToCurrent])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) goPrev()
      else goNext()
    } else if (e.key === 'F3') {
      e.preventDefault()
      if (e.shiftKey) goPrev()
      else goNext()
    }
  }

  if (!open) return null

  const toggleBtn = (active: boolean, onClick: () => void, label: string, title: string) => (
    <button
      onClick={onClick}
      className={`w-6 h-6 flex items-center justify-center rounded text-xs font-mono transition-colors ${
        active
          ? 'bg-blue-500 text-white'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
      title={title}
      tabIndex={-1}
    >
      {label}
    </button>
  )

  return (
    <div
      data-find-widget
      className="absolute top-2 right-4 z-30 flex items-center gap-1 px-2 py-1.5 rounded-md shadow-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="찾기"
          className={`text-xs px-2 py-1 rounded border bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none w-56 ${
            error
              ? 'border-red-400 focus:ring-1 focus:ring-red-400'
              : 'border-gray-300 dark:border-gray-600 focus:ring-1 focus:ring-blue-400'
          }`}
        />
      </div>

      {toggleBtn(caseSensitive, () => setCaseSensitive(v => !v), 'Aa', '대소문자 구분')}
      {toggleBtn(wholeWord, () => setWholeWord(v => !v), 'ab', '단어 단위')}
      {toggleBtn(useRegex, () => setUseRegex(v => !v), '.*', '정규식')}

      <span className="text-xs text-gray-500 dark:text-gray-400 px-1.5 min-w-[60px] text-center select-none">
        {error ? '오류' : total === 0 ? (query ? '없음' : '0') : `${currentIdx + 1} / ${total}`}
      </span>

      <button
        onClick={goPrev}
        disabled={total === 0}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
        title="이전 (Shift+Enter)"
        tabIndex={-1}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>
      <button
        onClick={goNext}
        disabled={total === 0}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:hover:bg-transparent"
        title="다음 (Enter)"
        tabIndex={-1}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <button
        onClick={onClose}
        className="w-6 h-6 flex items-center justify-center rounded text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
        title="닫기 (Esc)"
        tabIndex={-1}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
