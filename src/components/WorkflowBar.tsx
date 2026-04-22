import { useEffect, useMemo, useState } from 'react'
import type { Tab } from '../stores/useAppStore'
import { useAppStore } from '../stores/useAppStore'
import { alert, confirm } from '../utils/dialog'
import {
  parseWorkflow,
  WORKFLOW_STATUS_ICONS,
  WORKFLOW_STATUS_LABELS,
  type HistoryEntry,
  type Reviewer,
  type WorkflowMeta,
  type WorkflowStatus,
} from '../utils/frontmatter'
import { deriveMyAction, useWorkflowActions } from '../hooks/useWorkflowActions'

interface Props {
  tab: Tab
  projectPath: string
}

export default function WorkflowBar({ tab, projectPath }: Props) {
  const currentUser = useAppStore(s => s.currentUser)
  const meta = useMemo(() => parseWorkflow(tab.content), [tab.content])

  const actions = useWorkflowActions(tab.filePath, projectPath)
  const myAction = deriveMyAction(meta, currentUser)

  // Auto-expand when the user needs to act. Collapsed by default otherwise.
  const [expanded, setExpanded] = useState(false)
  useEffect(() => {
    setExpanded(myAction.needsMyAction)
  }, [myAction.needsMyAction, tab.filePath])

  // Sync author/due drafts from parsed meta whenever file or meta changes
  useEffect(() => {
    setAuthorDraft(meta?.author || '')
    setDueDraft(meta?.dueDate || '')
  }, [meta?.author, meta?.dueDate, tab.filePath])

  // Reset per-tab transient inputs when switching files
  useEffect(() => {
    setNewApprover('')
    setAddApproverError('')
    setCommentDraft('')
    setShowCommentFor(null)
    setRequestNoteDraft('')
    setShowRequestComposer(false)
  }, [tab.filePath])

  const [commentDraft, setCommentDraft] = useState('')
  const [showCommentFor, setShowCommentFor] = useState<null | 'approved' | 'rejected'>(null)
  const [newApprover, setNewApprover] = useState('')
  const [addApproverError, setAddApproverError] = useState('')
  const [requestNoteDraft, setRequestNoteDraft] = useState('')
  const [showRequestComposer, setShowRequestComposer] = useState(false)
  const [authorDraft, setAuthorDraft] = useState('')
  const [dueDraft, setDueDraft] = useState('')
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)

  // ── No workflow yet — show "start" hint bar ──────────────────────────────
  if (!meta) {
    return (
      <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 text-xs flex-shrink-0">
        <span className="text-gray-400 dark:text-gray-500">📄 워크플로우 없음</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span className="text-gray-500 dark:text-gray-400 flex-1">리뷰/승인 흐름을 사용하려면 워크플로우를 시작하세요.</span>
        <button
          onClick={actions.initWorkflow}
          className="px-2 py-0.5 rounded-md bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-medium"
          title="문서 상단에 status/author/reviewers/approvers 필드를 추가합니다."
        >
          ✨ 워크플로우 시작
        </button>
        {actions.savingState && (
          <span className="text-[10px] text-blue-500">{actions.savingState}</span>
        )}
      </div>
    )
  }

  const isAuthor = currentUser && meta.author === currentUser
  const isDraft = meta.status === 'draft'
  const isReview = meta.status === 'review'
  const isApproved = meta.status === 'approved'
  const isRejected = meta.status === 'rejected'

  const totalCount = meta.approvers.length
  const doneCount = meta.approvers.filter(a => a.status !== 'pending').length

  const nextPending = (() => {
    if (!isReview) return null
    const a = meta.approvers.find(x => x.status === 'pending')
    return a ? `대기: ${a.name}` : null
  })()

  // ── Color theme ──────────────────────────────────────────────────────────
  const bgClass = myAction.needsMyAction
    ? 'bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500'
    : isDraft
    ? 'bg-gray-50 dark:bg-gray-800/60'
    : isReview
    ? 'bg-amber-50 dark:bg-amber-900/20'
    : isApproved
    ? 'bg-green-50 dark:bg-green-900/20'
    : 'bg-red-50 dark:bg-red-900/20'

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleDecision = async () => {
    if (!showCommentFor) return
    const res = await actions.decide(meta, showCommentFor, commentDraft)
    if (!res.ok) {
      alert(res.error || '처리 실패')
      return
    }
    setCommentDraft('')
    setShowCommentFor(null)
  }

  const handleAddApprover = async () => {
    const res = await actions.addPerson(meta, newApprover)
    if (res.ok) {
      setNewApprover('')
      setAddApproverError('')
    } else if (res.reason === 'duplicate') {
      setAddApproverError('이미 추가된 승인자입니다')
    } else if (res.reason === 'empty') {
      setAddApproverError('이름을 입력하세요')
    }
  }

  const commitAuthor = async () => {
    const next = authorDraft.trim()
    if (next !== (meta.author || '')) {
      await actions.updateFields(meta, { author: next })
    }
  }
  const commitDueDate = async () => {
    if (dueDraft !== (meta.dueDate || '')) {
      await actions.updateFields(meta, { dueDate: dueDraft || undefined })
    }
  }

  return (
    <div className={`sticky top-0 z-10 flex-shrink-0 border-b border-gray-200 dark:border-gray-700 ${bgClass}`}>
      {/* ── Row 1: Status bar ── */}
      <div className="flex items-center gap-2 px-4 py-1.5 text-xs">
        <button
          onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          title="세부 내역 펼치기/접기"
        >
          <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setStatusMenuOpen(v => !v)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white/60 dark:hover:bg-gray-700/60 transition-colors"
            title="클릭해서 상태 변경"
          >
            <span className="text-sm">{WORKFLOW_STATUS_ICONS[meta.status]}</span>
            <span className="font-semibold text-gray-800 dark:text-gray-100">
              {WORKFLOW_STATUS_LABELS[meta.status]}
            </span>
            <svg className="w-2.5 h-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {statusMenuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setStatusMenuOpen(false)} />
              <div className="absolute left-0 top-full mt-1 z-30 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg py-1">
                {(['draft', 'review', 'approved', 'rejected'] as WorkflowStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => { actions.setStatus(meta, s); setStatusMenuOpen(false) }}
                    className={`w-full flex items-center gap-2 px-2 py-1 text-[11px] text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${
                      meta.status === s ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-semibold' : 'text-gray-700 dark:text-gray-200'
                    }`}
                  >
                    <span>{WORKFLOW_STATUS_ICONS[s]}</span>
                    <span>{WORKFLOW_STATUS_LABELS[s]}</span>
                    {meta.status === s && <span className="ml-auto text-[10px]">✓</span>}
                  </button>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-700 my-1" />
                <div className="px-2 py-1 text-[9px] text-gray-400 leading-tight">
                  상태를 직접 지정합니다. 리뷰어/승인자 진행 상황과 무관하게 강제 변경됩니다.
                </div>
              </div>
            </>
          )}
        </div>

        {meta.author && (
          <>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-gray-500 dark:text-gray-400 truncate flex-shrink-0" title={`작성자: ${meta.author}`}>
              {meta.author}
            </span>
          </>
        )}

        {totalCount > 0 && (
          <>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-gray-500 dark:text-gray-400 flex-shrink-0" title={`완료 ${doneCount} / 전체 ${totalCount}`}>
              👥 {doneCount}/{totalCount}
            </span>
          </>
        )}

        {meta.dueDate && (
          <>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">기한 {meta.dueDate}</span>
          </>
        )}

        {nextPending && !myAction.needsMyAction && (
          <>
            <span className="text-gray-300 dark:text-gray-600 hidden sm:inline">·</span>
            <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:inline">⏳ {nextPending}</span>
          </>
        )}

        {myAction.needsMyAction && (
          <span className="font-semibold text-red-600 dark:text-red-400 truncate">
            ⚠️ 내 승인 대기 중
          </span>
        )}

        <div className="flex-1" />

        {actions.savingState && (
          <span className="text-[10px] text-blue-500 flex-shrink-0">{actions.savingState}</span>
        )}

        {/* Primary action button(s) */}
        {isDraft && isAuthor && (
          <button
            onClick={() => { setShowRequestComposer(true); setExpanded(true) }}
            className="px-2 py-0.5 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-semibold flex-shrink-0"
          >
            🚀 리뷰 요청
          </button>
        )}

        {myAction.needsMyAction && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => { setShowCommentFor('approved'); setExpanded(true) }}
              className="px-2 py-0.5 rounded-md bg-green-500 hover:bg-green-600 text-white text-[11px] font-semibold"
            >
              ✅ 승인
            </button>
            <button
              onClick={() => { setShowCommentFor('rejected'); setExpanded(true) }}
              className="px-2 py-0.5 rounded-md bg-red-500 hover:bg-red-600 text-white text-[11px] font-semibold"
            >
              ❌ 반려
            </button>
          </div>
        )}

        {(isApproved || isRejected || (isReview && isAuthor && !myAction.needsMyAction)) && isAuthor && (
          <button
            onClick={() => actions.backToDraft(meta)}
            className="px-2 py-0.5 rounded-md bg-gray-200 dark:bg-gray-600 hover:bg-gray-300 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 text-[11px] flex-shrink-0"
            title="상태를 초안으로 되돌립니다"
          >
            ← 초안으로
          </button>
        )}

      </div>

      {/* ── Expanded detail panel ── */}
      {expanded && (
        <div className="border-t border-gray-200/70 dark:border-gray-700/70 px-4 py-2 bg-white/60 dark:bg-gray-900/40">
          {/* Author's request note shown to approvers */}
          {meta.requestNote && (isReview || isApproved || isRejected) && (
            <div className="mb-2 p-2 rounded-md border-l-4 border-amber-400 bg-amber-50 dark:bg-amber-900/20">
              <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mb-0.5">
                💬 작성자의 요청 메시지
              </div>
              <div className="text-[11px] text-amber-900 dark:text-amber-100 whitespace-pre-wrap">
                {meta.requestNote}
              </div>
            </div>
          )}

          {/* Inline review-request composer (appears when clicking 🚀 리뷰 요청) */}
          {showRequestComposer && isDraft && isAuthor && (
            <div className="mb-2 flex items-start gap-2 p-2 rounded-md bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-700">
              <span className="text-base flex-shrink-0 mt-0.5">🚀</span>
              <div className="flex-1">
                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 mb-1">
                  승인자에게 보낼 요청 메시지 (선택)
                </div>
                <textarea
                  value={requestNoteDraft}
                  onChange={e => setRequestNoteDraft(e.target.value)}
                  rows={3}
                  placeholder="예: 이번 주 금요일까지 검토 부탁드립니다. 특히 3장 데이터 부분을 집중적으로 봐 주세요."
                  className="w-full px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  autoFocus
                />
                <div className="flex justify-end gap-1 mt-1">
                  <button
                    onClick={() => { setShowRequestComposer(false); setRequestNoteDraft('') }}
                    className="px-2 py-0.5 rounded text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={async () => {
                      await actions.requestReview(meta, requestNoteDraft)
                      setShowRequestComposer(false)
                      setRequestNoteDraft('')
                    }}
                    className="px-2 py-0.5 rounded text-[11px] text-white font-semibold bg-amber-500 hover:bg-amber-600"
                  >
                    🚀 리뷰 요청 보내기
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Inline decision comment (appears when clicking ✅/❌) */}
          {showCommentFor && (
            <div className="mb-2 flex items-start gap-2 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600">
              <span className="text-base flex-shrink-0 mt-0.5">
                {showCommentFor === 'approved' ? '✅' : '❌'}
              </span>
              <div className="flex-1">
                <textarea
                  value={commentDraft}
                  onChange={e => setCommentDraft(e.target.value)}
                  rows={2}
                  placeholder="의견 (선택 — 특히 반려 시 사유 작성 권장)"
                  className="w-full px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  autoFocus
                />
                <div className="flex justify-end gap-1 mt-1">
                  <button
                    onClick={() => { setShowCommentFor(null); setCommentDraft('') }}
                    className="px-2 py-0.5 rounded text-[11px] text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleDecision}
                    className={`px-2 py-0.5 rounded text-[11px] text-white font-semibold ${
                      showCommentFor === 'approved' ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'
                    }`}
                  >
                    확정
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Author + due date — always editable */}
          <div className="mb-2 grid grid-cols-2 gap-2 p-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">작성자</span>
              <input
                value={authorDraft}
                onChange={e => setAuthorDraft(e.target.value)}
                onBlur={commitAuthor}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                placeholder="작성자 이름"
                className="px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] font-semibold text-gray-500 dark:text-gray-400">기한 (선택)</span>
              <input
                type="date"
                value={dueDraft}
                onChange={e => setDueDraft(e.target.value)}
                onBlur={commitDueDate}
                className="px-2 py-1 text-[11px] rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
            <div className="col-span-2 text-[10px] text-gray-400">
              변경은 Enter 또는 다른 곳을 클릭하면 자동 저장됩니다.
            </div>
          </div>

          {/* Approvers list — always editable */}
          <Section
            title="승인자"
            list={meta.approvers}
            canEdit={true}
            onRemove={(name) => actions.removePerson(meta, name)}
            addInput={newApprover}
            setAddInput={(v) => { setNewApprover(v); if (addApproverError) setAddApproverError('') }}
            onAdd={handleAddApprover}
          />

          {addApproverError && (
            <div className="mt-1 text-[10px] text-red-500">{addApproverError}</div>
          )}

          <div className="mt-1 text-[10px] text-gray-400">
            💡 칩의 × 로 제거, 점선 입력란에 이름 입력 후 Enter로 추가. 검토 중이어도 변경 가능합니다.
          </div>

          {/* History — chronological audit log of request/approve/reject cycles */}
          {meta.history.length > 0 && (
            <HistorySection history={meta.history} />
          )}

          {/* Danger zone — remove workflow entirely */}
          <div className="mt-2 pt-2 border-t border-gray-200/70 dark:border-gray-700/70 flex items-center justify-end">
            <button
              onClick={async () => {
                const summary = `이 문서의 워크플로우를 완전히 제거합니다.\n\n` +
                  `• 상태 / 작성자 / 기한 / 승인자 (${meta.approvers.length}명) 모두 삭제됩니다\n` +
                  `• 이력 ${meta.history.length}건이 함께 사라집니다\n` +
                  `• 본문과 태그 등 다른 내용은 그대로 유지됩니다\n\n` +
                  `계속하시겠습니까?`
                if (!(await confirm({ message: summary, variant: 'danger', confirmLabel: '제거' }))) return
                await actions.clearWorkflow()
              }}
              className="px-2 py-0.5 rounded text-[10px] text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 hover:bg-red-50 dark:hover:bg-red-900/20"
              title="이 문서에서 워크플로우 정보를 모두 제거합니다 (다른 frontmatter는 유지)"
            >
              🗑️ 워크플로우 제거
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  list: Reviewer[]
  canEdit: boolean
  onRemove: (name: string) => void
  addInput: string
  setAddInput: (v: string) => void
  onAdd: () => void
}

function Section({ title, list, canEdit, onRemove, addInput, setAddInput, onAdd }: SectionProps) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-0.5">
        {title} ({list.length})
      </div>
      <div className="flex flex-wrap gap-1 items-center">
        {list.length === 0 && !canEdit && (
          <span className="text-[10px] text-gray-400">없음</span>
        )}
        {list.map(p => (
          <span
            key={p.name}
            className={`group inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] border ${
              p.status === 'approved'
                ? 'bg-green-50 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300'
                : p.status === 'rejected'
                ? 'bg-red-50 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                : 'bg-gray-50 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
            }`}
            title={p.comment ? `${p.name}: ${p.comment}` : p.name}
          >
            <span>
              {p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳'}
            </span>
            <span className="font-medium">{p.name}</span>
            {p.comment && (
              <span className="hidden lg:inline text-[9px] opacity-70 max-w-[120px] truncate">· {p.comment}</span>
            )}
            {canEdit && (
              <button
                onClick={() => onRemove(p.name)}
                className="ml-0.5 text-gray-400 hover:text-red-500"
                title="제거"
              >
                ×
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <div className="inline-flex items-center gap-1 ml-1">
            <input
              value={addInput}
              onChange={e => setAddInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onAdd() } }}
              placeholder={`${title} 이름`}
              className="w-28 px-2 py-0.5 rounded text-[11px] border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={onAdd}
              disabled={!addInput.trim()}
              className="px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              + 추가
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── History audit log ────────────────────────────────────────────────────

const HISTORY_ICON: Record<HistoryEntry['action'], string> = {
  requested: '🚀',
  approved: '✅',
  rejected: '❌',
  reverted: '↩️',
}

const HISTORY_LABEL: Record<HistoryEntry['action'], string> = {
  requested: '리뷰 요청',
  approved: '승인',
  rejected: '반려',
  reverted: '초안으로 되돌림',
}

const HISTORY_COLOR: Record<HistoryEntry['action'], string> = {
  requested: 'text-amber-700 dark:text-amber-300',
  approved: 'text-green-700 dark:text-green-300',
  rejected: 'text-red-700 dark:text-red-300',
  reverted: 'text-gray-600 dark:text-gray-400',
}

function HistorySection({ history }: { history: HistoryEntry[] }) {
  const [open, setOpen] = useState(false)
  // Newest first
  const sorted = [...history].reverse()

  // Group consecutive requested entries to mark cycles
  const cycleNumberOf = new Map<number, number>()
  let cycle = 0
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].action === 'requested') {
      cycle++
      cycleNumberOf.set(i, cycle)
    }
  }
  const totalCycles = cycle

  return (
    <div className="mt-2 border-t border-gray-200/70 dark:border-gray-700/70 pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] font-semibold text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
      >
        <svg className={`w-2.5 h-2.5 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
        </svg>
        📋 이력 ({history.length}건{totalCycles > 1 ? ` · ${totalCycles}차 요청` : ''})
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
          {sorted.map((h, idx) => {
            const originalIdx = history.length - 1 - idx
            const cycleNum = cycleNumberOf.get(originalIdx)
            return (
              <div key={originalIdx} className="flex items-start gap-1.5 text-[11px] py-0.5">
                <span className="flex-shrink-0">{HISTORY_ICON[h.action]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-medium ${HISTORY_COLOR[h.action]}`}>
                      {HISTORY_LABEL[h.action]}
                    </span>
                    {cycleNum && totalCycles > 1 && (
                      <span className="px-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[9px] font-semibold">
                        {totalCycles - cycleNum + 1}차
                      </span>
                    )}
                    <span className="text-gray-500 dark:text-gray-400">{h.by || '?'}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-400 text-[10px]">{h.at}</span>
                  </div>
                  {h.note && (
                    <div className="text-[10px] text-gray-600 dark:text-gray-300 whitespace-pre-wrap mt-0.5 px-1.5 py-0.5 rounded bg-gray-50 dark:bg-gray-800/60">
                      {h.note}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
