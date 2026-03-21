import { useState, useCallback } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import type { Tab } from '../stores/useAppStore'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface Props {
  tab: Tab
}

function toFileUrl(filePath: string) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3]

export default function PdfViewer({ tab }: Props) {
  const [numPages, setNumPages] = useState<number>(0)
  const [scale, setScale] = useState(1)
  const [error, setError] = useState<string | null>(null)

  const onDocumentLoadSuccess = useCallback(({ numPages: n }: { numPages: number }) => {
    setNumPages(n)
    setError(null)
  }, [])

  const onDocumentLoadError = useCallback((err: Error) => {
    setError(err.message)
  }, [])

  const zoomIn = () => {
    const next = ZOOM_STEPS.find(z => z > scale) ?? scale * 1.5
    setScale(Math.min(5, next))
  }

  const zoomOut = () => {
    const next = [...ZOOM_STEPS].reverse().find(z => z < scale) ?? scale / 1.5
    setScale(Math.max(0.25, next))
  }

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-400 truncate flex-1" title={tab.filePath}>
          {tab.filePath}
        </span>

        {numPages > 0 && (
          <span className="text-xs text-gray-400 flex-shrink-0">
            {numPages}페이지
          </span>
        )}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

        <button
          onClick={zoomOut}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          title="축소"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>

        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-center">
          {Math.round(scale * 100)}%
        </span>

        <button
          onClick={zoomIn}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          title="확대"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </button>

        <button
          onClick={() => setScale(1)}
          className={`px-2 h-6 text-xs rounded transition-colors ${
            scale === 1
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title="100%"
        >
          1:1
        </button>

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

      {/* PDF Content */}
      <div className="flex-1 overflow-auto flex justify-center py-4">
        {error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500 dark:text-gray-400">
              <p className="text-lg mb-2">PDF를 열 수 없습니다</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        ) : (
          <Document
            file={toFileUrl(tab.filePath)}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-32">
                <span className="text-sm text-gray-400">로딩 중...</span>
              </div>
            }
          >
            <div className="flex flex-col items-center gap-4">
              {Array.from({ length: numPages }, (_, i) => (
                <Page
                  key={i}
                  pageNumber={i + 1}
                  scale={scale}
                  className="shadow-lg"
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                />
              ))}
            </div>
          </Document>
        )}
      </div>

      {/* Status bar */}
      {numPages > 0 && (
        <div className="flex items-center gap-4 px-4 h-6 text-xs text-gray-400 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span>{tab.fileName}</span>
          <span>{numPages}페이지</span>
          <span>{Math.round(scale * 100)}%</span>
        </div>
      )}
    </div>
  )
}
