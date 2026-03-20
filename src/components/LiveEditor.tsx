import { useCallback, useEffect, useMemo, useRef } from 'react'
import CodeMirror, { EditorView, keymap, Prec } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { oneDark } from '@codemirror/theme-one-dark'
import { indentWithTab } from '@codemirror/commands'
import { useAppStore, type Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
  onSave: (content: string) => void
  onChange: (content: string) => void
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

export default function LiveEditor({ tab, onSave, onChange }: Props) {
  const { darkMode, fontSize } = useAppStore()
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))

  // Ctrl+S shortcut within CodeMirror
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
    ])
  ), [onSave])

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
    // 첫 편집 시 preview 탭 → 고정 탭으로 전환
    if (tab.isPreview) {
      useAppStore.getState().pinTab(tab.id)
    }
    onChange(value)
  }, [onChange, tab.isPreview, tab.id])

  return (
    <div className={`flex-1 overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
      <CodeMirror
        value={tab.content}
        height="100%"
        theme={isDark ? oneDark : 'light'}
        extensions={extensions}
        onChange={handleChange}
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
