import { useState, useEffect } from 'react'
import type { Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
}

type Mode = 'rendered' | 'source'

function toFileUrl(filePath: string) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

export default function HtmlViewer({ tab }: Props) {
  const [mode, setMode] = useState<Mode>('rendered')
  const [source, setSource] = useState<string>(tab.content)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    setSource(tab.content)
  }, [tab.filePath, tab.content])

  const reload = async () => {
    const result = await window.electronAPI.readFile(tab.filePath)
    if (result.success && result.content !== undefined) {
      setSource(result.content)
    }
    setReloadKey(k => k + 1)
  }

  const tabBtn = (m: Mode) =>
    `px-2 h-6 text-xs rounded transition-colors ${
      mode === m
        ? 'bg-blue-600 text-white'
        : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
    }`

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'rendered' ? (
          <iframe
            key={`${tab.filePath}:${reloadKey}`}
            src={toFileUrl(tab.filePath)}
            title={tab.fileName}
            referrerPolicy="no-referrer"
            className="w-full h-full border-0 bg-white"
          />
        ) : (
          <pre className="w-full h-full overflow-auto m-0 p-4 text-xs leading-relaxed font-mono text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-800 whitespace-pre">
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
