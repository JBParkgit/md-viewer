import { useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

// react-pdf shares one global worker across the app; PdfViewer.tsx already sets
// this on import. Re-assign here to be safe in case PrintPreviewModal renders
// before PdfViewer has been imported (e.g. user prints without ever opening
// a .pdf tab).
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface Props {
  fileName: string
  onClose: () => void
}

export default function PrintPreviewModal({ fileName, onClose }: Props) {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1)
  const [printing, setPrinting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Generate PDF on mount. printToPDF runs against the live DOM with our
  // @media print rules applied, so it captures only the markdown preview.
  useEffect(() => {
    let cancelled = false
    window.electronAPI.printPreviewGenerate().then(res => {
      if (cancelled) return
      if (!res.success) {
        setError(res.error || 'PDF 생성 실패')
        return
      }
      // base64 → Uint8Array. atob is plenty fast for documents this size and
      // avoids pulling Buffer/blob plumbing through the contextBridge.
      const bin = atob(res.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      setPdfBytes(bytes)
    }).catch(e => {
      if (cancelled) return
      setError(e?.message || 'PDF 생성 실패')
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // react-pdf's Document accepts { data: Uint8Array }, but its internal
  // identity check by reference triggers reloads if we rebuild the object
  // on every render. Memoize.
  const file = useMemo(() => (pdfBytes ? { data: pdfBytes } : null), [pdfBytes])

  const handlePrint = async () => {
    setPrinting(true)
    const res = await window.electronAPI.printPreviewPrint()
    setPrinting(false)
    if (!res.success && res.error) {
      // Cancelled-by-user is a normal case (errorType === 'cancelled'); don't
      // show that as an error to the user.
      if (!/cancel/i.test(res.error)) setError(res.error)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-full max-w-4xl h-[90vh]">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                인쇄 미리보기 — {fileName}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                {numPages > 0 ? `${numPages}페이지 · A4` : 'PDF 생성 중...'}
              </div>
            </div>

            {/* Zoom controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setScale(s => Math.max(0.5, s - 0.25))}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
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
                onClick={() => setScale(s => Math.min(3, s + 0.25))}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
                title="확대"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="닫기 (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* PDF body */}
          <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 py-4">
            {error && (
              <div className="px-6 py-12 text-center text-sm text-red-500">{error}</div>
            )}
            {!error && !file && (
              <div className="px-6 py-12 text-center text-xs text-gray-400">
                <div className="inline-block w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                PDF 생성 중...
              </div>
            )}
            {file && (
              <Document
                file={file}
                onLoadSuccess={({ numPages: n }) => setNumPages(n)}
                onLoadError={(e: Error) => setError(e.message)}
                loading={
                  <div className="px-6 py-12 text-center text-xs text-gray-400">PDF 로드 중...</div>
                }
              >
                <div className="flex flex-col items-center gap-4">
                  {Array.from({ length: numPages }, (_, i) => (
                    <Page
                      key={i}
                      pageNumber={i + 1}
                      scale={scale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="shadow-lg"
                    />
                  ))}
                </div>
              </Document>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <span className="text-[11px] text-gray-400">
              미리보기는 실제 인쇄 결과와 같습니다.
            </span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              닫기
            </button>
            <button
              onClick={handlePrint}
              disabled={!file || printing}
              className="px-4 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold inline-flex items-center gap-1.5"
            >
              {printing ? (
                <>
                  <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  인쇄 중...
                </>
              ) : (
                <>🖨️ 인쇄</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
