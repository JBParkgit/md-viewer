import { useState, useEffect } from 'react'
import mammoth from 'mammoth'
import type { Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
}

export default function DocxViewer({ tab }: Props) {
  const [html, setHtml] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setHtml('')

    const loadDocx = async () => {
      try {
        const result = await window.electronAPI.readFileBinary(tab.filePath)
        if (cancelled) return
        if (!result.success || !result.data) {
          setError(result.error || '파일을 읽을 수 없습니다')
          setLoading(false)
          return
        }
        const { value } = await mammoth.convertToHtml(
          { arrayBuffer: result.data },
          {
            styleMap: [
              "p[style-name='Title'] => h1.doc-title",
              "p[style-name='Subtitle'] => h2.doc-subtitle",
              "p[style-name='Heading 1'] => h1",
              "p[style-name='Heading 2'] => h2",
              "p[style-name='Heading 3'] => h3",
            ],
          }
        )
        if (cancelled) return
        setHtml(value)
      } catch (err) {
        if (cancelled) return
        setError(String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadDocx()
    return () => { cancelled = true }
  }, [tab.filePath])

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-400 truncate flex-1" title={tab.filePath}>
          {tab.filePath}
        </span>

        <span className="text-xs text-gray-400 flex-shrink-0">DOCX</span>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

        <button
          onClick={() => window.electronAPI.openPath(tab.filePath)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          title="기본 앱으로 열기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* DOCX Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <span className="text-sm text-gray-400">로딩 중...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p className="text-lg mb-2">DOCX를 열 수 없습니다</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <div className="flex justify-center bg-gray-100 dark:bg-gray-900">
            <div
              className="docx-content bg-white dark:bg-gray-800 shadow-lg px-12 py-10 max-w-4xl w-full"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 h-6 text-xs text-gray-400 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span>{tab.fileName}</span>
        <span>DOCX</span>
      </div>
    </div>
  )
}
