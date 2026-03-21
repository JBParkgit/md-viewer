import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import CodeMirror, { EditorView, keymap, Prec, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentWithTab } from '@codemirror/commands'
import { useAppStore, type Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
  onSave: (content: string) => void
  onChange: (content: string) => void
  editorViewRef?: MutableRefObject<EditorView | null>
}

// Light theme for CodeMirror
const lightTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--md-font-size)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '1.5rem 2rem',
    maxWidth: '800px',
    margin: '0 auto',
    caretColor: '#2563eb',
    lineHeight: '1.8',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-focused': {
    outline: 'none',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(59, 130, 246, 0.04)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(59, 130, 246, 0.2) !important',
  },
  '.cm-cursor': {
    borderLeftColor: '#2563eb',
    borderLeftWidth: '2px',
  },
})

// Dark theme override
const darkTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--md-font-size)',
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '1.5rem 2rem',
    maxWidth: '800px',
    margin: '0 auto',
    lineHeight: '1.8',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
}, { dark: true })

export default function LiveEditor({ tab, onSave, onChange, editorViewRef }: Props) {
  const { darkMode, fontSize, projects } = useAppStore()
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Helper: wrap selection with inline markers ─────────────────────────
  const wrapSelection = useCallback((view: EditorView, before: string, after: string) => {
    const { from, to } = view.state.selection.main
    if (from === to) {
      // No selection: insert markers with placeholder
      const text = before + '텍스트' + after
      view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + before.length, head: from + text.length - after.length } })
    } else {
      const selected = view.state.sliceDoc(from, to)
      const alreadyWrapped = selected.startsWith(before) && selected.endsWith(after)
      if (alreadyWrapped) {
        const unwrapped = selected.slice(before.length, -after.length)
        view.dispatch({ changes: { from, to, insert: unwrapped }, selection: { anchor: from, head: from + unwrapped.length } })
      } else {
        const wrapped = before + selected + after
        view.dispatch({ changes: { from, to, insert: wrapped }, selection: { anchor: from + before.length, head: from + wrapped.length - after.length } })
      }
    }
    return true
  }, [])

  // ── Helper: toggle line prefix ────────────────────────────────────────
  const listPrefixRegex = /^(\d+\.\s|- \[ \] |- |- |> |#{1,6}\s)/
  const toggleLinePrefix = useCallback((view: EditorView, prefix: string) => {
    const { from, to } = view.state.selection.main
    const startLine = view.state.doc.lineAt(from)
    const endLine = view.state.doc.lineAt(to)
    const changes: { from: number; to: number; insert: string }[] = []
    const isNumbered = prefix === '1. '
    // Check if all lines already have the prefix
    let allHave = true
    for (let i = startLine.number; i <= endLine.number; i++) {
      const text = view.state.doc.line(i).text
      if (text.trim() === '') continue
      if (isNumbered ? !text.match(/^\d+\.\s/) : !text.startsWith(prefix)) { allHave = false; break }
    }
    let num = 1
    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = view.state.doc.line(i)
      if (line.text.trim() === '') continue
      if (allHave) {
        if (isNumbered) {
          const match = line.text.match(/^\d+\.\s/)
          if (match) changes.push({ from: line.from, to: line.from + match[0].length, insert: '' })
        } else {
          changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
        }
      } else {
        const actualPrefix = isNumbered ? `${num}. ` : prefix
        const existingMatch = line.text.match(listPrefixRegex)
        if (existingMatch) {
          changes.push({ from: line.from, to: line.from + existingMatch[0].length, insert: actualPrefix })
        } else {
          changes.push({ from: line.from, to: line.from, insert: actualPrefix })
        }
        if (isNumbered) num++
      }
    }
    if (changes.length > 0) view.dispatch({ changes })
    return true
  }, [])

  // Ctrl+S and markdown formatting shortcuts
  const saveKeymap = useMemo(() => Prec.highest(
    keymap.of([
      {
        key: 'Mod-s',
        run: (view) => {
          const content = view.state.doc.toString()
          onSave(content)
          return true
        },
      },
      { key: 'Mod-b', run: (view) => wrapSelection(view, '**', '**') },
      { key: 'Mod-i', run: (view) => wrapSelection(view, '*', '*') },
      { key: 'Mod-Shift-s', run: (view) => wrapSelection(view, '~~', '~~') },
      { key: 'Mod-e', run: (view) => wrapSelection(view, '`', '`') },
      { key: 'Mod-k', run: (view) => wrapSelection(view, '[', '](url)') },
      { key: 'Ctrl-1', run: (view) => toggleLinePrefix(view, '# '), preventDefault: true },
      { key: 'Ctrl-2', run: (view) => toggleLinePrefix(view, '## '), preventDefault: true },
      { key: 'Ctrl-3', run: (view) => toggleLinePrefix(view, '### '), preventDefault: true },
    ])
  ), [onSave, wrapSelection, toggleLinePrefix])

  // Find project root for current file
  const getProjectRoot = useCallback(() => {
    for (const p of projects) {
      if (tab.filePath.startsWith(p.path)) return p.path
    }
    const sep = tab.filePath.includes('/') ? '/' : '\\'
    return tab.filePath.split(sep).slice(0, -1).join(sep)
  }, [projects, tab.filePath])

  const IMAGE_DROP_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']

  // Refs to keep callbacks current without re-attaching listeners
  const getProjectRootRef = useRef(getProjectRoot)
  getProjectRootRef.current = getProjectRoot
  const tabFilePathRef = useRef(tab.filePath)
  tabFilePathRef.current = tab.filePath

  // Attach drop/dragover listeners to CodeMirror's actual DOM element
  const dropElRef = useRef<HTMLElement | null>(null)
  const dragOverHandler = useRef<((e: DragEvent) => void) | null>(null)
  const dropHandlerFn = useRef<((e: DragEvent) => void) | null>(null)

  // Called when CodeMirror editor view is created
  const attachDropListeners = useCallback((view: EditorView) => {
    // Clean up previous
    if (dropElRef.current && dragOverHandler.current && dropHandlerFn.current) {
      dropElRef.current.removeEventListener('dragover', dragOverHandler.current, true)
      dropElRef.current.removeEventListener('drop', dropHandlerFn.current, true)
    }

    const el = view.dom
    dropElRef.current = el

    const handleDragOver = (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return
      const hasFiles = dt.types.includes('Files')
      const hasTreePath = dt.types.includes('application/x-filepath')
      if (hasFiles || hasTreePath) {
        e.preventDefault()
        e.stopPropagation()
        dt.dropEffect = hasTreePath ? 'move' : 'copy'
      }
    }

    // Helper: compute relative path from md file to image
    const computeRelativePath = (imgPath: string) => {
      const mdDir = tabFilePathRef.current.replace(/\\/g, '/').split('/').slice(0, -1).join('/')
      const imgNorm = imgPath.replace(/\\/g, '/')
      const fromParts = mdDir.split('/')
      const toParts = imgNorm.split('/')
      let common = 0
      while (common < fromParts.length && common < toParts.length && fromParts[common] === toParts[common]) common++
      if (common === 0) {
        // No common root (different drive) — use file:/// URL
        return 'file:///' + imgNorm
      }
      const ups = fromParts.length - common
      return (ups > 0 ? '../'.repeat(ups) : './') + toParts.slice(common).join('/')
    }

    const handleDrop = (e: DragEvent) => {
      const dt = e.dataTransfer
      if (!dt) return
      const v = editorViewRef?.current ?? cmRef.current?.view
      if (!v) return

      e.preventDefault()
      e.stopPropagation()

      const pos = v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.selection.main.head

      // ── Tree drag (application/x-filepath) ──
      const treePath = dt.getData('application/x-filepath')
      if (treePath) {
        const ext = treePath.split('.').pop()?.toLowerCase() ?? ''
        if (IMAGE_DROP_EXTS.includes(ext)) {
          const fileName = treePath.replace(/\\/g, '/').split('/').pop() || ''
          const relativePath = computeRelativePath(treePath)
          const text = `![${fileName}](${relativePath})\n`
          v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
        }
        return
      }

      // ── OS file drag ──
      const files = Array.from(dt.files)
      const imageFiles = files.filter(f => {
        const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
        return IMAGE_DROP_EXTS.includes(ext)
      })
      if (imageFiles.length > 0) {
        const projectRoot = getProjectRootRef.current()
        ;(async () => {
          const insertions: string[] = []
          for (const file of imageFiles) {
            const filePath = window.electronAPI.getPathForFile(file)
            if (!filePath) continue
            const result = await window.electronAPI.copyImageToDir(filePath, projectRoot)
            if (result.success && result.fileName) {
              const relPath = computeRelativePath(projectRoot.replace(/\\/g, '/') + '/images/' + result.fileName)
              insertions.push(`![${result.fileName}](${relPath})`)
            }
          }
          if (insertions.length > 0) {
            const text = insertions.join('\n') + '\n'
            v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
          }
        })()
      }
    }

    dragOverHandler.current = handleDragOver
    dropHandlerFn.current = handleDrop
    el.addEventListener('dragover', handleDragOver, true)
    el.addEventListener('drop', handleDrop, true)
  }, [editorViewRef])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dropElRef.current && dragOverHandler.current && dropHandlerFn.current) {
        dropElRef.current.removeEventListener('dragover', dragOverHandler.current, true)
        dropElRef.current.removeEventListener('drop', dropHandlerFn.current, true)
      }
    }
  }, [])

  const extensions = useMemo(() => [
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    }),
    EditorView.lineWrapping,
    keymap.of([indentWithTab]),
    saveKeymap,
    isDark ? darkTheme : lightTheme,
  ], [isDark, saveKeymap])

  const handleChange = useCallback((value: string) => {
    if (tab.isPreview) {
      useAppStore.getState().pinTab(tab.id)
    }
    onChange(value)
  }, [onChange, tab.isPreview, tab.id])

  const handleCreateEditor = useCallback((view: EditorView) => {
    if (editorViewRef) editorViewRef.current = view
    attachDropListeners(view)
    // Ctrl+1/2/3 heading shortcuts via DOM (CodeMirror keymap may not catch number keys)
    view.dom.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); toggleLinePrefix(view, '# ') }
        else if (e.key === '2') { e.preventDefault(); toggleLinePrefix(view, '## ') }
        else if (e.key === '3') { e.preventDefault(); toggleLinePrefix(view, '### ') }
      }
    })
  }, [editorViewRef, attachDropListeners, toggleLinePrefix])


  return (
    <div
      ref={containerRef}
      className={`flex-1 overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}
    >
      <CodeMirror
        ref={cmRef}
        value={tab.content}
        height="100%"
        theme={isDark ? oneDark : 'light'}
        extensions={extensions}
        onChange={handleChange}
        onCreateEditor={handleCreateEditor}
        basicSetup={{
          lineNumbers: false,
          foldGutter: false,
          dropCursor: true,
          allowMultipleSelections: true,
          indentOnInput: true,
          syntaxHighlighting: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightActiveLine: true,
          highlightSelectionMatches: true,
          closeBracketsKeymap: true,
          searchKeymap: true,
          historyKeymap: true,
          foldKeymap: false,
          completionKeymap: false,
          lintKeymap: false,
        }}
        style={{ height: '100%' }}
      />
    </div>
  )
}
