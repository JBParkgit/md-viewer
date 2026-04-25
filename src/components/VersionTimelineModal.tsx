import { useEffect, useMemo, useState } from 'react'
import DiffModal from './DiffModal'

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
  isDirty: boolean         // tab dirty flag, used to surface "작업본 (미저장 포함)"
  onClose: () => void
}

// Sentinel refs the picker uses; DiffModal already understands 'WORKING' and 'HEAD'.
type Slot = string  // commit hash | 'HEAD' | 'WORKING'

function shortRef(s: Slot): string {
  if (s === 'WORKING') return '작업본'
  if (s === 'HEAD') return 'HEAD'
  return s
}

export default function VersionTimelineModal({ filePath, projectPath, relativePath, fileName, isDirty, onClose }: Props) {
  const [commits, setCommits] = useState<CommitEntry[]>([])
  const [headHash, setHeadHash] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Default selection: 왼쪽 = 한 단계 이전 시점, 오른쪽 = 작업본.
  // 가장 흔한 질문 "지난 버전 대비 지금 뭐가 달라졌지?" 에 곧장 답이 됨.
  const [leftRef, setLeftRef] = useState<Slot | null>(null)
  const [rightRef, setRightRef] = useState<Slot | null>('WORKING')
  const [diffOpen, setDiffOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (diffOpen) setDiffOpen(false)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, diffOpen])

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
        // Tab-separated: %h\t%ad\t%an\t%s
        const [hash, date, author, ...rest] = line.split('\t')
        return { hash, date, author, subject: rest.join('\t') }
      })
      setCommits(parsed)
      // HEAD = the newest commit returned by git log for this file, useful so
      // we can mark which commit is "현재(HEAD)" in the picker.
      if (parsed.length > 0) setHeadHash(parsed[0].hash)
      // Pick a sane default for 왼쪽: the second-newest commit (one before HEAD).
      // Falls back to the only commit when there's just one.
      if (parsed.length >= 2) setLeftRef(parsed[1].hash)
      else if (parsed.length === 1) setLeftRef(parsed[0].hash)
      else setLeftRef(null)
      setLoading(false)
    }).catch(err => {
      if (cancelled) return
      setLoadError(String(err))
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectPath, relativePath])

  // Build the unified row list: [작업본, ...commits].
  // We only show 작업본 row when there is a working copy file at all (always
  // true here since the modal is opened from an open document tab).
  const rows = useMemo(() => {
    const list: { ref: Slot; primary: string; secondary: string; isHead: boolean; isWorking: boolean }[] = []
    list.push({
      ref: 'WORKING',
      primary: isDirty ? '📝 작업본 (미저장 변경 포함)' : '📝 작업본 (현재 파일)',
      secondary: filePath,
      isHead: false,
      isWorking: true,
    })
    for (const c of commits) {
      list.push({
        ref: c.hash,
        primary: c.subject || '(제목 없음)',
        secondary: `${c.hash} · ${c.date} · ${c.author}`,
        isHead: c.hash === headHash,
        isWorking: false,
      })
    }
    return list
  }, [commits, headHash, isDirty, filePath])

  const canCompare = !!leftRef && !!rightRef && leftRef !== rightRef

  const handleCompare = () => {
    if (!canCompare) return
    setDiffOpen(true)
  }

  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-[101] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-full max-w-3xl h-[80vh]">
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate" title={filePath}>
                🕐 {fileName} — 버전 비교
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

          {/* Help line */}
          <div className="px-4 py-2 text-[11px] text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            비교하고 싶은 두 시점을 골라 주세요. 왼쪽 / 오른쪽 라디오 버튼을 누른 뒤 아래의 <span className="font-semibold">🔍 비교</span> 버튼을 누르면 좌우로 비교 화면이 열립니다.
          </div>

          {/* Column header */}
          <div className="grid grid-cols-[3rem_3rem_1fr] gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <div className="text-center">왼쪽</div>
            <div className="text-center">오른쪽</div>
            <div>시점</div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {loading && (
              <div className="p-6 text-center text-xs text-gray-400">
                <div className="inline-block w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin mr-2" />
                이력 로드 중...
              </div>
            )}
            {loadError && <div className="p-6 text-xs text-red-500">{loadError}</div>}
            {!loading && !loadError && rows.length === 1 && (
              <div className="p-6 text-xs text-gray-400">
                이 파일에 대한 커밋 이력이 없습니다. 첫 커밋 이후부터 비교할 수 있어요.
              </div>
            )}
            {!loading && rows.map((row, idx) => {
              const isLeft = leftRef === row.ref
              const isRight = rightRef === row.ref
              const rowBg = isLeft && isRight
                ? 'bg-gray-100 dark:bg-gray-700/40'
                : isLeft ? 'bg-blue-50 dark:bg-blue-900/20'
                : isRight ? 'bg-green-50 dark:bg-green-900/20'
                : ''
              return (
                <div
                  key={`${row.ref}-${idx}`}
                  className={`grid grid-cols-[3rem_3rem_1fr] gap-2 items-center px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 ${rowBg}`}
                >
                  <div className="flex justify-center">
                    <input
                      type="radio"
                      name="leftSel"
                      checked={isLeft}
                      onChange={() => setLeftRef(row.ref)}
                      className="accent-blue-500 cursor-pointer"
                      aria-label="왼쪽으로 선택"
                    />
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="radio"
                      name="rightSel"
                      checked={isRight}
                      onChange={() => setRightRef(row.ref)}
                      className="accent-green-500 cursor-pointer"
                      aria-label="오른쪽으로 선택"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-800 dark:text-gray-100 truncate">
                        {row.primary}
                      </span>
                      {row.isHead && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex-shrink-0">
                          현재(HEAD)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {row.secondary}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <div className="flex-1 min-w-0 text-xs text-gray-600 dark:text-gray-300 truncate">
              <span className="text-blue-600 dark:text-blue-400">왼쪽: {leftRef ? shortRef(leftRef) : '미선택'}</span>
              <span className="mx-2 text-gray-400">↔</span>
              <span className="text-green-600 dark:text-green-400">오른쪽: {rightRef ? shortRef(rightRef) : '미선택'}</span>
              {leftRef && rightRef && leftRef === rightRef && (
                <span className="ml-3 text-orange-500">동일 시점은 비교할 수 없어요.</span>
              )}
            </div>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              닫기
            </button>
            <button
              onClick={handleCompare}
              disabled={!canCompare}
              className="px-3 py-1.5 text-xs rounded-md bg-purple-500 hover:bg-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold"
            >
              🔍 비교
            </button>
          </div>
        </div>
      </div>
      {diffOpen && leftRef && rightRef && (
        <DiffModal
          projectPath={projectPath}
          relPath={relativePath}
          leftRef={leftRef}
          rightRef={rightRef}
          leftLabel={leftRef === 'WORKING' ? '작업본' : leftRef === 'HEAD' ? '현재 (HEAD)' : `이 시점 (${leftRef})`}
          rightLabel={rightRef === 'WORKING' ? '작업본' : rightRef === 'HEAD' ? '현재 (HEAD)' : `이 시점 (${rightRef})`}
          onClose={() => setDiffOpen(false)}
        />
      )}
    </>
  )
}
