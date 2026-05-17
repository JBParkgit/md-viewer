import { useState, useEffect, useRef, useCallback } from 'react'
import type { Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
}

type Mode = 'rendered' | 'source'

// Subset of Electron's WebviewTag we use.
interface WebviewElement extends HTMLElement {
  src: string
  canGoBack(): boolean
  canGoForward(): boolean
  goBack(): void
  goForward(): void
  reload(): void
}

function toFileUrl(filePath: string) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

export default function HtmlViewer({ tab }: Props) {
  const [mode, setMode] = useState<Mode>('rendered')
  const [source, setSource] = useState<string>(tab.content)
  const [canBack, setCanBack] = useState(false)
  const [canForward, setCanForward] = useState(false)

  const wvRef = useRef<WebviewElement | null>(null)

  useEffect(() => {
    setSource(tab.content)
  }, [tab.filePath, tab.content])

  const updateNav = useCallback(() => {
    const wv = wvRef.current
    if (!wv) return
    try {
      setCanBack(wv.canGoBack())
      setCanForward(wv.canGoForward())
    } catch {
      /* not ready yet */
    }
  }, [])

  // Electron exposes navigation over IPC, so this works across the
  // out-of-process guest where iframe access was blocked.
  useEffect(() => {
    const wv = wvRef.current
    if (!wv) return
    const onNav = () => updateNav()
    wv.addEventListener('dom-ready', onNav)
    wv.addEventListener('did-navigate', onNav)
    wv.addEventListener('did-navigate-in-page', onNav) // #anchor / pushState
    return () => {
      wv.removeEventListener('dom-ready', onNav)
      wv.removeEventListener('did-navigate', onNav)
      wv.removeEventListener('did-navigate-in-page', onNav)
    }
  }, [tab.filePath, updateNav])

  const goBack = useCallback(() => {
    const wv = wvRef.current
    if (wv && wv.canGoBack()) wv.goBack()
  }, [])

  const goForward = useCallback(() => {
    const wv = wvRef.current
    if (wv && wv.canGoForward()) wv.goForward()
  }, [])

  const reload = useCallback(async () => {
    const result = await window.electronAPI.readFile(tab.filePath)
    if (result.success && result.content !== undefined) {
      setSource(result.content)
    }
    wvRef.current?.reload()
  }, [tab.filePath])

  const tabBtn = (m: Mode) =>
    `px-2 h-6 text-xs rounded transition-colors ${
      mode === m
        ? 'bg-blue-600 text-white'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
    }`

  const navBtn = (enabled: boolean) =>
    `w-7 h-7 flex items-center justify-center rounded text-gray-600 dark:text-gray-400 ${
      enabled
        ? 'hover:bg-gray-100 dark:hover:bg-gray-700'
        : 'opacity-30 cursor-not-allowed'
    }`

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        {mode === 'rendered' && (
          <>
            <button
              onClick={goBack}
              disabled={!canBack}
              className={navBtn(canBack)}
              title="이전"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={goForward}
              disabled={!canForward}
              className={navBtn(canForward)}
              title="다음"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />
          </>
        )}

        <span className="text-xs text-gray-400 truncate flex-1" title={tab.filePath}>
          {tab.filePath}
        </span>

        <button onClick={() => setMode('rendered')} className={tabBtn('rendered')} title="렌더링 보기">
          렌더링
        </button>
        <button onClick={() => setMode('source')} className={tabBtn('source')} title="소스 코드 보기">
          소스
        </button>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

        <button
          onClick={reload}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          title="새로고침"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onClick={() => window.electronAPI.openPath(tab.filePath)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          title="브라우저로 열기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* Content — webview stays mounted so history survives mode toggles */}
      <div className="flex-1 overflow-hidden relative">
        <webview
          key={tab.filePath}
          ref={(el) => {
            wvRef.current = el as unknown as WebviewElement | null
          }}
          src={toFileUrl(tab.filePath)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', background: '#fff' }}
        />
        {mode === 'source' && (
          <pre className="absolute inset-0 z-10 overflow-auto m-0 p-4 text-xs leading-relaxed font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 whitespace-pre">
            {source}
          </pre>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 h-6 text-xs text-gray-400 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span>{tab.fileName}</span>
        <span>HTML</span>
        <span>{mode === 'rendered' ? '렌더링' : '소스'}</span>
      </div>
    </div>
  )
}
