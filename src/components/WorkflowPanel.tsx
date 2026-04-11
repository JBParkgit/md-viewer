import { useMemo, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useWorkflowStore, type WorkflowEntry } from '../stores/useWorkflowStore'
import {
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_ICONS,
  type WorkflowStatus,
} from '../utils/frontmatter'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

export default function WorkflowPanel({ onOpenFile }: Props) {
  const currentUser = useAppStore(s => s.currentUser)
  const setCurrentUser = useAppStore(s => s.setCurrentUser)
  const entries = useWorkflowStore(s => s.entries)
  const scanning = useWorkflowStore(s => s.scanning)

  const [userDraft, setUserDraft] = useState(currentUser)
  const [editingUser, setEditingUser] = useState(!currentUser)

  const allEntries = useMemo(() => Object.values(entries), [entries])

  const received = useMemo(() => {
    if (!currentUser) return []
    return allEntries.filter(e =>
      e.meta.status === 'review' &&
      e.meta.approvers.some(a => a.name === currentUser && a.status === 'pending')
    )
  }, [allEntries, currentUser])

  const myDrafts = useMemo(
    () => allEntries.filter(e => e.meta.author === currentUser && e.meta.status === 'draft'),
    [allEntries, currentUser],
  )

  const mySubmitted = useMemo(
    () => allEntries.filter(e => e.meta.author === currentUser && e.meta.status === 'review'),
    [allEntries, currentUser],
  )

  const byStatus = useMemo(() => {
    const counts: Record<WorkflowStatus, number> = { draft: 0, review: 0, approved: 0, rejected: 0 }
    for (const e of allEntries) counts[e.meta.status]++
    return counts
  }, [allEntries])

  const commitUser = () => {
    setCurrentUser(userDraft.trim())
    setEditingUser(false)
  }

  return (
    <div className="p-2 space-y-3">
      {/* Current user */}
      <div className="px-2 py-2 rounded-md bg-white dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600">
        <div className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">현재 사용자</div>
        {editingUser ? (
          <div className="flex items-center gap-1">
            <input
              value={userDraft}
              onChange={e => setUserDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitUser() }}
              placeholder="이름 입력"
              className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-400"
              autoFocus
            />
            <button
              onClick={commitUser}
              className="px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white"
            >
              저장
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate flex-1">
              {currentUser || '(미설정)'}
            </span>
            <button
              onClick={() => { setUserDraft(currentUser); setEditingUser(true) }}
              className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-500 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
            >
              변경
            </button>
          </div>
        )}
        {!currentUser && (
          <div className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">
            이름을 설정하면 "받은 요청"이 표시됩니다.
          </div>
        )}
      </div>

      {/* Status counts */}
      <div className="grid grid-cols-4 gap-1 px-1">
        {(['draft', 'review', 'approved', 'rejected'] as WorkflowStatus[]).map(s => (
          <div
            key={s}
            className={`text-center rounded px-1 py-1 ${WORKFLOW_STATUS_COLORS[s]}`}
            title={WORKFLOW_STATUS_LABELS[s]}
          >
            <div className="text-[9px]">{WORKFLOW_STATUS_ICONS[s]} {WORKFLOW_STATUS_LABELS[s]}</div>
            <div className="text-sm font-bold leading-tight">{byStatus[s]}</div>
          </div>
        ))}
      </div>

      {/* Received requests */}
      <Section
        title="받은 요청"
        emptyText={currentUser ? '대기 중인 요청이 없습니다.' : '사용자 이름을 설정하세요.'}
        count={received.length}
        highlight
        entries={received}
        onOpen={onOpenFile}
      />

      {/* My drafts */}
      <Section
        title="내 초안"
        emptyText="작성 중인 초안이 없습니다."
        count={myDrafts.length}
        entries={myDrafts}
        onOpen={onOpenFile}
      />

      {/* Submitted (awaiting review) */}
      <Section
        title="내가 요청한 리뷰"
        emptyText="제출된 리뷰가 없습니다."
        count={mySubmitted.length}
        entries={mySubmitted}
        onOpen={onOpenFile}
      />

      {scanning && (
        <div className="text-[10px] text-gray-400 text-center">스캔 중...</div>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  emptyText: string
  count: number
  highlight?: boolean
  entries: WorkflowEntry[]
  onOpen: (filePath: string, fileName: string) => void
}

function Section({ title, emptyText, count, highlight, entries, onOpen }: SectionProps) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-1 mb-1">
        <span className={`text-xs font-semibold ${highlight ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
          {title}
        </span>
        {count > 0 && (
          <span className={`text-[10px] px-1.5 rounded-full font-bold ${
            highlight
              ? 'bg-red-500 text-white'
              : 'bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
          }`}>
            {count}
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <div className="px-2 text-[11px] text-gray-400 dark:text-gray-500">{emptyText}</div>
      ) : (
        <div className="space-y-0.5">
          {entries.map(e => (
            <EntryRow key={e.filePath} entry={e} onOpen={onOpen} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryRow({ entry, onOpen }: { entry: WorkflowEntry; onOpen: (p: string, n: string) => void }) {
  const { meta, fileName, filePath } = entry
  return (
    <button
      onClick={() => onOpen(filePath, fileName)}
      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left hover:bg-gray-100 dark:hover:bg-gray-700"
      title={filePath}
    >
      <span className="text-sm flex-shrink-0">{WORKFLOW_STATUS_ICONS[meta.status]}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate text-gray-800 dark:text-gray-200">{fileName}</div>
        <div className="text-[10px] text-gray-400 truncate">
          {meta.author && <>작성: {meta.author}</>}
          {meta.dueDate && <> · 기한 {meta.dueDate}</>}
        </div>
      </div>
    </button>
  )
}
