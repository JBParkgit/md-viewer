import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useWorkflowStore } from '../stores/useWorkflowStore'
import { alert, prompt } from '../utils/dialog'
import {
  parseWorkflow,
  updateFrontmatterWorkflow,
  createInitialWorkflow,
  applyDecision,
  WORKFLOW_STATUS_LABELS,
  WORKFLOW_STATUS_COLORS,
  WORKFLOW_STATUS_ICONS,
  type WorkflowMeta,
  type Reviewer,
} from '../utils/frontmatter'
import { markRecentlySaved } from '../utils/recentSave'

interface Props {
  content: string
  filePath: string
  projectPath: string
}

export default function WorkflowDocPanel({ content, filePath, projectPath }: Props) {
  const currentUser = useAppStore(s => s.currentUser)
  const tabs = useAppStore(s => s.tabs)
  const markTabSaved = useAppStore(s => s.markTabSaved)
  const refreshFile = useWorkflowStore(s => s.refreshFile)

  const activeTab = tabs.find(t => t.filePath === filePath)
  const [savingState, setSavingState] = useState<string | null>(null)
  const [newApprover, setNewApprover] = useState('')
  const [addApproverError, setAddApproverError] = useState('')
  const [commentDraft, setCommentDraft] = useState('')

  useEffect(() => {
    setNewApprover('')
    setAddApproverError('')
    setCommentDraft('')
  }, [filePath])

  const meta = useMemo<WorkflowMeta | null>(() => parseWorkflow(content), [content])

  const writeBack = async (next: WorkflowMeta) => {
    setSavingState('저장 중...')
    const updated = updateFrontmatterWorkflow(content, next)
    markRecentlySaved(filePath)
    const res = await window.electronAPI.writeFile(filePath, updated)
    if (res.success) {
      if (activeTab) markTabSaved(activeTab.id, updated)
      window.dispatchEvent(new CustomEvent('file-saved', { detail: filePath }))
      await refreshFile(filePath, projectPath)
      setSavingState('저장됨')
      setTimeout(() => setSavingState(null), 1500)
    } else {
      setSavingState('저장 실패')
      setTimeout(() => setSavingState(null), 2500)
    }
  }

  const initWorkflow = async () => {
    const next = createInitialWorkflow(currentUser || '')
    await writeBack(next)
  }

  if (!meta) {
    return (
      <div className="p-3 space-y-3 text-xs">
        <div className="text-gray-500 dark:text-gray-400">
          이 문서에는 워크플로우 정보가 없습니다.
        </div>
        <button
          onClick={initWorkflow}
          className="w-full px-2 py-1.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white font-medium"
        >
          워크플로우 시작 (초안으로 설정)
        </button>
        <div className="text-[10px] text-gray-400">
          문서 상단에 `status: draft`, `author`, `approvers` 필드가 추가됩니다.
        </div>
      </div>
    )
  }

  const isAuthor = !meta.author || (currentUser && meta.author === currentUser)
  const isDraft = meta.status === 'draft'
  const isReview = meta.status === 'review'
  const isApproved = meta.status === 'approved'
  const isRejected = meta.status === 'rejected'

  const addApprover = async () => {
    const name = newApprover.trim()
    if (!name) {
      setAddApproverError('이름을 입력하세요')
      return
    }
    if (meta.approvers.some(a => a.name === name)) {
      setAddApproverError('이미 추가된 승인자입니다')
      return
    }
    const next: WorkflowMeta = {
      ...meta,
      approvers: [...meta.approvers, { name, status: 'pending' as const } as Reviewer],
    }
    setNewApprover('')
    setAddApproverError('')
    await writeBack(next)
  }

  const removeApprover = async (name: string) => {
    const next: WorkflowMeta = {
      ...meta,
      approvers: meta.approvers.filter(a => a.name !== name),
    }
    await writeBack(next)
  }

  const requestReview = async () => {
    if (meta.approvers.length === 0) {
      alert('승인자를 최소 1명 지정하세요.')
      return
    }
    const note = ((await prompt({ title: '승인 요청', message: '승인자에게 보낼 요청 메시지를 입력하세요 (선택):', placeholder: '메시지' })) ?? '').trim()
    const today = new Date().toISOString().slice(0, 10)
    const next: WorkflowMeta = {
      ...meta,
      status: 'review',
      requestNote: note || undefined,
      approvers: meta.approvers.map(a => ({ ...a, status: 'pending', comment: '', reviewedAt: '' })),
      history: [
        ...meta.history,
        { at: today, by: currentUser || meta.author || '', action: 'requested', note: note || undefined },
      ],
    }
    await writeBack(next)
  }

  const backToDraft = async () => {
    const today = new Date().toISOString().slice(0, 10)
    const next: WorkflowMeta = {
      ...meta,
      status: 'draft',
      history: [
        ...meta.history,
        { at: today, by: currentUser || meta.author || '', action: 'reverted' },
      ],
    }
    await writeBack(next)
  }

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!currentUser) {
      alert('사용자 이름을 설정하세요. (승인 워크플로우 사이드바)')
      return
    }
    const next = applyDecision(meta, currentUser, decision, commentDraft.trim())
    if (!next) {
      alert('이 문서의 승인자 목록에 포함되어 있지 않습니다.')
      return
    }
    setCommentDraft('')
    await writeBack(next)
  }

  const canAct = isReview && !!currentUser && meta.approvers.some(a => a.name === currentUser && a.status === 'pending')

  return (
    <div className="p-3 space-y-3 text-xs">
      {/* Status bar */}
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded-md font-medium ${WORKFLOW_STATUS_COLORS[meta.status]}`}>
          {WORKFLOW_STATUS_ICONS[meta.status]} {WORKFLOW_STATUS_LABELS[meta.status]}
        </span>
        {meta.author && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400 truncate" title={`작성자: ${meta.author}`}>
            작성: {meta.author}
          </span>
        )}
      </div>

      {meta.created && (
        <div className="text-[10px] text-gray-400">생성: {meta.created}{meta.dueDate ? ` · 기한 ${meta.dueDate}` : ''}</div>
      )}

      {meta.requestNote && (isReview || isApproved || isRejected) && (
        <div className="p-2 rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20">
          <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mb-0.5">
            💬 작성자 요청
          </div>
          <div className="text-[11px] text-amber-900 dark:text-amber-100 whitespace-pre-wrap">
            {meta.requestNote}
          </div>
        </div>
      )}

      {savingState && (
        <div className="text-[10px] text-blue-500">{savingState}</div>
      )}

      {/* Approvers */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="font-semibold text-gray-600 dark:text-gray-300">승인자</span>
          <span className="text-[10px] text-gray-400">{meta.approvers.length}명</span>
        </div>
        <div className="space-y-1">
          {meta.approvers.map(a => (
            <PersonRow key={a.name} person={a} removable={!!isAuthor && isDraft} onRemove={() => removeApprover(a.name)} />
          ))}
          {isAuthor && isDraft && (
            <>
              <div className="flex gap-1">
                <input
                  value={newApprover}
                  onChange={e => { setNewApprover(e.target.value); if (addApproverError) setAddApproverError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') addApprover() }}
                  placeholder="승인자 이름"
                  className="flex-1 px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
                />
                <button
                  onClick={addApprover}
                  className="px-1.5 py-0.5 rounded bg-green-500 hover:bg-green-600 text-white text-[11px]"
                >
                  추가
                </button>
              </div>
              {addApproverError && (
                <div className="text-[10px] text-red-500">{addApproverError}</div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action area */}
      {isDraft && isAuthor && (
        <button
          onClick={requestReview}
          className="w-full px-2 py-1.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white font-semibold"
        >
          🚀 승인 요청 보내기
        </button>
      )}

      {isReview && isAuthor && !canAct && (
        <button
          onClick={backToDraft}
          className="w-full px-2 py-1.5 rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200"
        >
          ← 초안으로 되돌리기
        </button>
      )}

      {canAct && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-2">
          <div className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
            승인 대기 중
          </div>
          <textarea
            value={commentDraft}
            onChange={e => setCommentDraft(e.target.value)}
            placeholder="의견 (선택)"
            rows={2}
            className="w-full px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <div className="flex gap-1">
            <button
              onClick={() => handleDecision('approved')}
              className="flex-1 px-2 py-1 rounded bg-green-500 hover:bg-green-600 text-white text-[11px] font-semibold"
            >
              ✅ 승인
            </button>
            <button
              onClick={() => handleDecision('rejected')}
              className="flex-1 px-2 py-1 rounded bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold"
            >
              ❌ 반려
            </button>
          </div>
        </div>
      )}

      {(isApproved || isRejected) && isAuthor && (
        <button
          onClick={backToDraft}
          className="w-full px-2 py-1 rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-[11px]"
        >
          다시 초안으로
        </button>
      )}
    </div>
  )
}

function PersonRow({ person, removable, onRemove }: { person: Reviewer; removable: boolean; onRemove: () => void }) {
  const statusLabel = person.status === 'pending' ? '⏳' : person.status === 'approved' ? '✅' : '❌'
  const colorClass = person.status === 'pending'
    ? 'text-gray-500'
    : person.status === 'approved'
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400'
  return (
    <div className="group flex items-start gap-1.5 px-1.5 py-1 rounded bg-gray-50 dark:bg-gray-700/50">
      <span className={`flex-shrink-0 ${colorClass}`}>{statusLabel}</span>
      <div className="flex-1 min-w-0">
        <div className="truncate text-gray-800 dark:text-gray-200">{person.name}</div>
        {person.comment && (
          <div className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap">{person.comment}</div>
        )}
        {person.reviewedAt && (
          <div className="text-[9px] text-gray-400">{person.reviewedAt}</div>
        )}
      </div>
      {removable && (
        <button
          onClick={onRemove}
          className="opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center rounded hover:text-red-500 text-gray-400"
          title="제거"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}
