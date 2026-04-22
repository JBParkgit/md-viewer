import { useCallback, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useWorkflowStore } from '../stores/useWorkflowStore'
import {
  applyDecision,
  createInitialWorkflow,
  parseWorkflow,
  removeFrontmatterWorkflow,
  updateFrontmatterWorkflow,
  type WorkflowMeta,
} from '../utils/frontmatter'
import { markRecentlySaved } from '../utils/recentSave'
import { alert } from '../utils/dialog'

export interface UseWorkflowActions {
  savingState: string | null
  writeBack: (next: WorkflowMeta) => Promise<void>
  initWorkflow: () => Promise<void>
  clearWorkflow: () => Promise<void>
  addPerson: (meta: WorkflowMeta, name: string) => Promise<{ ok: boolean; reason?: string }>
  removePerson: (meta: WorkflowMeta, name: string) => Promise<void>
  updateFields: (meta: WorkflowMeta, patch: Partial<Pick<WorkflowMeta, 'author' | 'dueDate' | 'created'>>) => Promise<void>
  setStatus: (meta: WorkflowMeta, status: WorkflowMeta['status']) => Promise<void>
  requestReview: (meta: WorkflowMeta, note?: string) => Promise<void>
  backToDraft: (meta: WorkflowMeta) => Promise<void>
  decide: (meta: WorkflowMeta, decision: 'approved' | 'rejected', comment: string) => Promise<{ ok: boolean; error?: string }>
}

/**
 * Shared workflow mutation logic used by the RightPanel WorkflowDocPanel
 * and the inline MarkdownEditor WorkflowBar. Rewrites the file's frontmatter,
 * syncs any open tab, and refreshes the workflow index.
 */
export function useWorkflowActions(filePath: string, projectPath: string): UseWorkflowActions {
  const currentUser = useAppStore(s => s.currentUser)
  const tabs = useAppStore(s => s.tabs)
  const markTabSaved = useAppStore(s => s.markTabSaved)
  const refreshFile = useWorkflowStore(s => s.refreshFile)

  const [savingState, setSavingState] = useState<string | null>(null)

  const writeBack = useCallback(async (next: WorkflowMeta) => {
    const activeTab = tabs.find(t => t.filePath === filePath)
    const content = activeTab?.content
    if (content === undefined) return
    setSavingState('저장 중...')
    const updated = updateFrontmatterWorkflow(content, next)
    markRecentlySaved(filePath)
    const res = await window.electronAPI.writeFile(filePath, updated)
    if (res.success) {
      if (activeTab) markTabSaved(activeTab.id, updated)
      await refreshFile(filePath, projectPath)
      setSavingState('저장됨')
      setTimeout(() => setSavingState(null), 1200)
      window.dispatchEvent(new CustomEvent('file-saved', { detail: filePath }))
    } else {
      setSavingState('저장 실패')
      setTimeout(() => setSavingState(null), 2500)
    }
  }, [filePath, projectPath, tabs, markTabSaved, refreshFile])

  const initWorkflow = useCallback(async () => {
    const next = createInitialWorkflow(currentUser || '')
    await writeBack(next)
  }, [currentUser, writeBack])

  const clearWorkflow = useCallback(async () => {
    const activeTab = tabs.find(t => t.filePath === filePath)
    const content = activeTab?.content
    if (content === undefined) return
    setSavingState('제거 중...')
    const updated = removeFrontmatterWorkflow(content)
    markRecentlySaved(filePath)
    const res = await window.electronAPI.writeFile(filePath, updated)
    if (res.success) {
      if (activeTab) markTabSaved(activeTab.id, updated)
      // Drop from workflow index since the file no longer has workflow meta
      useWorkflowStore.getState().removeFile(filePath)
      setSavingState('제거됨')
      setTimeout(() => setSavingState(null), 1200)
      window.dispatchEvent(new CustomEvent('file-saved', { detail: filePath }))
    } else {
      setSavingState('제거 실패')
      setTimeout(() => setSavingState(null), 2500)
    }
  }, [filePath, tabs, markTabSaved])

  const addPerson = useCallback(async (meta: WorkflowMeta, name: string): Promise<{ ok: boolean; reason?: string }> => {
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, reason: 'empty' }
    if (meta.approvers.some(r => r.name === trimmed)) return { ok: false, reason: 'duplicate' }
    const next: WorkflowMeta = {
      ...meta,
      approvers: [...meta.approvers, { name: trimmed, status: 'pending' as const }],
    }
    await writeBack(next)
    return { ok: true }
  }, [writeBack])

  const removePerson = useCallback(async (meta: WorkflowMeta, name: string) => {
    const next: WorkflowMeta = {
      ...meta,
      approvers: meta.approvers.filter(r => r.name !== name),
    }
    await writeBack(next)
  }, [writeBack])

  const updateFields = useCallback(async (
    meta: WorkflowMeta,
    patch: Partial<Pick<WorkflowMeta, 'author' | 'dueDate' | 'created'>>,
  ) => {
    const next: WorkflowMeta = { ...meta, ...patch }
    await writeBack(next)
  }, [writeBack])

  const setStatus = useCallback(async (
    meta: WorkflowMeta,
    status: WorkflowMeta['status'],
  ) => {
    const next: WorkflowMeta = { ...meta, status }
    await writeBack(next)
  }, [writeBack])

  const requestReview = useCallback(async (meta: WorkflowMeta, note?: string) => {
    if (meta.approvers.length === 0) {
      alert('승인자를 최소 1명 지정하세요.')
      return
    }
    const trimmedNote = (note || '').trim()
    const today = new Date().toISOString().slice(0, 10)
    const next: WorkflowMeta = {
      ...meta,
      status: 'review',
      requestNote: trimmedNote || undefined,
      approvers: meta.approvers.map(a => ({ ...a, status: 'pending', comment: '', reviewedAt: '' })),
      history: [
        ...meta.history,
        { at: today, by: currentUser || meta.author || '', action: 'requested', note: trimmedNote || undefined },
      ],
    }
    await writeBack(next)
  }, [writeBack, currentUser])

  const backToDraft = useCallback(async (meta: WorkflowMeta) => {
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
  }, [writeBack, currentUser])

  const decide = useCallback(async (meta: WorkflowMeta, decision: 'approved' | 'rejected', comment: string) => {
    if (!currentUser) return { ok: false, error: '사용자 이름을 설정하세요.' }
    const next = applyDecision(meta, currentUser, decision, comment.trim())
    if (!next) return { ok: false, error: '이 문서의 리뷰어/승인자 목록에 포함되어 있지 않습니다.' }
    await writeBack(next)
    return { ok: true }
  }, [currentUser, writeBack])

  return { savingState, writeBack, initWorkflow, clearWorkflow, addPerson, removePerson, updateFields, setStatus, requestReview, backToDraft, decide }
}

/** Helper to derive whether the current user needs to act on this doc. */
export function deriveMyAction(meta: WorkflowMeta | null, currentUser: string) {
  if (!meta || !currentUser) return { needsMyAction: false }
  if (meta.status !== 'review') return { needsMyAction: false }
  const pending = meta.approvers.some(a => a.name === currentUser && a.status === 'pending')
  return { needsMyAction: pending }
}

export { parseWorkflow }
