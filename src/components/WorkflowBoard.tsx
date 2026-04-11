import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useWorkflowStore, type WorkflowEntry } from '../stores/useWorkflowStore'
import {
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_ICONS,
  type WorkflowStatus,
} from '../utils/frontmatter'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

const COLUMNS: WorkflowStatus[] = ['draft', 'review', 'approved', 'rejected']

const COLUMN_STYLES: Record<WorkflowStatus, { bg: string; border: string; title: string }> = {
  draft: {
    bg: 'bg-gray-50 dark:bg-gray-800/40',
    border: 'border-gray-200 dark:border-gray-700',
    title: 'text-gray-700 dark:text-gray-300',
  },
  review: {
    bg: 'bg-amber-50 dark:bg-amber-900/10',
    border: 'border-amber-200 dark:border-amber-800/40',
    title: 'text-amber-700 dark:text-amber-300',
  },
  approved: {
    bg: 'bg-green-50 dark:bg-green-900/10',
    border: 'border-green-200 dark:border-green-800/40',
    title: 'text-green-700 dark:text-green-300',
  },
  rejected: {
    bg: 'bg-red-50 dark:bg-red-900/10',
    border: 'border-red-200 dark:border-red-800/40',
    title: 'text-red-700 dark:text-red-300',
  },
}

export default function WorkflowBoard({ onOpenFile }: Props) {
  const entries = useWorkflowStore(s => s.entries)
  const scanning = useWorkflowStore(s => s.scanning)
  const scanProjects = useWorkflowStore(s => s.scanProjects)
  const projects = useAppStore(s => s.projects)
  const currentUser = useAppStore(s => s.currentUser)

  const [filter, setFilter] = useState<'all' | 'mine' | 'received'>('all')
  const [projectFilter, setProjectFilter] = useState<string>('all')
  const [query, setQuery] = useState('')
  const [showAllApproved, setShowAllApproved] = useState(false)

  const APPROVED_LIMIT = 10

  const filteredEntries = useMemo(() => {
    const all = Object.values(entries)
    return all.filter(e => {
      if (projectFilter !== 'all' && e.projectPath !== projectFilter) return false
      if (query && !e.fileName.toLowerCase().includes(query.toLowerCase())) return false
      if (filter === 'mine') {
        return e.meta.author === currentUser
      }
      if (filter === 'received') {
        return e.meta.status === 'review' &&
          e.meta.approvers.some(a => a.name === currentUser && a.status === 'pending')
      }
      return true
    })
  }, [entries, filter, projectFilter, query, currentUser])

  const columns = useMemo(() => {
    const cols: Record<WorkflowStatus, WorkflowEntry[]> = { draft: [], review: [], approved: [], rejected: [] }
    for (const e of filteredEntries) cols[e.meta.status].push(e)
    // Sort approved by most recent action (latest history entry, fallback to created date)
    const recencyKey = (e: WorkflowEntry) => {
      const last = e.meta.history[e.meta.history.length - 1]
      return last?.at || e.meta.created || ''
    }
    cols.approved.sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)))
    return cols
  }, [filteredEntries])

  const rescan = () => {
    scanProjects(projects.map(p => p.path))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">승인 워크플로우 대시보드</h2>

        <div className="flex-1" />

        <div className="flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-700 p-0.5 text-xs">
          {([['all', '전체'], ['received', '받은 요청'], ['mine', '내 문서']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-2 py-0.5 rounded ${
                filter === key
                  ? 'bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={projectFilter}
          onChange={e => setProjectFilter(e.target.value)}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          <option value="all">전체 프로젝트</option>
          {projects.map(p => (
            <option key={p.id} value={p.path}>{p.name}</option>
          ))}
        </select>

        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="파일명 검색..."
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
        />

        <button
          onClick={rescan}
          disabled={scanning}
          className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-50"
        >
          {scanning ? '스캔 중...' : '새로고침'}
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900/60 p-3">
        {projects.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            프로젝트 폴더를 추가하세요.
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-3 min-w-[900px] h-full">
            {COLUMNS.map(status => {
              const style = COLUMN_STYLES[status]
              const items = columns[status]
              const isApproved = status === 'approved'
              const truncated = isApproved && !showAllApproved && items.length > APPROVED_LIMIT
              const visibleItems = truncated ? items.slice(0, APPROVED_LIMIT) : items
              const hiddenCount = items.length - visibleItems.length
              return (
                <div key={status} className={`flex flex-col rounded-lg border ${style.border} ${style.bg}`}>
                  <div className={`flex items-center gap-2 px-3 py-2 border-b ${style.border}`}>
                    <span className="text-lg">{WORKFLOW_STATUS_ICONS[status]}</span>
                    <span className={`text-xs font-bold ${style.title}`}>{WORKFLOW_STATUS_LABELS[status]}</span>
                    <span className="ml-auto text-[10px] text-gray-400">
                      {truncated ? `${visibleItems.length}/${items.length}` : items.length}
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {items.length === 0 ? (
                      <div className="text-[11px] text-gray-400 text-center py-4">비어 있음</div>
                    ) : (
                      <>
                        {visibleItems.map(e => <Card key={e.filePath} entry={e} onOpen={onOpenFile} currentUser={currentUser} />)}
                        {isApproved && hiddenCount > 0 && (
                          <button
                            onClick={() => setShowAllApproved(true)}
                            className="w-full px-2 py-1.5 rounded text-[11px] text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            + {hiddenCount}개 더보기
                          </button>
                        )}
                        {isApproved && showAllApproved && items.length > APPROVED_LIMIT && (
                          <button
                            onClick={() => setShowAllApproved(false)}
                            className="w-full px-2 py-1.5 rounded text-[11px] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                          >
                            ↑ 최근 {APPROVED_LIMIT}개만 보기
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Card({
  entry,
  onOpen,
  currentUser,
}: {
  entry: WorkflowEntry
  onOpen: (p: string, n: string) => void
  currentUser: string
}) {
  const { meta, fileName, filePath, projectPath } = entry
  const projectName = projectPath.replace(/\\/g, '/').split('/').pop() || projectPath
  const isMine = currentUser && meta.author === currentUser
  const isActionable = currentUser && meta.status === 'review' &&
    meta.approvers.some(a => a.name === currentUser && a.status === 'pending')
  const approvedCount = meta.approvers.filter(a => a.status === 'approved').length
  const totalCount = meta.approvers.length

  return (
    <button
      onClick={() => onOpen(filePath, fileName)}
      className={`w-full text-left px-2 py-2 rounded bg-white dark:bg-gray-800 border transition-colors ${
        isActionable
          ? 'border-red-400 dark:border-red-500 ring-1 ring-red-300 dark:ring-red-700'
          : 'border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500'
      }`}
      title={filePath}
    >
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0 text-xs font-medium text-gray-800 dark:text-gray-200 truncate">
          {fileName}
        </div>
        {isMine && (
          <span className="text-[9px] px-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">내 문서</span>
        )}
        {isActionable && (
          <span className="text-[9px] px-1 rounded bg-red-500 text-white font-bold">액션 필요</span>
        )}
      </div>
      <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-400 truncate">
        {projectName}{meta.author ? ` · ${meta.author}` : ''}
      </div>
      {totalCount > 0 && (
        <div className="mt-1 flex items-center gap-1">
          <div className="flex-1 h-1 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${(approvedCount / totalCount) * 100}%` }}
            />
          </div>
          <span className="text-[9px] text-gray-400">{approvedCount}/{totalCount}</span>
        </div>
      )}
      {meta.dueDate && (
        <div className="mt-1 text-[9px] text-amber-600 dark:text-amber-400">기한 {meta.dueDate}</div>
      )}
    </button>
  )
}
