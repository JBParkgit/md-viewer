import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import CodeMirror, { EditorView, keymap, Prec, type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentWithTab } from '@codemirror/commands'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// ── VSCode-like markdown syntax highlighting ─────────────────────────────
// Light palette roughly follows GitHub Primer Light.
const mdHighlightLight = HighlightStyle.define([
  // Headings — blue + bold (VSCode keeps same font size in editor)
  { tag: t.heading1, color: '#0550ae', fontWeight: '700' },
  { tag: t.heading2, color: '#0550ae', fontWeight: '700' },
  { tag: t.heading3, color: '#0550ae', fontWeight: '700' },
  { tag: t.heading4, color: '#0550ae', fontWeight: '700' },
  { tag: t.heading5, color: '#0550ae', fontWeight: '700' },
  { tag: t.heading6, color: '#0550ae', fontWeight: '700' },

  // Emphasis
  { tag: t.strong, color: '#cf222e', fontWeight: '700' },
  { tag: t.emphasis, color: '#953800', fontStyle: 'italic' },
  { tag: t.strikethrough, color: '#6e7781', textDecoration: 'line-through' },

  // Links — keep `textDecoration: none` so YAML frontmatter arrays
  // (misparsed as link refs by the markdown grammar) don't get underlined.
  { tag: t.link, color: '#0969da', textDecoration: 'none' },
  { tag: t.url, color: '#0969da', textDecoration: 'underline' },

  // Inline code / code fences
  { tag: t.monospace, color: '#116329', backgroundColor: 'rgba(175,184,193,0.2)' },

  // Quote
  { tag: t.quote, color: '#6e7781', fontStyle: 'italic' },

  // Horizontal rule
  { tag: t.contentSeparator, color: '#8250df', fontWeight: '700' },

  // Markup punctuation — headings `#`, emphasis `*`, code `` ` ``,
  // quote `>`, list `-`, link brackets `[](...)`. All muted gray.
  { tag: t.processingInstruction, color: '#8c959f' },
  { tag: t.meta, color: '#8c959f' },
  { tag: t.labelName, color: '#8250df' },

  // Escape chars (\*, \_, etc.)
  { tag: t.escape, color: '#0550ae' },

  // HTML-ish tags inside markdown (<details>, <summary>, etc.)
  { tag: t.tagName, color: '#116329' },
  { tag: t.attributeName, color: '#8250df' },
  { tag: t.attributeValue, color: '#0a3069' },
])

// Dark palette roughly follows GitHub Primer Dark. Layered on top of the
// oneDark base theme — oneDark handles chrome (bg, selection, caret) while
// this layer owns markdown-specific token colors.
const mdHighlightDark = HighlightStyle.define([
  { tag: t.heading1, color: '#79c0ff', fontWeight: '700' },
  { tag: t.heading2, color: '#79c0ff', fontWeight: '700' },
  { tag: t.heading3, color: '#79c0ff', fontWeight: '700' },
  { tag: t.heading4, color: '#79c0ff', fontWeight: '700' },
  { tag: t.heading5, color: '#79c0ff', fontWeight: '700' },
  { tag: t.heading6, color: '#79c0ff', fontWeight: '700' },

  { tag: t.strong, color: '#ff7b72', fontWeight: '700' },
  { tag: t.emphasis, color: '#ffa657', fontStyle: 'italic' },
  { tag: t.strikethrough, color: '#8b949e', textDecoration: 'line-through' },

  { tag: t.link, color: '#58a6ff', textDecoration: 'none' },
  { tag: t.url, color: '#58a6ff', textDecoration: 'underline' },

  { tag: t.monospace, color: '#a5d6ff', backgroundColor: 'rgba(110,118,129,0.4)' },

  { tag: t.quote, color: '#8b949e', fontStyle: 'italic' },

  { tag: t.contentSeparator, color: '#d2a8ff', fontWeight: '700' },

  { tag: t.processingInstruction, color: '#6e7681' },
  { tag: t.meta, color: '#6e7681' },
  { tag: t.labelName, color: '#d2a8ff' },

  { tag: t.escape, color: '#79c0ff' },

  { tag: t.tagName, color: '#7ee787' },
  { tag: t.attributeName, color: '#d2a8ff' },
  { tag: t.attributeValue, color: '#a5d6ff' },
])
import { useAppStore, type Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
  onSave: (content: string) => void
  onChange: (content: string) => void
  editorViewRef?: MutableRefObject<EditorView | null>
  onScroll?: () => void
  onCursorLine?: (line: number) => void
  mdFiles?: { name: string; path: string }[]
}

// Light theme for CodeMirror
const lightTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: 'var(--md-font-size)',
    fontFamily: "var(--md-font-family)",
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
    fontFamily: "var(--md-font-family)",
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '1.5rem 2rem',
    maxWidth: '800px',
    margin: '0 auto',
    caretColor: '#60a5fa',
    lineHeight: '1.8',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(96, 165, 250, 0.25) !important',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: '#60a5fa',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: '#60a5fa',
  },
}, { dark: true })

export default function LiveEditor({ tab, onSave, onChange, editorViewRef, onScroll, onCursorLine, mdFiles = [] }: Props) {
  const { darkMode, fontSize, projects, spellcheckEnabled } = useAppStore()
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))
  const cmRef = useRef<ReactCodeMirrorRef>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mdFilesRef = useRef(mdFiles)
  mdFilesRef.current = mdFiles

  // CodeMirror's cursor layer uses a CSS animation that can get stuck in
  // the "off" frame after the window loses and regains focus (alt-tab,
  // workspace switch, devtools open). Restart the animation and force a
  // re-measure so the caret reappears.
  useEffect(() => {
    const restoreCursor = () => {
      const view = cmRef.current?.view
      if (!view || !view.hasFocus) return
      const layer = view.dom.querySelector('.cm-cursorLayer') as HTMLElement | null
      if (layer) {
        const prev = layer.style.animationName
        layer.style.animationName = 'none'
        void layer.offsetWidth
        layer.style.animationName = prev || ''
      }
      view.requestMeasure()
    }
    window.addEventListener('focus', restoreCursor)
    document.addEventListener('visibilitychange', restoreCursor)
    return () => {
      window.removeEventListener('focus', restoreCursor)
      document.removeEventListener('visibilitychange', restoreCursor)
    }
  }, [])

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
      { key: 'Mod-Shift-8', run: (view) => toggleLinePrefix(view, '- ') },
      { key: 'Mod-Shift-7', run: (view) => toggleLinePrefix(view, '1. ') },
      { key: 'Mod-Shift-9', run: (view) => toggleLinePrefix(view, '- [ ] ') },
      { key: 'Mod-Shift-q', run: (view) => toggleLinePrefix(view, '> ') },
      { key: 'Mod-Shift-h', run: (view) => wrapSelection(view, '==', '==') },
      { key: 'Mod-Shift-e', run: (view) => {
        const { from, to } = view.state.selection.main
        if (from === to) {
          const text = '\n```\n\n```\n'
          view.dispatch({ changes: { from, insert: text }, selection: { anchor: from + 5 } })
        } else {
          const selected = view.state.sliceDoc(from, to)
          const needLead = from > 0 && view.state.doc.sliceString(from - 1, from) !== '\n'
          const needTrail = to < view.state.doc.length && view.state.doc.sliceString(to, to + 1) !== '\n'
          const prefix = (needLead ? '\n' : '') + '```\n'
          const suffix = (selected.endsWith('\n') ? '' : '\n') + '```' + (needTrail ? '\n' : '')
          const replacement = prefix + selected + suffix
          view.dispatch({
            changes: { from, to, insert: replacement },
            selection: { anchor: from + prefix.length, head: from + prefix.length + selected.length },
          })
        }
        return true
      } },
      { key: 'Mod-Shift-i', run: (view) => { const pos = view.state.selection.main.head; view.dispatch({ changes: { from: pos, insert: '![설명](images/)' }, selection: { anchor: pos + 10 } }); return true } },
    ])
  ), [onSave, wrapSelection, toggleLinePrefix])

  // Find project root for current file (case/separator-insensitive on Windows)
  const getProjectRoot = useCallback(() => {
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()
    const file = norm(tab.filePath)
    for (const p of projects) {
      const root = norm(p.path)
      if (file === root || file.startsWith(root + '/')) return p.path
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
      const hasTreePath = dt.types.includes('application/x-filepath') || dt.types.includes('application/x-filepaths')
      if (hasFiles || hasTreePath) {
        e.preventDefault()
        e.stopPropagation()
        dt.dropEffect = hasTreePath ? 'copy' : 'copy'
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

      // ── Helper: build markdown text for a single file path ──
      const filePathToMarkdown = (fp: string): string => {
        const fileName = fp.replace(/\\/g, '/').split('/').pop() || ''
        const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
        if (IMAGE_DROP_EXTS.includes(ext)) {
          return `![${fileName}](${computeRelativePath(fp)})`
        }
        if (ext === 'md') {
          return `[[${fileName.replace(/\.md$/i, '')}]]`
        }
        return `[${fileName}](${computeRelativePath(fp)})`
      }

      // ── Tree drag (application/x-filepaths or application/x-filepath) ──
      const multiData = dt.getData('application/x-filepaths')
      const treePaths: string[] = multiData ? (() => { try { return JSON.parse(multiData) } catch { return [] } })() : []
      const singleTreePath = dt.getData('application/x-filepath')
      if (treePaths.length === 0 && singleTreePath) treePaths.push(singleTreePath)

      if (treePaths.length > 0) {
        const insertions = treePaths.map(fp => filePathToMarkdown(fp))
        const text = insertions.join('\n') + '\n'
        v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
        return
      }

      // ── OS file drag ──
      const files = Array.from(dt.files)
      if (files.length === 0) return

      const projectRoot = getProjectRootRef.current()
      const imageFiles = files.filter(f => IMAGE_DROP_EXTS.includes(f.name.split('.').pop()?.toLowerCase() ?? ''))
      const otherFiles = files.filter(f => !IMAGE_DROP_EXTS.includes(f.name.split('.').pop()?.toLowerCase() ?? ''))

      ;(async () => {
        const insertions: string[] = []

        // Images: copy to images/ and insert
        for (const file of imageFiles) {
          const filePath = window.electronAPI.getPathForFile(file)
          if (!filePath) continue
          const result = await window.electronAPI.copyImageToDir(filePath, projectRoot)
          if (result.success && result.fileName) {
            const relPath = computeRelativePath(projectRoot.replace(/\\/g, '/') + '/images/' + result.fileName)
            insertions.push(`![${result.fileName}](${relPath})`)
          }
        }

        // Other files: insert as links in-place
        for (const file of otherFiles) {
          const filePath = window.electronAPI.getPathForFile(file)
          if (!filePath) continue
          const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
          if (ext === 'md') {
            insertions.push(`[[${file.name.replace(/\.md$/i, '')}]]`)
          } else {
            insertions.push(`[${file.name}](${computeRelativePath(filePath)})`)
          }
        }

        if (insertions.length > 0) {
          const text = insertions.join('\n') + '\n'
          v.dispatch({ changes: { from: pos, insert: text }, selection: { anchor: pos + text.length } })
        }
      })()
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

  // Normalize whitespace from clipboard pastes. This handles two common cases:
  //   1) Pastes from rich-text sources (ChatGPT, Gemini, web pages) often contain
  //      3+ consecutive newlines and trailing spaces from HTML→text conversion.
  //      We collapse those into clean paragraph breaks.
  //   2) Pastes from plain text sources sometimes use only single newlines,
  //      which markdown ignores. We promote them to double newlines so paragraph
  //      breaks render correctly.
  const pasteHandler = useMemo(() => EditorView.clipboardInputFilter.of((raw) => {
    let text = raw
    // Normalize line endings
    text = text.replace(/\r\n?/g, '\n')
    // Strip trailing whitespace before each newline
    text = text.replace(/[ \t]+\n/g, '\n')
    // Collapse 3+ consecutive newlines into a paragraph break (\n\n)
    text = text.replace(/\n{3,}/g, '\n\n')
    // Trim leading/trailing blank lines from the pasted block
    text = text.replace(/^\n+|\n+$/g, '')
    // If the pasted text has no paragraph breaks at all but does have single
    // newlines, promote them so markdown paragraphs render correctly.
    if (!text.includes('\n\n') && text.includes('\n')) {
      text = text.replace(/\n/g, '\n\n')
    }
    return text
  }), [])

  const wikiLinkCompletion = useMemo(() =>
    autocompletion({
      override: [(context: CompletionContext) => {
        const word = context.matchBefore(/\[\[[^\]]*/u)
        if (!word) return null
        const typed = word.text.slice(2)
        const files = mdFilesRef.current
        if (files.length === 0) return null
        const options = files
          .map(f => {
            const label = f.name.replace(/\.md$/i, '')
            return { label, apply: label + ']]', type: 'file' as const }
          })
          .filter(o => o.label.toLowerCase().includes(typed.toLowerCase()))
        if (options.length === 0) return null
        return { from: word.from + 2, options }
      }],
      defaultKeymap: true,
    })
  , [])

  const onCursorLineRef = useRef(onCursorLine)
  onCursorLineRef.current = onCursorLine

  const cursorLineListener = useMemo(() =>
    EditorView.updateListener.of((update) => {
      if (update.selectionSet && onCursorLineRef.current) {
        const line = update.state.doc.lineAt(update.state.selection.main.head).number
        onCursorLineRef.current(line)
      }
    }), [])

  const extensions = useMemo(() => [
    markdown({
      base: markdownLanguage,
      codeLanguages: languages,
    }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: spellcheckEnabled ? 'true' : 'false' }),
    syntaxHighlighting(isDark ? mdHighlightDark : mdHighlightLight),
    keymap.of([indentWithTab]),
    saveKeymap,
    pasteHandler,
    wikiLinkCompletion,
    cursorLineListener,
    isDark ? darkTheme : lightTheme,
  ], [isDark, saveKeymap, pasteHandler, wikiLinkCompletion, spellcheckEnabled, cursorLineListener])

  const handleChange = useCallback((value: string) => {
    if (tab.isPreview) {
      useAppStore.getState().pinTab(tab.id)
    }
    onChange(value)
  }, [onChange, tab.isPreview, tab.id])

  const handleCreateEditor = useCallback((view: EditorView) => {
    if (editorViewRef) editorViewRef.current = view
    attachDropListeners(view)
    // Scroll sync
    if (onScroll) {
      view.scrollDOM.addEventListener('scroll', onScroll)
    }
    // Keyboard shortcuts via DOM (CodeMirror keymap may not catch number keys)
    view.dom.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); toggleLinePrefix(view, '# ') }
        else if (e.key === '2') { e.preventDefault(); toggleLinePrefix(view, '## ') }
        else if (e.key === '3') { e.preventDefault(); toggleLinePrefix(view, '### ') }
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey) {
        if (e.key === '*' || e.key === '8') { e.preventDefault(); toggleLinePrefix(view, '- ') }
        else if (e.key === '&' || e.key === '7') { e.preventDefault(); toggleLinePrefix(view, '1. ') }
        else if (e.key === '(' || e.key === '9') { e.preventDefault(); toggleLinePrefix(view, '- [ ] ') }
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
          // All of these add per-cursor-move / per-edit decoration or
          // input-handler work and aren't critical for markdown prose,
          // so they're off to free up frame budget during fast scroll.
          allowMultipleSelections: false,
          indentOnInput: false,
          bracketMatching: false,
          rectangularSelection: false,
          highlightActiveLine: false,
          highlightSelectionMatches: false,
          syntaxHighlighting: true,
          closeBrackets: true,
          autocompletion: false, // handled by wikiLinkCompletion extension
          crosshairCursor: false,
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
