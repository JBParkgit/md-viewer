import { useEffect, useState } from 'react'
import { confirm } from '../utils/dialog'
import DiffModal from './DiffModal'
import ReadOnlyMarkdownPreview from './ReadOnlyMarkdownPreview'

interface CommitEntry {
  hash: string
  date: string
  author: string
  subject: string
}

interface Props {
  filePath: string         // absolute path
  projectPath: string      // git repo root
  relativePath: string     // path relative to repo root (forward slashes)
  fileName: string
  onClose: () => void
  onRestored?: () => void  // called after a successful checkout
}

export default function FileHistoryModal({ filePath, projectPath, relativePath, fileName, onClose, onRestored }: Props) {
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedHash, setSelectedHash] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewContent, setPreviewContent] = useState<string>('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [actionState, setActionState] = useState<string | null>(null)
  const [diffTarget, setDiffTarget] = useState<'HEAD' | 'WORKING' | null>(null)
  // Markdown files default to a rendered preview; other text files (e.g. .txt,
  // source code) only have a meaningful raw view.
  const isMarkdown = /\.(md|markdown)$/i.test(relativePath)
  const [viewMode, setViewMode] = useState<'preview' | 'raw'>(isMarkdown ? 'preview' : 'raw')

  // Load commit list
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    window.electronAPI.gitFileLog(projectPath, relativePath).then(res => {
      if (cancelled) return
      if (!res.success) {
        setLoadError(res.error || '이력을 불러올 수 없습니다.')
        setLoading(false)
        return
      }
      const lines = (res.output || '').split('\n').filter(Boolean)
      const parsed: CommitEntry[] = lines.map(line => {
        // Tab-separated by `git log --pretty=format:%h%x09%ad%x09%an%x09%s`.
        // Subject may itself contain tabs, so re-join the tail.
        const [hash, date, author, ...rest] = line.split('\t')
        return { hash, date, author, subject: rest.join('\t') }
      })
      setCommits(parsed)
      setLoading(false)
      if (parsed.length > 0) setSelectedHash(parsed[0].hash)
    }).catch(err => {
      if (cancelled) return
      setLoadError(String(err))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectPath, relativePath])

  // Load preview when selection changes
  useEffect(() => {
    if (!selectedHash) { setPreviewContent(''); return }
    let cancelled = false
    setPreviewLoading(true)
    setPreviewError(null)
    window.electronAPI.gitFileShow(projectPath, selectedHash, relativePath).then(res => {
      if (cancelled) return
      if (!res.success) {
        setPreviewError(res.error || '미리보기를 불러올 수 없습니다.')
        setPreviewContent('')
      } else {
        setPreviewContent(res.output || '')
      }
      setPreviewLoading(false)
    }).catch(err => {
      if (cancelled) return
      setPreviewError(String(err))
      setPreviewLoading(false)
    })
    return () => { cancelled = true }
  }, [projectPath, relativePath, selectedHash])

  const handleRestore = async () => {
    if (!selectedHash) return
    const sel = commits.find(c => c.hash === selectedHash)
    if (!sel) return
    if (!(await confirm({
      title: '이전 커밋으로 되돌리기',
      message:
        `"${fileName}"을(를) 다음 시점으로 되돌리시겠습니까?\n\n` +
        `${sel.hash} (${sel.date}) ${sel.author}\n${sel.subject}\n\n` +
        `현재 워킹 디렉토리의 내용이 덮어씌워집니다. 이 변경은 자동으로 스테이징되며, 새 커밋을 만들면 영구히 기록됩니다.`,
      variant: 'danger',
      confirmLabel: '되돌리기',
    }))) return
    setActionState('되돌리는 중...')
    const res = await window.electronAPI.gitCheckoutFileAtCommit(projectPath, selectedHash, relativePath)
    if (res.success) {
      setActionState('완료')
      // Notify any open editor / git panel that this file changed
      window.dispatchEvent(new CustomEvent('git-status-changed', { detail: projectPath }))
      onRestored?.()
      setTimeout(() => { onClose() }, 800)
    } else {
      setActionState(`실패: ${res.error || '알 수 없는 오류'}`)
      setTimeout(() => setActionState(null), 4000)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-full max-w-4xl h-[80vh]">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate" title={filePath}>
                📜 {fileName} — 파일 이력
              </div>
              <div className="text-[10px] text-gray-400 truncate">{relativePath}</div>
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

          {/* Body — split: commit list (left) + preview (right) */}
          <div className="flex flex-1 overflow-hidden">
            {/* Commit list */}
            <div className="w-72 border-r border-gray-200 dark:border-gray-700 flex flex-col">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-gray-700">
                커밋 ({commits.length})
              </div>
              <div className="flex-1 overflow-y-auto">
                {loading && (
                  <div className="p-4 text-center text-xs text-gray-400">
                    <div className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
                    이력 로드 중...
                  </div>
                )}
                {loadError && (
                  <div className="p-4 text-xs text-red-500">{loadError}</div>
                )}
                {!loading && !loadError && commits.length === 0 && (
                  <div className="p-4 text-xs text-gray-400">이 파일에 대한 커밋 이력이 없습니다.</div>
                )}
                {!loading && commits.map(c => (
                  <button
                    key={c.hash}
                    onClick={() => setSelectedHash(c.hash)}
                    className={`w-full text-left px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 ${
                      selectedHash === c.hash
                        ? 'bg-blue-50 dark:bg-blue-900/30'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-blue-600 dark:text-blue-400 flex-shrink-0">
                        {c.hash}
                      </span>
                      <span className="text-[10px] text-gray-400 ml-auto flex-shrink-0">{c.date}</span>
                    </div>
                    <div className="text-xs text-gray-800 dark:text-gray-200 truncate mt-0.5">
                      {c.subject}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                      {c.author}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Preview */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700">
                <span className="text-[10px] uppercase tracking-wide text-gray-400">
                  미리보기 {selectedHash && `(${selectedHash})`}
                </span>
                {isMarkdown && (
                  <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
                    <button
                      onClick={() => setViewMode('preview')}
                      className={`px-2 py-0.5 text-[10px] font-medium ${
                        viewMode === 'preview'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                      title="마크다운으로 렌더링해서 보기"
                    >
                      미리보기
                    </button>
                    <button
                      onClick={() => setViewMode('raw')}
                      className={`px-2 py-0.5 text-[10px] font-medium border-l border-gray-200 dark:border-gray-600 ${
                        viewMode === 'raw'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                      }`}
                      title="원본 텍스트 그대로 보기"
                    >
                      원문
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 overflow-auto">
                {previewLoading && (
                  <div className="p-4 text-center text-xs text-gray-400">
                    <div className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
                    미리보기 로드 중...
                  </div>
                )}
                {previewError && (
                  <div className="p-4 text-xs text-red-500">{previewError}</div>
                )}
                {!previewLoading && !previewError && previewContent && viewMode === 'preview' && isMarkdown && (
                  <div className="px-6 py-4">
                    <ReadOnlyMarkdownPreview content={previewContent} basePath={filePath} />
                  </div>
                )}
                {!previewLoading && !previewError && previewContent && (viewMode === 'raw' || !isMarkdown) && (
                  <pre className="p-4 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                    {previewContent}
                  </pre>
                )}
                {!previewLoading && !previewError && !previewContent && !selectedHash && (
                  <div className="p-4 text-xs text-gray-400">왼쪽에서 커밋을 선택하세요.</div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            {actionState && (
              <span className={`text-xs ${actionState.startsWith('실패') ? 'text-red-500' : 'text-blue-500'}`}>
                {actionState}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              닫기
            </button>
            <button
              onClick={() => setDiffTarget('WORKING')}
              disabled={!selectedHash || loading}
              className="px-3 py-1.5 text-xs rounded-md bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
              title="선택한 시점과 작업본(현재 디스크의 파일)을 비교"
            >
              📝 작업본과 비교
            </button>
            <button
              onClick={() => setDiffTarget('HEAD')}
              disabled={!selectedHash || loading}
              className="px-3 py-1.5 text-xs rounded-md bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
              title="선택한 시점과 현재(HEAD)를 비교"
            >
              🔍 현재와 비교
            </button>
            <button
              onClick={handleRestore}
              disabled={!selectedHash || loading}
              className="px-3 py-1.5 text-xs rounded-md bg-blue-500 hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
            >
              ↩️ 이 시점으로 되돌리기
            </button>
          </div>
        </div>
      </div>
      {diffTarget && selectedHash && (
        <DiffModal
          projectPath={projectPath}
          relPath={relativePath}
          leftRef={selectedHash}
          rightRef={diffTarget}
          leftLabel={`이 시점 (${selectedHash})`}
          rightLabel={diffTarget === 'WORKING' ? '작업본 (현재 파일)' : '현재 (HEAD)'}
          onClose={() => setDiffTarget(null)}
        />
      )}
    </>
  )
}
