import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@uiw/react-codemirror'
import { undo, redo, selectAll } from '@codemirror/commands'

interface Props {
  editorViewRef: React.MutableRefObject<EditorView | null>
  onTableClick: () => void
}

interface MenuItemDef {
  label: string
  shortcut?: string
  action?: () => void
  disabled?: boolean
  separator?: boolean
}

const listPrefixRegex = /^(\d+\.\s|- \[ \] |- |> |#{1,6}\s)/

export default function EditorContextMenu({ editorViewRef, onTableClick }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // ── Editor helpers ──────────────────────────────────────────────────────
  const wrap = (before: string, after: string) => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const selected = view.state.sliceDoc(from, to)
    const replacement = before + (selected || '텍스트') + after
    view.dispatch({
      changes: { from, to, insert: replacement },
      selection: { anchor: from + before.length, head: from + replacement.length - after.length },
    })
    view.focus()
  }

  const wrapLine = (prefix: string) => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const startLine = view.state.doc.lineAt(from)
    const endLine = view.state.doc.lineAt(to)
    const changes: { from: number; to: number; insert: string }[] = []
    let allHave = true
    for (let i = startLine.number; i <= endLine.number; i++) {
      if (!view.state.doc.line(i).text.startsWith(prefix)) { allHave = false; break }
    }
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = view.state.doc.line(i)
      if (line.text.trim() === '') continue
      if (allHave) {
        changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
      } else {
        const existing = line.text.match(listPrefixRegex)
        if (existing) changes.push({ from: line.from, to: line.from + existing[0].length, insert: prefix })
        else changes.push({ from: line.from, to: line.from, insert: prefix })
      }
    }
    if (changes.length > 0) view.dispatch({ changes })
    view.focus()
  }

  const wrapLineNumbered = () => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    const startLine = view.state.doc.lineAt(from)
    const endLine = view.state.doc.lineAt(to)
    const changes: { from: number; to: number; insert: string }[] = []
    let allHave = true
    for (let i = startLine.number; i <= endLine.number; i++) {
      if (!view.state.doc.line(i).text.match(/^\d+\.\s/)) { allHave = false; break }
    }
    let num = 1
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = view.state.doc.line(i)
      if (line.text.trim() === '') continue
      if (allHave) {
        const match = line.text.match(/^\d+\.\s/)
        if (match) changes.push({ from: line.from, to: line.from + match[0].length, insert: '' })
      } else {
        const prefix = `${num}. `
        const existing = line.text.match(listPrefixRegex)
        if (existing) changes.push({ from: line.from, to: line.from + existing[0].length, insert: prefix })
        else changes.push({ from: line.from, to: line.from, insert: prefix })
        num++
      }
    }
    if (changes.length > 0) view.dispatch({ changes })
    view.focus()
  }

  const insert = (text: string) => {
    const view = editorViewRef.current
    if (!view) return
    const p = view.state.selection.main.head
    view.dispatch({ changes: { from: p, insert: text }, selection: { anchor: p + text.length } })
    view.focus()
  }

  // ── Clipboard / history actions ─────────────────────────────────────────
  const runCopy = async () => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    try { await navigator.clipboard.writeText(view.state.sliceDoc(from, to)) } catch {}
    view.focus()
  }

  const runCut = async () => {
    const view = editorViewRef.current
    if (!view) return
    const { from, to } = view.state.selection.main
    if (from === to) return
    try { await navigator.clipboard.writeText(view.state.sliceDoc(from, to)) } catch {}
    view.dispatch({ changes: { from, to, insert: '' }, selection: { anchor: from } })
    view.focus()
  }

  const runPaste = async () => {
    const view = editorViewRef.current
    if (!view) return
    let text = ''
    try { text = await navigator.clipboard.readText() } catch { return }
    if (!text) return
    const { from, to } = view.state.selection.main
    view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } })
    view.focus()
  }

  const runSelectAll = () => {
    const view = editorViewRef.current
    if (!view) return
    selectAll(view)
    view.focus()
  }

  const runUndo = () => { const v = editorViewRef.current; if (v) { undo(v); v.focus() } }
  const runRedo = () => { const v = editorViewRef.current; if (v) { redo(v); v.focus() } }

  // ── Open on contextmenu ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const view = editorViewRef.current
      if (!view) return
      if (!view.dom.contains(e.target as Node)) return
      e.preventDefault()
      const MENU_W = 240
      const MENU_H = 560
      const x = Math.min(e.clientX, window.innerWidth - MENU_W - 8)
      const y = Math.min(e.clientY, window.innerHeight - MENU_H - 8)
      setPos({ x: Math.max(0, x), y: Math.max(0, y) })
    }
    document.addEventListener('contextmenu', handler)
    return () => document.removeEventListener('contextmenu', handler)
  }, [editorViewRef])

  // ── Close on outside click / Escape ─────────────────────────────────────
  useEffect(() => {
    if (!pos) return
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setPos(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', close)
      document.addEventListener('keydown', onKey)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [pos])

  if (!pos) return null

  const hasSelection = (() => {
    const v = editorViewRef.current
    if (!v) return false
    const { from, to } = v.state.selection.main
    return from !== to
  })()

  const close = () => setPos(null)
  const run = (fn: () => void) => () => { fn(); close() }

  const items: MenuItemDef[] = [
    { label: '실행 취소', shortcut: 'Ctrl+Z', action: run(runUndo) },
    { label: '다시 실행', shortcut: 'Ctrl+Y', action: run(runRedo) },
    { separator: true, label: '' },
    { label: '잘라내기', shortcut: 'Ctrl+X', action: run(runCut), disabled: !hasSelection },
    { label: '복사', shortcut: 'Ctrl+C', action: run(runCopy), disabled: !hasSelection },
    { label: '붙여넣기', shortcut: 'Ctrl+V', action: run(runPaste) },
    { label: '모두 선택', shortcut: 'Ctrl+A', action: run(runSelectAll) },
    { separator: true, label: '' },
    { label: '굵게', shortcut: 'Ctrl+B', action: run(() => wrap('**', '**')) },
    { label: '기울임', shortcut: 'Ctrl+I', action: run(() => wrap('*', '*')) },
    { label: '취소선', shortcut: 'Ctrl+Shift+S', action: run(() => wrap('~~', '~~')) },
    { label: '형광펜', shortcut: 'Ctrl+Shift+H', action: run(() => wrap('==', '==')) },
    { label: '인라인 코드', shortcut: 'Ctrl+E', action: run(() => wrap('`', '`')) },
    { label: '링크', shortcut: 'Ctrl+K', action: run(() => wrap('[', '](url)')) },
    { separator: true, label: '' },
    { label: '제목 1 (H1)', shortcut: 'Ctrl+1', action: run(() => wrapLine('# ')) },
    { label: '제목 2 (H2)', shortcut: 'Ctrl+2', action: run(() => wrapLine('## ')) },
    { label: '제목 3 (H3)', shortcut: 'Ctrl+3', action: run(() => wrapLine('### ')) },
    { label: '제목 4 (H4)', action: run(() => wrapLine('#### ')) },
    { label: '제목 5 (H5)', action: run(() => wrapLine('##### ')) },
    { label: '제목 6 (H6)', action: run(() => wrapLine('###### ')) },
    { separator: true, label: '' },
    { label: '목록', shortcut: 'Ctrl+Shift+8', action: run(() => wrapLine('- ')) },
    { label: '번호 목록', shortcut: 'Ctrl+Shift+7', action: run(wrapLineNumbered) },
    { label: '체크리스트', shortcut: 'Ctrl+Shift+9', action: run(() => wrapLine('- [ ] ')) },
    { label: '인용', shortcut: 'Ctrl+Shift+Q', action: run(() => wrapLine('> ')) },
    { separator: true, label: '' },
    { label: '코드 블록', shortcut: 'Ctrl+Shift+E', action: run(() => insert('\n```\n코드\n```\n')) },
    { label: '이미지', shortcut: 'Ctrl+Shift+I', action: run(() => insert('![설명](images/)')) },
    { label: '표 삽입…', action: run(onTableClick) },
    { label: '구분선', action: run(() => insert('\n---\n')) },
    { label: '접기/펼치기', action: run(() => insert('\n<details>\n<summary>제목</summary>\n\n내용\n\n</details>\n')) },
    { label: '각주', action: run(() => insert('[^1]\n\n[^1]: 각주 내용')) },
  ]

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] min-w-[220px] py-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-2xl text-xs text-gray-700 dark:text-gray-200 select-none"
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it, i) =>
        it.separator ? (
          <div key={`sep-${i}`} className="my-1 border-t border-gray-200 dark:border-gray-700" />
        ) : (
          <button
            key={`${it.label}-${i}`}
            disabled={it.disabled}
            onClick={it.action}
            className={`w-full flex items-center justify-between px-3 py-1.5 text-left ${
              it.disabled
                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed'
                : 'hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:text-blue-700 dark:hover:text-blue-300'
            }`}
          >
            <span>{it.label}</span>
            {it.shortcut && (
              <span className="ml-4 text-[10px] text-gray-400 dark:text-gray-500">{it.shortcut}</span>
            )}
          </button>
        )
      )}
    </div>
  )
}
