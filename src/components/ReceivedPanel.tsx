import { useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import DiffModal from './DiffModal'

function statusColor(s: string): string {
  switch (s) {
    case 'M': return 'text-orange-500'
    case 'A': return 'text-green-500'
    case 'D': return 'text-red-500'
    case 'R': return 'text-blue-500'
    case '?': return 'text-green-500'
    default: return 'text-gray-500'
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case 'M': return '수정'
    case 'A': return '추가'
    case 'D': return '삭제'
    case 'R': return '이름변경'
    case '?': return '새 파일'
    default: return s
  }
}

// Lists files received from the most recent pull, grouped by project. The
// data source is the same `lastPullByProject` snapshot that drives the file
// tree's purple "📥" badges, so this panel and the tree never disagree.
export default function ReceivedPanel() {
  const lastPullByProject = useAppStore(s => s.lastPullByProject)
  const projects = useAppStore(s => s.projects)
  const setPullResult = useAppStore(s => s.setPullResult)
  const [diffTarget, setDiffTarget] = useState<{
    projectPath: string
    projectName: string
    relPath: string
    before: string
    after: string
  } | null>(null)

  // Only show projects that still exist in the project list AND have received
  // files. Projects removed by the user shouldn't linger in this panel even
  // if their snapshot remains in the persisted store.
  const groups = projects
    .map(p => ({ project: p, range: lastPullByProject[p.path] }))
    .filter((g): g is { project: typeof projects[number]; range: NonNullable<typeof g.range> } =>
      !!g.range && g.range.files.length > 0)

  if (groups.length === 0) {
    return (
      <div className="p-4 text-xs text-gray-400 leading-relaxed">
        받은 변경이 아직 없어요.<br />
        프로젝트에서 <strong>Pull(받기)</strong> 을 하면 이 곳에 모입니다.
      </div>
    )
  }

  return (
    <>
      <div>
        {groups.map(({ project, range }) => (
          <div key={project.path} className="mb-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/70 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
              <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate flex-1" title={project.path}>
                {project.name}
              </span>
              <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 flex-shrink-0">
                {range.files.length}건
              </span>
              <button
                onClick={() => {
                  // Re-open the full pull-result dialog from the persisted
                  // snapshot. We don't have the original commit list any
                  // more, so commits[] stays empty — the dialog handles this.
                  setPullResult({
                    projectPath: project.path,
                    projectName: project.name,
                    commits: [],
                    files: range.files,
                    before: range.before,
                    after: range.after,
                  })
                }}
                className="text-[10px] text-gray-500 hover:text-blue-500 dark:text-gray-400 underline-offset-2 hover:underline flex-shrink-0"
                title="받기 결과 다이얼로그 다시 열기"
              >
                전체 보기
              </button>
            </div>
            {range.files.map((f, i) => {
              const fileName = f.path.split('/').pop() || f.path
              const dirPath = f.path.includes('/') ? f.path.slice(0, -fileName.length - 1) : ''
              return (
                <button
                  key={`${project.path}-${i}`}
                  onClick={() => setDiffTarget({
                    projectPath: project.path,
                    projectName: project.name,
                    relPath: f.path,
                    before: range.before,
                    after: range.after,
                  })}
                  disabled={f.status === 'D'}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:hover:bg-transparent disabled:cursor-not-allowed text-left"
                  title={f.status === 'D' ? '삭제된 파일' : `받기 전후 비교: ${f.path}`}
                >
                  <span className={`font-mono font-bold w-4 text-center flex-shrink-0 ${statusColor(f.status)}`}>{f.status}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-gray-800 dark:text-gray-200">{fileName}</div>
                    {dirPath && (
                      <div className="truncate text-[10px] text-gray-400 dark:text-gray-500">{dirPath}</div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{statusLabel(f.status)}</span>
                </button>
              )
            })}
          </div>
        ))}
      </div>
      {diffTarget && (
        <DiffModal
          projectPath={diffTarget.projectPath}
          relPath={diffTarget.relPath}
          leftRef={diffTarget.before}
          rightRef={diffTarget.after}
          leftLabel="받기 전"
          rightLabel="받기 후"
          onClose={() => setDiffTarget(null)}
        />
      )}
    </>
  )
}
