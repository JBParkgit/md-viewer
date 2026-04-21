import { useEffect } from 'react'
import { useAppStore } from '../stores/useAppStore'

function statusColor(status: string): string {
  switch (status) {
    case 'M': return 'text-orange-500'
    case 'A': return 'text-green-500'
    case 'D': return 'text-red-500'
    case '?': return 'text-green-500'
    case 'R': return 'text-blue-500'
    default: return 'text-gray-500'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M': return '수정'
    case 'A': return '추가'
    case 'D': return '삭제'
    case '?': return '새 파일'
    case 'R': return '이름변경'
    default: return status
  }
}

export default function PullResultModal() {
  const pullResult = useAppStore(s => s.pullResult)
  const setPullResult = useAppStore(s => s.setPullResult)

  useEffect(() => {
    if (!pullResult) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPullResult(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pullResult, setPullResult])

  if (!pullResult) return null

  const { projectPath, projectName, commits, files } = pullResult
  const close = () => setPullResult(null)

  const openFile = (relPath: string, status: string) => {
    if (status === 'D') return
    const name = relPath.split('/').pop() || relPath
    const abs = `${projectPath}/${relPath}`.replace(/\//g, '\\')
    window.dispatchEvent(new CustomEvent('menu:openFile', { detail: { path: abs, name } }))
    close()
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={close} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-full max-w-2xl h-[75vh]">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                받기 완료 · {projectName}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400">
                커밋 {commits.length}개 · 파일 {files.length}개 변경
              </div>
            </div>
            <button
              onClick={close}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="닫기 (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Files */}
            <div className="flex-1 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-gray-700">
                변경된 파일 ({files.length})
              </div>
              <div className="flex-1 overflow-y-auto">
                {files.length === 0 && (
                  <div className="p-4 text-xs text-gray-400">파일 변경 없음</div>
                )}
                {files.map((f, i) => (
                  <button
                    key={`f-${i}`}
                    onClick={() => openFile(f.path, f.status)}
                    disabled={f.status === 'D'}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:hover:bg-transparent disabled:cursor-not-allowed text-left"
                    title={f.status === 'D' ? '삭제된 파일' : '파일 열기'}
                  >
                    <span className={`font-mono font-bold w-4 text-center ${statusColor(f.status)}`}>{f.status}</span>
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.path}</span>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">{statusLabel(f.status)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Commits */}
            <div className="w-72 flex flex-col overflow-hidden">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-gray-700">
                새로 받은 커밋 ({commits.length})
              </div>
              <div className="flex-1 overflow-y-auto">
                {commits.length === 0 && (
                  <div className="p-4 text-xs text-gray-400">커밋 없음</div>
                )}
                {commits.map((c, i) => (
                  <div
                    key={`c-${i}`}
                    className="px-3 py-2 border-b border-gray-100 dark:border-gray-700/60"
                    title={`${c.author} · ${c.date}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 flex-shrink-0">
                        {c.hash}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{c.date}</span>
                    </div>
                    <div className="text-xs text-gray-800 dark:text-gray-200 mt-0.5 line-clamp-2">
                      {c.subject}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                      {c.author}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={close}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
