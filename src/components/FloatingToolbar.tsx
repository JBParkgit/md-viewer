import { useEffect, useState, useRef, useCallback } from 'react'
import type { EditorView } from '@uiw/react-codemirror'

interface Props {
  editorViewRef: React.MutableRefObject<EditorView | null>
}

export default function FloatingToolbar({ editorViewRef }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [visible, setVisible] = useState(false)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()

  const updatePosition = useCallback(() => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) { setVisible(false); return }

    // Get coordinates of the selection
    const start = view.coordsAtPos(from)
    const end = view.coordsAtPos(to)
    if (!start || !end) { setVisible(false); return }

    // Position above the selection, centered
    const x = (start.left + end.left) / 2
    const y = Math.min(start.top, end.top) - 8
    setPos({ x, y })
    setVisible(true)
  }, [editorViewRef])

  useEffect(() => {
    const check = () => {
      clearTimeout(hideTimer.current)
      hideTimer.current = setTimeout(updatePosition, 150)
    }

    // Listen for mouseup (selection complete) and keyup (shift+arrow selection)
    document.addEventListener('mouseup', check)
    document.addEventListener('keyup', check)
    return () => {
      document.removeEventListener('mouseup', check)
      document.removeEventListener('keyup', check)
      clearTimeout(hideTimer.current)
    }
  }, [updatePosition])

  // Hide when clicking outside
  useEffect(() => {
    if (!visible) return
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setVisible(false)
      }
    }
    // Delay to avoid catching the same mousedown that triggered selection
    const timer = setTimeout(() => document.addEventListener('mousedown', handleMouseDown), 50)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleMouseDown) }
  }, [visible])

  const wrap = (before: string, after: string) => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    const selected = view.state.sliceDoc(from, to)
    // Check if already wrapped — toggle off
    const alreadyWrapped = selected.startsWith(before) && selected.endsWith(after)
    if (alreadyWrapped) {
      const unwrapped = selected.slice(before.length, -after.length)
      view.dispatch({ changes: { from, to, insert: unwrapped }, selection: { anchor: from, head: from + unwrapped.length } })
    } else {
      const wrapped = before + selected + after
      view.dispatch({ changes: { from, to, insert: wrapped }, selection: { anchor: from + before.length, head: from + wrapped.length - after.length } })
    }
    view.focus()
  }

  const wrapLine = (prefix: string) => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    // Apply to all lines in selection
    const startLine = view.state.doc.lineAt(from)
    const endLine = view.state.doc.lineAt(to)
    const changes: { from: number; to: number; insert: string }[] = []
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = view.state.doc.line(i)
      if (line.text.startsWith(prefix)) {
        // Same prefix: toggle off
        changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
      } else {
        // Replace existing heading prefix if any
        const headingMatch = line.text.match(/^#{1,6}\s/)
        if (headingMatch) {
          changes.push({ from: line.from, to: line.from + headingMatch[0].length, insert: prefix })
          continue
        }
        changes.push({ from: line.from, to: line.from, insert: prefix })
      }
    }
    view.dispatch({ changes })
    view.focus()
  }

  if (!visible || !pos) return null

  const btnCls = "w-7 h-7 flex items-center justify-center rounded hover:bg-gray-600 text-gray-300 hover:text-white transition-colors"
  const sepCls = "w-px h-4 bg-gray-600 mx-0.5"

  return (
    <div
      ref={toolbarRef}
      className="fixed z-50 flex items-center gap-0.5 px-1.5 py-1 bg-gray-800 rounded-lg shadow-xl border border-gray-700"
      style={{
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -100%)',
      }}
      onMouseDown={e => e.preventDefault()}
    >
      {/* Inline formatting */}
      <button onClick={() => wrap('**', '**')} className={btnCls} title="굵게">
        <span className="text-xs font-bold">B</span>
      </button>
      <button onClick={() => wrap('*', '*')} className={btnCls} title="기울임">
        <span className="text-xs italic">I</span>
      </button>
      <button onClick={() => wrap('~~', '~~')} className={btnCls} title="취소선">
        <span className="text-xs line-through">S</span>
      </button>
      <button onClick={() => wrap('`', '`')} className={btnCls} title="인라인 코드">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
      </button>
      <button onClick={() => wrap('[', '](url)')} className={btnCls} title="링크">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      </button>
      <div className={sepCls} />

      {/* Block formatting */}
      <button onClick={() => wrapLine('# ')} className={btnCls} title="제목 1">
        <span className="text-[10px] font-bold">H1</span>
      </button>
      <button onClick={() => wrapLine('## ')} className={btnCls} title="제목 2">
        <span className="text-[10px] font-bold">H2</span>
      </button>
      <button onClick={() => wrapLine('### ')} className={btnCls} title="제목 3">
        <span className="text-[10px] font-bold">H3</span>
      </button>
      <div className={sepCls} />
      <button onClick={() => wrapLine('- ')} className={btnCls} title="목록">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <button onClick={() => wrapLine('> ')} className={btnCls} title="인용">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
      </button>
    </div>
  )
}
