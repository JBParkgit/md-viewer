import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useKanbanStore, type KanbanCard } from '../stores/useKanbanStore'

const LABEL_COLORS: Record<string, string> = {
  '긴급': 'bg-red-500',
  '버그': 'bg-orange-500',
  '기능': 'bg-blue-500',
  '개선': 'bg-green-500',
  '문서': 'bg-purple-500',
}

function getLabelColor(label: string) {
  return LABEL_COLORS[label] || 'bg-gray-400'
}

// ── File Picker (browse project files) ──────────────────────────────────────
interface FilePickerProps {
  projectPath: string
  selectedFiles: string[]
  onToggle: (filePath: string) => void
}

function FilePicker({ projectPath, selectedFiles, onToggle }: FilePickerProps) {
  const [files, setFiles] = useState<{ name: string; path: string; type: string }[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      const tree = await window.electronAPI.readDir(projectPath)
      const flat: { name: string; path: string; type: string }[] = []
      const flatten = (nodes: typeof tree, depth = 0) => {
        for (const node of nodes) {
          if (node.name.startsWith('.')) continue
          if (node.type === 'file') {
            // Show relative path from project root
            const rel = node.path.replace(/\\/g, '/').replace(projectPath.replace(/\\/g, '/') + '/', '')
            flat.push({ name: node.name, path: node.path, type: rel })
          }
          if (node.children) flatten(node.children, depth + 1)
        }
      }
      flatten(tree)
      if (!cancelled) { setFiles(flat); setLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [projectPath])

  const filtered = search
    ? files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.type.toLowerCase().includes(search.toLowerCase()))
    : files

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="파일 검색..."
          className="w-full pl-7 pr-2 py-1.5 text-xs border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
        />
        <svg className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <div className="max-h-36 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-3">파일 없음</div>
        ) : (
          filtered.map(f => {
            const isSelected = selectedFiles.includes(f.path)
            return (
              <button
                key={f.path}
                type="button"
                onClick={() => onToggle(f.path)}
                className={`w-full flex items-center gap-2 px-2 py-1 text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-600 dark:text-gray-400'
                }`}
              >
                {isSelected ? (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                )}
                <span className="truncate">{f.type}</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

// ── Card Edit Modal ─────────────────────────────────────────────────────────
interface CardModalProps {
  card: KanbanCard | null
  labels: string[]
  projectPath: string
  onSave: (data: Omit<KanbanCard, 'id' | 'createdAt' | 'completedAt'>) => void
  onClose: () => void
  onOpenFile: (filePath: string, fileName: string) => void
}

function CardModal({ card, labels, projectPath, onSave, onClose, onOpenFile }: CardModalProps) {
  const [title, setTitle] = useState(card?.title ?? '')
  const [description, setDescription] = useState(card?.description ?? '')
  const [assignee, setAssignee] = useState(card?.assignee ?? '')
  const [dueDate, setDueDate] = useState(card?.dueDate ?? '')
  const [selectedLabels, setSelectedLabels] = useState<string[]>(card?.labels ?? [])
  const [linkedFiles, setLinkedFiles] = useState<string[]>(card?.linkedFiles ?? [])
  const [showFilePicker, setShowFilePicker] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    onSave({ title: title.trim(), description, assignee, dueDate, labels: selectedLabels, linkedFiles })
  }

  const toggleLabel = (label: string) => {
    setSelectedLabels(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }

  const toggleFile = (filePath: string) => {
    setLinkedFiles(prev => prev.includes(filePath) ? prev.filter(f => f !== filePath) : [...prev, filePath])
  }

  const getRelPath = (filePath: string) => {
    const norm = filePath.replace(/\\/g, '/')
    const base = projectPath.replace(/\\/g, '/') + '/'
    return norm.startsWith(base) ? norm.slice(base.length) : norm.split('/').pop() || norm
  }
  const getFileName = (filePath: string) => {
    return filePath.replace(/\\/g, '/').split('/').pop() || filePath
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[460px] max-h-[85vh] overflow-y-auto"
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {card ? '카드 수정' : '새 카드'}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-3">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">제목 *</label>
            <input
              ref={inputRef}
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
              placeholder="카드 제목"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">설명</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400 resize-none"
              placeholder="카드 설명"
            />
          </div>

          {/* Assignee + Due Date row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">담당자</label>
              <input
                value={assignee}
                onChange={e => setAssignee(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
                placeholder="이름"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">마감일</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">라벨</label>
            <div className="flex flex-wrap gap-1.5">
              {labels.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleLabel(label)}
                  className={`px-2 py-0.5 text-xs rounded-full transition-all ${
                    selectedLabels.includes(label)
                      ? `${getLabelColor(label)} text-white`
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Linked Files */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">연결 파일</label>
              <button
                type="button"
                onClick={() => setShowFilePicker(!showFilePicker)}
                className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {showFilePicker ? '닫기' : '파일 선택'}
              </button>
            </div>

            {/* Selected files as chips */}
            {linkedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {linkedFiles.map(fp => (
                  <span
                    key={fp}
                    className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                  >
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <button
                      type="button"
                      onClick={() => { onOpenFile(fp, getFileName(fp)); onClose() }}
                      className="truncate max-w-[240px] hover:underline cursor-pointer"
                      title={`열기: ${fp}`}
                    >
                      {getRelPath(fp)}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleFile(fp)}
                      className="hover:text-red-500 ml-0.5"
                      title="연결 해제"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* File picker dropdown */}
            {showFilePicker && (
              <FilePicker
                projectPath={projectPath}
                selectedFiles={linkedFiles}
                onToggle={toggleFile}
              />
            )}

            {!showFilePicker && linkedFiles.length === 0 && (
              <p className="text-xs text-gray-400">"파일 선택" 버튼을 눌러 프로젝트 파일을 연결하세요</p>
            )}
          </div>
        </div>

        <div className="px-5 pb-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            취소
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            {card ? '수정' : '추가'}
          </button>
        </div>
      </form>
    </div>
  )
}

// ── Kanban Card Component ───────────────────────────────────────────────────
interface CardProps {
  card: KanbanCard
  columnId: string
  projectPath: string
  boardId: string
  isArchiveColumn: boolean
  archiveDays: number
  onEdit: (card: KanbanCard, columnId: string) => void
  onOpenFile: (filePath: string, fileName: string) => void
  onDragStart: (e: React.DragEvent, cardId: string, fromColId: string) => void
}

function KanbanCardItem({ card, columnId, projectPath, boardId, isArchiveColumn, archiveDays, onEdit, onOpenFile, onDragStart }: CardProps) {
  const { removeCard, archiveCard } = useKanbanStore()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const isOverdue = card.dueDate && new Date(card.dueDate) < new Date(new Date().toDateString())

  // Calculate remaining days before auto-archive
  let archiveRemaining: number | null = null
  if (isArchiveColumn && card.completedAt) {
    const elapsed = Date.now() - new Date(card.completedAt).getTime()
    const remaining = Math.ceil((archiveDays * 86400000 - elapsed) / 86400000)
    archiveRemaining = remaining > 0 ? remaining : 0
  }
  const [filePopup, setFilePopup] = useState<{ x: number; y: number } | null>(null)

  const getFileName = (fp: string) => fp.replace(/\\/g, '/').split('/').pop() || fp
  const getRelPath = (fp: string) => {
    const norm = fp.replace(/\\/g, '/')
    const base = projectPath.replace(/\\/g, '/') + '/'
    return norm.startsWith(base) ? norm.slice(base.length) : norm.split('/').pop() || norm
  }

  const handleFileClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!card.linkedFiles || card.linkedFiles.length === 0) return
    if (card.linkedFiles.length === 1) {
      const fp = card.linkedFiles[0]
      onOpenFile(fp, getFileName(fp))
    } else {
      setFilePopup(filePopup ? null : { x: e.clientX, y: e.clientY })
    }
  }

  return (
    <div
      draggable
      onDragStart={e => onDragStart(e, card.id, columnId)}
      onClick={() => onEdit(card, columnId)}
      className="bg-white dark:bg-gray-750 rounded-lg border border-gray-200 dark:border-gray-600 p-3 cursor-pointer hover:shadow-md transition-shadow group dark:bg-gray-700/50 relative"
    >
      {/* Labels */}
      {card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {card.labels.map(label => (
            <span key={label} className={`${getLabelColor(label)} w-8 h-1.5 rounded-full block`} />
          ))}
        </div>
      )}

      {/* Title */}
      <div className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug">
        {card.title}
      </div>

      {/* Description preview */}
      {card.description && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
          {card.description}
        </div>
      )}

      {/* Footer: assignee, due, linked file, delete */}
      <div className="flex items-center gap-2 mt-2 text-xs text-gray-400 dark:text-gray-500">
        {card.assignee && (
          <span className="flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            {card.assignee}
          </span>
        )}
        {card.dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {card.dueDate}
          </span>
        )}
        {card.linkedFiles && card.linkedFiles.length > 0 && (
          <button
            onClick={handleFileClick}
            className="flex items-center gap-0.5 hover:text-blue-500 transition-colors"
            title="연결 파일 열기"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
            </svg>
            {card.linkedFiles.length}
          </button>
        )}
        {/* Archive remaining days */}
        {archiveRemaining !== null && (
          <span className={`text-xs ${archiveRemaining <= 1 ? 'text-amber-500' : 'text-gray-400'}`} title={`${archiveRemaining}일 후 자동 아카이브`}>
            {archiveRemaining}일
          </span>
        )}
        {/* Manual archive button */}
        <button
          onClick={e => { e.stopPropagation(); archiveCard(projectPath, boardId, columnId, card.id) }}
          className="opacity-0 group-hover:opacity-100 hover:text-amber-500 transition-all"
          title="아카이브"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </button>
        <button
          onClick={e => { e.stopPropagation(); setShowDeleteConfirm(true) }}
          className="ml-auto opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
          title="삭제"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 z-50" onClick={e => { e.stopPropagation(); setShowDeleteConfirm(false) }} />
          <div
            className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-2xl p-5 min-w-72"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 mb-1">카드 삭제</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              "<span className="font-medium text-gray-700 dark:text-gray-200">{card.title}</span>" 카드를 삭제하시겠습니까?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={e => { e.stopPropagation(); setShowDeleteConfirm(false) }}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                취소
              </button>
              <button
                onClick={e => { e.stopPropagation(); removeCard(projectPath, boardId, columnId, card.id); setShowDeleteConfirm(false) }}
                className="px-3 py-1.5 text-xs rounded-lg bg-red-500 hover:bg-red-600 text-white transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </>
      )}

      {/* File popup for multiple linked files */}
      {filePopup && card.linkedFiles && card.linkedFiles.length > 1 && (
        <>
          <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setFilePopup(null) }} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-56 max-w-80"
            style={{ left: filePopup.x, top: filePopup.y - 8, transform: 'translateY(-100%)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              연결 파일 ({card.linkedFiles.length})
            </div>
            {card.linkedFiles.map(fp => (
              <button
                key={fp}
                onClick={() => { onOpenFile(fp, getFileName(fp)); setFilePopup(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate">{getRelPath(fp)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Single Board Section (collapsible) ──────────────────────────────────────
interface BoardSectionProps {
  board: import('../stores/useKanbanStore').KanbanBoard
  projectPath: string
  onOpenFile: (filePath: string, fileName: string) => void
  isOnly: boolean // can't delete if only board
}

function BoardSection({ board, projectPath, onOpenFile, isOnly }: BoardSectionProps) {
  const {
    removeBoard, renameBoard,
    addColumn, removeColumn, renameColumn,
    addCard, updateCard, moveCard,
    archiveCard, restoreCard, deleteArchivedCard, clearArchive,
    setArchiveDays, setArchiveColumnId,
  } = useKanbanStore()

  const [collapsed, setCollapsed] = useState(false)
  const [modalState, setModalState] = useState<{ card: KanbanCard | null; columnId: string } | null>(null)
  const [editingColId, setEditingColId] = useState<string | null>(null)
  const [newColTitle, setNewColTitle] = useState('')
  const [addingColumn, setAddingColumn] = useState(false)
  const [addColName, setAddColName] = useState('')
  const addColRef = useRef<HTMLInputElement>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [settingsPos, setSettingsPos] = useState<{ x: number; y: number } | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(board.name)

  const dragCard = useRef<{ cardId: string; fromColId: string } | null>(null)

  useEffect(() => { if (addingColumn) addColRef.current?.focus() }, [addingColumn])

  const boardId = board.id

  const handleDragStart = useCallback((e: React.DragEvent, cardId: string, fromColId: string) => {
    dragCard.current = { cardId, fromColId }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', cardId)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent, toColId: string, toIndex: number) => {
    e.preventDefault()
    if (!dragCard.current) return
    moveCard(projectPath, boardId, dragCard.current.fromColId, toColId, dragCard.current.cardId, toIndex)
    dragCard.current = null
  }, [projectPath, boardId, moveCard])

  const handleCardSave = useCallback((data: Omit<KanbanCard, 'id' | 'createdAt' | 'completedAt'>) => {
    if (!modalState) return
    if (modalState.card) {
      updateCard(projectPath, boardId, modalState.columnId, modalState.card.id, data)
    } else {
      addCard(projectPath, boardId, modalState.columnId, data)
    }
    setModalState(null)
  }, [projectPath, boardId, modalState, updateCard, addCard])

  const totalCards = board.columns.reduce((sum, c) => sum + c.cards.length, 0)

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800/50 overflow-hidden">
      {/* Board header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button onClick={() => setCollapsed(!collapsed)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <svg className={`w-4 h-4 transition-transform ${collapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {editingName ? (
          <input autoFocus value={nameValue} onChange={e => setNameValue(e.target.value)}
            onBlur={() => { if (nameValue.trim()) renameBoard(projectPath, boardId, nameValue.trim()); setEditingName(false) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setNameValue(board.name); setEditingName(false) } }}
            className="px-2 py-0.5 text-sm font-semibold bg-white dark:bg-gray-700 border border-blue-400 rounded focus:outline-none" />
        ) : (
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
            onDoubleClick={() => { setEditingName(true); setNameValue(board.name) }}>
            {board.name}
          </h3>
        )}
        <span className="text-xs text-gray-400">{totalCards} cards · {board.columns.length} columns</span>

        <div className="ml-auto flex items-center gap-1">
          {/* Archive */}
          <button onClick={() => setShowArchive(!showArchive)}
            className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded-md transition-colors ${showArchive ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'}`}>
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
            {board.archivedCards.length > 0 ? board.archivedCards.length : ''}
          </button>
          {/* Settings */}
            <button onClick={(e) => setSettingsPos(settingsPos ? null : { x: e.clientX, y: e.clientY })}
              className={`w-6 h-6 flex items-center justify-center rounded-md transition-colors ${settingsPos ? 'bg-gray-200 dark:bg-gray-600 text-gray-700' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400'}`}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            {settingsPos && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSettingsPos(null)} />
                <div className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-xl shadow-xl p-4 w-64"
                  style={{ left: Math.min(settingsPos.x, window.innerWidth - 280), top: settingsPos.y + 8 }}>
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-3">보드 설정</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">보드 이름</label>
                      <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)}
                        onBlur={() => { if (nameValue.trim()) renameBoard(projectPath, boardId, nameValue.trim()) }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">자동 아카이브 기간 (일)</label>
                      <input type="number" min={1} max={365} value={board.archiveDays}
                        onChange={e => { const v = parseInt(e.target.value); if (v > 0) setArchiveDays(projectPath, boardId, v) }}
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">아카이브 대상 컬럼</label>
                      <select value={board.archiveColumnId} onChange={e => setArchiveColumnId(projectPath, boardId, e.target.value)}
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400">
                        {board.columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              </>
            )}
          {/* Delete board */}
          {!isOnly && (
            <button onClick={() => { if (confirm(`"${board.name}" 보드를 삭제할까요?`)) removeBoard(projectPath, boardId) }}
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Archive panel */}
      {showArchive && !collapsed && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-amber-50/50 dark:bg-amber-900/10 max-h-48 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-1.5">
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">아카이브 ({board.archivedCards.length})</span>
            {board.archivedCards.length > 0 && (
              <button onClick={() => { if (confirm('아카이브된 카드를 모두 삭제할까요?')) clearArchive(projectPath, boardId) }}
                className="text-xs text-red-400 hover:text-red-600">전체 삭제</button>
            )}
          </div>
          {board.archivedCards.length === 0 ? (
            <div className="px-4 pb-2 text-xs text-gray-400">아카이브된 카드가 없습니다</div>
          ) : (
            <div className="px-4 pb-2 space-y-1">
              {board.archivedCards.map(card => (
                <div key={card.id} className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{card.title}</div>
                  </div>
                  <button onClick={() => restoreCard(projectPath, boardId, card.id)}
                    className="px-2 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">복원</button>
                  <button onClick={() => deleteArchivedCard(projectPath, boardId, card.id)}
                    className="text-gray-400 hover:text-red-500">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Columns */}
      {!collapsed && (
        <div className="overflow-x-auto">
          <div className="flex gap-3 p-3 min-w-min">
            {board.columns.map(col => (
              <div key={col.id} className="flex flex-col w-64 flex-shrink-0 bg-gray-50 dark:bg-gray-800/60 rounded-lg"
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                onDrop={e => handleDrop(e, col.id, col.cards.length)}>
                {/* Column header */}
                <div className="flex items-center justify-between px-2.5 py-2 group">
                  {editingColId === col.id ? (
                    <input autoFocus value={newColTitle} onChange={e => setNewColTitle(e.target.value)}
                      onBlur={() => { if (newColTitle.trim()) renameColumn(projectPath, boardId, col.id, newColTitle.trim()); setEditingColId(null) }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingColId(null) }}
                      className="text-xs font-semibold bg-white dark:bg-gray-700 px-2 py-0.5 rounded border border-blue-400 focus:outline-none w-full" />
                  ) : (
                    <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600"
                      onClick={() => { setEditingColId(col.id); setNewColTitle(col.title) }}>
                      {col.title}
                      {col.id === board.archiveColumnId && <span className="ml-1 text-amber-500">*</span>}
                      <span className="ml-1.5 font-normal text-gray-400">{col.cards.length}</span>
                    </h4>
                  )}
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setModalState({ card: null, columnId: col.id })}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-blue-500">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    </button>
                    <button onClick={() => { if (col.cards.length > 0 && !confirm(`"${col.title}" 컬럼 삭제?`)) return; removeColumn(projectPath, boardId, col.id) }}
                      className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-red-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
                {/* Cards */}
                <div className="flex-1 overflow-y-auto px-1.5 pb-1.5 space-y-1.5 max-h-80 min-h-[40px]">
                  {col.cards.map((card, idx) => (
                    <div key={card.id} onDragOver={e => { e.preventDefault(); e.stopPropagation() }} onDrop={e => { e.stopPropagation(); handleDrop(e, col.id, idx) }}>
                      <KanbanCardItem card={card} columnId={col.id} projectPath={projectPath} boardId={boardId}
                        isArchiveColumn={col.id === board.archiveColumnId} archiveDays={board.archiveDays}
                        onEdit={(c, cId) => setModalState({ card: c, columnId: cId })} onOpenFile={onOpenFile} onDragStart={handleDragStart} />
                    </div>
                  ))}
                </div>
                <button onClick={() => setModalState({ card: null, columnId: col.id })}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700/50 rounded-b-lg transition-colors">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  추가
                </button>
              </div>
            ))}
            {/* Add column */}
            <div className="w-64 flex-shrink-0">
              {addingColumn ? (
                <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2.5">
                  <input ref={addColRef} value={addColName} onChange={e => setAddColName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && addColName.trim()) { addColumn(projectPath, boardId, addColName.trim()); setAddColName(''); setAddingColumn(false) }
                      if (e.key === 'Escape') { setAddingColumn(false); setAddColName('') }
                    }}
                    placeholder="컬럼 이름" className="w-full px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400 mb-1.5" />
                  <div className="flex gap-1.5">
                    <button onClick={() => { if (addColName.trim()) { addColumn(projectPath, boardId, addColName.trim()); setAddColName(''); setAddingColumn(false) } }}
                      className="px-2.5 py-0.5 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white">추가</button>
                    <button onClick={() => { setAddingColumn(false); setAddColName('') }}
                      className="px-2.5 py-0.5 text-xs rounded bg-gray-200 dark:bg-gray-700">취소</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingColumn(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-xs">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  컬럼 추가
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Card modal */}
      {modalState && (
        <CardModal card={modalState.card} labels={board.labels} projectPath={projectPath}
          onSave={handleCardSave} onClose={() => setModalState(null)} onOpenFile={onOpenFile} />
      )}
    </div>
  )
}

// ── Main Kanban Board (all boards) ──────────────────────────────────────────
interface KanbanBoardProps {
  onOpenFile: (filePath: string, fileName: string) => void
}

export default function KanbanBoard({ onOpenFile }: KanbanBoardProps) {
  const projects = useAppStore(s => s.projects)
  const activeProjectPath = useAppStore(s => s.kanbanProjectPath)
  const setKanbanProjectPath = useAppStore(s => s.setKanbanProjectPath)
  const { projects: kanbanProjects, loading, loadProject, addBoard } = useKanbanStore()

  const [addingBoard, setAddingBoard] = useState(false)
  const [newBoardName, setNewBoardName] = useState('')
  const newBoardRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activeProjectPath) loadProject(activeProjectPath)
  }, [activeProjectPath, loadProject])

  useEffect(() => {
    if (!activeProjectPath && projects.length > 0) setKanbanProjectPath(projects[0].path)
  }, [projects, activeProjectPath, setKanbanProjectPath])

  useEffect(() => { if (addingBoard) newBoardRef.current?.focus() }, [addingBoard])

  const kanbanProject = activeProjectPath ? kanbanProjects[activeProjectPath] : null
  const selectedProject = projects.find(p => p.path === activeProjectPath)

  if (!activeProjectPath || !selectedProject) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-gray-400 dark:text-gray-500">
        <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        <p className="text-sm">좌측 패널에서 프로젝트를 선택하세요</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
        </svg>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{selectedProject.name}</span>
        {loading && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
        <div className="ml-auto">
          {addingBoard ? (
            <div className="flex items-center gap-1">
              <input ref={newBoardRef} value={newBoardName} onChange={e => setNewBoardName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newBoardName.trim() && activeProjectPath) { addBoard(activeProjectPath, newBoardName.trim()); setNewBoardName(''); setAddingBoard(false) }
                  if (e.key === 'Escape') { setAddingBoard(false); setNewBoardName('') }
                }}
                onBlur={() => { setAddingBoard(false); setNewBoardName('') }}
                placeholder="보드 이름" className="px-2 py-0.5 text-xs bg-white dark:bg-gray-700 border border-blue-400 rounded focus:outline-none w-28" />
            </div>
          ) : (
            <button onClick={() => setAddingBoard(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              새 보드
            </button>
          )}
        </div>
      </div>

      {/* All boards stacked */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {kanbanProject?.boards.map(b => (
          <BoardSection key={b.id} board={b} projectPath={activeProjectPath} onOpenFile={onOpenFile}
            isOnly={kanbanProject.boards.length <= 1} />
        ))}
      </div>
    </div>
  )
}
