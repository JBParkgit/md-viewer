import { useState, useRef, useMemo, useEffect } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { useWorkflowStore } from '../stores/useWorkflowStore'
import { WORKFLOW_STATUS_ICONS, WORKFLOW_STATUS_COLORS } from '../utils/frontmatter'
import FileHistoryModal from './FileHistoryModal'
import { getFileGroup, FileTypeIcon } from '../utils/fileType'
import type { FileNode } from '../types/electron'
import type { GitStatusMap } from './ProjectTree'

// ── Highlight matched text ─────────────────────────────────────────────────

function Highlighted({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ── File row ───────────────────────────────────────────────────────────────

interface SelectionProps {
  selectedPaths: Set<string>
  lastClickedPath: string | null
  onSelect: (path: string, e: React.MouseEvent) => void
}

interface FileRowProps {
  node: FileNode
  onOpenFile: (filePath: string, fileName: string) => void
  onOpenFilePinned: (filePath: string, fileName: string) => void
  searchQuery: string
  depth: number
  projectId?: string
  openDirs?: Set<string>
  toggleDir?: (path: string, open: boolean) => void
  gitStatusMap?: GitStatusMap
  projectPath?: string
  selection?: SelectionProps
  flatPaths?: string[]
}

function getDirGitStatus(dirPath: string, gitStatusMap?: GitStatusMap, projectPath?: string): { modified: number; added: number; deleted: number } | null {
  if (!gitStatusMap || !projectPath || Object.keys(gitStatusMap).length === 0) return null
  const normProject = projectPath.replace(/\\/g, '/')
  const normDir = dirPath.replace(/\\/g, '/')
  const projectPrefix = normProject.endsWith('/') ? normProject : normProject + '/'
  if (!normDir.startsWith(projectPrefix)) return null
  const dirRel = normDir.slice(projectPrefix.length) + '/'
  let modified = 0, added = 0, deleted = 0
  for (const [file, entry] of Object.entries(gitStatusMap)) {
    if (!file.startsWith(dirRel)) continue
    const st = entry.worktree !== ' ' && entry.worktree !== '?' ? entry.worktree : entry.index
    if (st === 'M') modified++
    else if (st === 'D') deleted++
    else added++ // A, ?, R, etc.
  }
  if (modified + added + deleted === 0) return null
  return { modified, added, deleted }
}

function getGitDot(node: FileNode, gitStatusMap?: GitStatusMap, projectPath?: string): { color: string; letter: string; title: string } | null {
  if (!gitStatusMap || !projectPath || Object.keys(gitStatusMap).length === 0) return null
  // Normalize both paths to forward slashes for comparison
  const normProject = projectPath.replace(/\\/g, '/')
  const normNode = node.path.replace(/\\/g, '/')
  const prefix = normProject.endsWith('/') ? normProject : normProject + '/'
  if (!normNode.startsWith(prefix)) return null
  const rel = normNode.slice(prefix.length)
  if (!rel) return null
  const entry = gitStatusMap[rel]
  if (!entry) return null
  const st = entry.worktree !== ' ' && entry.worktree !== '?' ? entry.worktree : entry.index
  if (st === 'M') return { color: 'text-orange-500', letter: 'M', title: '수정됨' }
  if (st === 'A' || entry.index === '?' || entry.worktree === '?') return { color: 'text-green-500', letter: entry.index === '?' ? 'U' : 'A', title: entry.index === '?' ? '추적 안됨' : '추가됨' }
  if (st === 'D') return { color: 'text-red-500', letter: 'D', title: '삭제됨' }
  if (st === 'R') return { color: 'text-blue-500', letter: 'R', title: '이름변경' }
  return { color: 'text-gray-500', letter: st, title: st }
}

function FileRow({ node, onOpenFile, onOpenFilePinned, searchQuery, depth, projectId, openDirs, toggleDir, gitStatusMap, projectPath, selection, flatPaths }: FileRowProps) {
  const controlled = openDirs !== undefined && toggleDir !== undefined
  const [localOpen, setLocalOpen] = useState(!!searchQuery)
  const open = controlled ? openDirs.has(node.path) : localOpen
  const setOpen = (v: boolean | ((prev: boolean) => boolean)) => {
    const newVal = typeof v === 'function' ? v(open) : v
    if (controlled) {
      toggleDir(node.path, newVal)
    } else {
      setLocalOpen(newVal)
    }
  }
  const { favorites, addFavorite, removeFavorite, tabs, activeTabId, closeTab, setLastOpenedDir, markTabSaved } = useAppStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const currentUser = useAppStore(s => s.currentUser)
  const workflowEntry = useWorkflowStore(s => s.entries[node.path])
  const workflowMeta = workflowEntry?.meta
  const needsMyAction = !!workflowMeta && !!currentUser && workflowMeta.status === 'review' &&
    workflowMeta.approvers.some(a => a.name === currentUser && a.status === 'pending')

  const isSelected = selection?.selectedPaths.has(node.path) ?? false

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Delete' && !isRenaming) {
      e.preventDefault()
      const targets = selection && selection.selectedPaths.size > 1 && isSelected
        ? [...selection.selectedPaths]
        : [node.path]
      const msg = targets.length > 1
        ? `${targets.length}개 항목을 휴지통으로 이동하시겠습니까?`
        : `"${node.name}" ${node.type === 'directory' ? '폴더' : '파일'}을 휴지통으로 이동하시겠습니까?`
      if (!window.confirm(msg)) return
      targets.forEach(p => {
        window.electronAPI.deleteFile(p).then(result => {
          if (result.success) {
            const openTab = tabs.find(t => t.filePath === p)
            if (openTab) closeTab(openTab.id)
          }
        })
      })
    }
    if (e.key === 'F2' && !isRenaming) {
      e.preventDefault()
      startRename()
    }
  }

  const startRename = () => {
    setContextMenu(null)
    setRenameValue(node.name)
    setIsRenaming(true)
    setTimeout(() => {
      const input = renameInputRef.current
      if (input) {
        input.focus()
        // Select filename without extension for files
        if (node.type === 'file') {
          const dotIdx = node.name.lastIndexOf('.')
          input.setSelectionRange(0, dotIdx > 0 ? dotIdx : node.name.length)
        } else {
          input.select()
        }
      }
    }, 0)
  }

  const commitRename = async () => {
    const newName = renameValue.trim()
    if (!newName || newName === node.name) { setIsRenaming(false); return }
    const result = await window.electronAPI.renameFile(node.path, newName)
    if (!result.success) {
      alert(result.error || '이름 변경 실패')
    }
    setIsRenaming(false)
  }

  const cancelRename = () => {
    setIsRenaming(false)
    setRenameValue('')
  }

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation()
    if (e.key === 'Enter') commitRename()
    else if (e.key === 'Escape') cancelRename()
  }

  // Drag-and-drop: make items draggable
  const handleDragStart = (e: React.DragEvent) => {
    const group = getFileGroup(node.name)
    if (group === 'image' || group === 'video') {
      e.preventDefault()
      window.electronAPI.startDrag(node.path)
    } else {
      e.dataTransfer.effectAllowed = 'copyMove'
      // If multiple selected and this item is selected, drag all selected
      const paths = (selection && selection.selectedPaths.size > 1 && isSelected)
        ? [...selection.selectedPaths]
        : [node.path]
      e.dataTransfer.setData('application/x-filepaths', JSON.stringify(paths))
      e.dataTransfer.setData('application/x-filepath', node.path) // backward compat
      e.stopPropagation()
    }
  }

  // Drop target handler (for directories)
  const handleDirDrop = async (e: React.DragEvent, targetDirPath?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const destDir = targetDirPath || node.path
    // Try multi-path first, fallback to single
    const multiData = e.dataTransfer.getData('application/x-filepaths')
    const srcPaths: string[] = multiData ? JSON.parse(multiData) : []
    if (srcPaths.length === 0) {
      const single = e.dataTransfer.getData('application/x-filepath')
      if (single) srcPaths.push(single)
    }
    if (srcPaths.length === 0) return
    for (const srcPath of srcPaths) {
      if (srcPath === destDir) continue
      if (destDir.startsWith(srcPath + '\\') || destDir.startsWith(srcPath + '/')) continue
      const result = await window.electronAPI.move(srcPath, destDir)
      if (!result.success) {
        alert(result.error || '이동 실패')
      }
    }
  }

  const handleDirDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-filepath') || e.dataTransfer.types.includes('application/x-filepaths')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
    }
  }

  const handleDirDragLeave = () => setIsDragOver(false)

  const isFav = favorites.includes(node.path)
  const isActiveFile = tabs.find(t => t.id === activeTabId)?.filePath === node.path
  const activeRowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActiveFile && activeRowRef.current) {
      activeRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isActiveFile])
  const group = getFileGroup(node.name)
  const isMd = group === 'md'
  const isImage = group === 'image'
  const isPdf = group === 'pdf'
  const isDocx = group === 'word'
  const isText = group === 'text'
  const isVideo = group === 'video'
  const isInApp = isMd || isImage || isPdf || isDocx || isText || isVideo

  // ── Directory (compact / antigravity) ──────────────────────────────────
  if (node.type === 'directory') {
    // Compact single-child directory chains into one line (e.g. src/utils/helpers)
    let displayNode = node
    let compactName = node.name
    while (
      displayNode.children &&
      displayNode.children.length === 1 &&
      displayNode.children[0].type === 'directory'
    ) {
      displayNode = displayNode.children[0]
      compactName += ' / ' + displayNode.name
    }
    const effectiveChildren = displayNode.children

    return (
      <div>
        <div
          draggable
          onDragStart={handleDragStart}
          onDrop={(e) => handleDirDrop(e, displayNode.path)}
          onDragOver={handleDirDragOver}
          onDragLeave={handleDirDragLeave}
          onClick={(e) => {
            if (e.ctrlKey || e.metaKey || e.shiftKey) {
              selection?.onSelect(node.path, e)
              return
            }
            const willOpen = !open
            setOpen(willOpen)
            if (willOpen && projectId) setLastOpenedDir(projectId, displayNode.path)
            selection?.onSelect(node.path, e)
          }}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          className={`flex items-center gap-1.5 py-1 cursor-pointer rounded text-xs focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 ${
            isDragOver ? 'bg-blue-50 dark:bg-blue-900/30 outline outline-1 outline-blue-400'
            : isSelected ? 'bg-blue-100 dark:bg-blue-900/40'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700'
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px' }}
        >
          <svg
            className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <svg className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onKeyDown={handleRenameKeyDown}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
              className="flex-1 text-xs px-1 py-0 rounded border border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 min-w-0"
            />
          ) : (
            <span className="truncate text-gray-700 dark:text-gray-300">
              <Highlighted text={compactName} query={searchQuery} />
            </span>
          )}
          {(() => {
            const dirStatus = getDirGitStatus(displayNode.path, gitStatusMap, projectPath)
            if (!dirStatus) return null
            const { modified, added, deleted } = dirStatus
            const total = modified + added + deleted
            const color = modified > 0 ? 'text-orange-500' : deleted > 0 ? 'text-red-500' : 'text-green-500'
            return (
              <span className={`text-[9px] font-bold flex-shrink-0 ${color}`} title={`변경 ${total}개 (수정 ${modified}, 추가 ${added}, 삭제 ${deleted})`}>{total}</span>
            )
          })()}
        </div>
        {open && effectiveChildren && effectiveChildren.length > 0 && (
          <div>
            {effectiveChildren.map(child => (
              <FileRow
                key={child.path}
                node={child}
                onOpenFile={onOpenFile}
                onOpenFilePinned={onOpenFilePinned}
                searchQuery={searchQuery}
                depth={depth + 1}
                projectId={projectId}
                openDirs={openDirs}
                toggleDir={toggleDir}
                gitStatusMap={gitStatusMap}
                projectPath={projectPath}
                selection={selection}
                flatPaths={flatPaths}
              />
            ))}
          </div>
        )}

        {/* Directory context menu */}
        {contextMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
            <div
              className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-44"
              style={{ left: contextMenu.x, top: contextMenu.y }}
            >
              <button
                onClick={() => { setContextMenu(null); startRename() }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                이름 변경
              </button>
              <button
                onClick={() => { window.electronAPI.showItemInFolder(displayNode.path); setContextMenu(null) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
                탐색기에서 보기
              </button>
              <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              <button
                onClick={async () => {
                  setContextMenu(null)
                  if (!window.confirm(`"${displayNode.name}" 폴더를 휴지통으로 이동하시겠습니까?`)) return
                  await window.electronAPI.deleteFile(displayNode.path)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                삭제
              </button>
            </div>
          </>
        )}
      </div>
    )
  }

  // ── File ───────────────────────────────────────────────────────────────
  const handleClick = (e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      selection?.onSelect(node.path, e)
      return
    }
    selection?.onSelect(node.path, e)
    onOpenFile(node.path, node.name)
  }

  const handleDoubleClick = () => {
    onOpenFilePinned(node.path, node.name)
  }

  return (
    <>
      <div
        ref={isActiveFile ? activeRowRef : undefined}
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className={`flex items-center gap-1.5 py-1 rounded text-xs group cursor-pointer focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 ${
          isActiveFile
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : isSelected
            ? 'bg-blue-200 dark:bg-blue-800/60 text-gray-800 dark:text-gray-200'
            : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px' }}
        title={node.path}
      >
        <FileTypeIcon name={node.name} />
        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={handleRenameKeyDown}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
            className="flex-1 text-xs px-1 py-0 rounded border border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400 min-w-0"
          />
        ) : (
          <span className="flex-1 truncate">
            <Highlighted text={node.name} query={searchQuery} />
          </span>
        )}
        {workflowMeta && (
          <span
            className={`px-1 py-0 rounded text-[9px] leading-tight flex-shrink-0 ${WORKFLOW_STATUS_COLORS[workflowMeta.status]}`}
            title={`워크플로우: ${workflowMeta.status}`}
          >
            {WORKFLOW_STATUS_ICONS[workflowMeta.status]}
          </span>
        )}
        {needsMyAction && (
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" title="내 액션 필요" />
        )}
        {isFav && (
          <svg className="w-3 h-3 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        )}
        {(() => {
          const dot = getGitDot(node, gitStatusMap, projectPath)
          if (!dot) return null
          return <span className={`text-[10px] font-bold flex-shrink-0 ${dot.color}`} title={dot.title}>{dot.letter}</span>
        })()}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-44"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {isInApp && (
              <>
                <button
                  onClick={() => { onOpenFile(node.path, node.name); setContextMenu(null) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                >
                  <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  미리보기 탭으로 열기
                </button>
                <button
                  onClick={() => { onOpenFilePinned(node.path, node.name); setContextMenu(null) }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                >
                  <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                  </svg>
                  고정 탭으로 열기
                </button>
                <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
              </>
            )}
            <button
              onClick={() => { window.electronAPI.openPath(node.path); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              기본 앱으로 열기
            </button>
            {/\.(md|markdown)$/i.test(node.name) && (
              <button
                onClick={async () => {
                  setContextMenu(null)
                  const res = await window.electronAPI.openInObsidian(node.path)
                  if (!res.success) {
                    alert(res.error || 'Obsidian을 열 수 없습니다. Obsidian이 설치되어 있고 이 파일이 vault 안에 있는지 확인하세요.')
                  }
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                📝 Obsidian에서 열기
              </button>
            )}
            <button
              onClick={() => { window.electronAPI.showItemInFolder(node.path); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              탐색기에서 보기
            </button>
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
              onClick={() => { isFav ? removeFavorite(node.path) : addFavorite(node.path); setContextMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className={`w-3.5 h-3.5 ${isFav ? 'text-yellow-400' : 'text-gray-400'}`} fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              {isFav ? '즐겨찾기 제거' : '즐겨찾기 추가'}
            </button>
            {projectPath && (
              <button
                onClick={() => { setContextMenu(null); setShowHistory(true) }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                📜 이 파일의 이력
              </button>
            )}
            {(() => {
              const dot = getGitDot(node, gitStatusMap, projectPath)
              if (!dot || !projectPath) return null
              const normProject = projectPath.replace(/\\/g, '/')
              const normNode = node.path.replace(/\\/g, '/')
              const pfx = normProject.endsWith('/') ? normProject : normProject + '/'
              const rel = normNode.startsWith(pfx) ? normNode.slice(pfx.length) : null
              if (!rel) return null
              const entry = gitStatusMap?.[rel]
              if (!entry) return null
              return (
                <>
                  <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
                  {entry.worktree !== ' ' && entry.index !== '?' ? (
                    <button
                      onClick={async () => {
                        setContextMenu(null)
                        await window.electronAPI.gitStage(projectPath, rel)
                        window.dispatchEvent(new CustomEvent('git-status-changed', { detail: projectPath }))
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    >
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Stage
                    </button>
                  ) : null}
                  {entry.index !== ' ' && entry.index !== '?' ? (
                    <button
                      onClick={async () => {
                        setContextMenu(null)
                        await window.electronAPI.gitUnstage(projectPath, rel)
                        window.dispatchEvent(new CustomEvent('git-status-changed', { detail: projectPath }))
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    >
                      <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                      Unstage
                    </button>
                  ) : null}
                  {entry.index === '?' ? (
                    <button
                      onClick={async () => {
                        setContextMenu(null)
                        await window.electronAPI.gitStage(projectPath, rel)
                        window.dispatchEvent(new CustomEvent('git-status-changed', { detail: projectPath }))
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    >
                      <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Stage
                    </button>
                  ) : null}
                  {entry.worktree === 'M' || entry.worktree === 'D' ? (
                    <button
                      onClick={async () => {
                        setContextMenu(null)
                        if (!window.confirm(`"${node.name}" 파일의 변경사항을 취소하시겠습니까?`)) return
                        const res = await window.electronAPI.gitDiscard(projectPath, rel)
                        if (!res.success) {
                          alert(res.error || '변경 취소 실패')
                          return
                        }
                        // Refresh git status indicators
                        window.dispatchEvent(new CustomEvent('git-status-changed', { detail: projectPath }))
                        // If this file is open in a tab, reload its content from disk
                        const openTab = tabs.find(t => t.filePath === node.path)
                        if (openTab) {
                          const reloaded = await window.electronAPI.readFile(node.path)
                          if (reloaded.success && reloaded.content !== undefined) {
                            markTabSaved(openTab.id, reloaded.content)
                          }
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      변경 취소
                    </button>
                  ) : null}
                </>
              )
            })()}
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <button
              onClick={() => { setContextMenu(null); startRename() }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              이름 변경
            </button>
            <button
              onClick={async () => {
                setContextMenu(null)
                if (!window.confirm(`"${node.name}" 파일을 휴지통으로 이동하시겠습니까?`)) return
                const result = await window.electronAPI.deleteFile(node.path)
                if (result.success) {
                  // Close tab if open
                  const openTab = tabs.find(t => t.filePath === node.path)
                  if (openTab) closeTab(openTab.id)
                } else {
                  alert(result.error || '삭제 실패')
                }
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 text-left"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              삭제
            </button>
          </div>
        </>
      )}

      {showHistory && projectPath && (() => {
        const normProject = projectPath.replace(/\\/g, '/')
        const normNode = node.path.replace(/\\/g, '/')
        const pfx = normProject.endsWith('/') ? normProject : normProject + '/'
        const rel = normNode.startsWith(pfx) ? normNode.slice(pfx.length) : null
        if (!rel) return null
        return (
          <FileHistoryModal
            filePath={node.path}
            projectPath={projectPath}
            relativePath={rel}
            fileName={node.name}
            onClose={() => setShowHistory(false)}
          />
        )
      })()}
    </>
  )
}

// ── Tree root ──────────────────────────────────────────────────────────────

interface Props {
  nodes: FileNode[]
  onOpenFile: (filePath: string, fileName: string) => void
  onOpenFilePinned: (filePath: string, fileName: string) => void
  searchQuery: string
  depth?: number
  projectId?: string
  openDirs?: Set<string>
  toggleDir?: (path: string, open: boolean) => void
  gitStatusMap?: GitStatusMap
  projectPath?: string
  selection?: SelectionProps
}

function collectPaths(nodes: FileNode[]): string[] {
  const result: string[] = []
  for (const node of nodes) {
    result.push(node.path)
    if (node.children) result.push(...collectPaths(node.children))
  }
  return result
}

export default function FileTree({ nodes, onOpenFile, onOpenFilePinned, searchQuery, depth = 0, projectId, openDirs, toggleDir, gitStatusMap, projectPath, selection }: Props) {
  const flatPaths = useMemo(() => collectPaths(nodes), [nodes])
  if (nodes.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-gray-400">
        {searchQuery ? '검색 결과 없음' : '파일 없음'}
      </div>
    )
  }
  return (
    <div className="py-0.5">
      {nodes.map(node => (
        <FileRow
          key={node.path}
          node={node}
          onOpenFile={onOpenFile}
          onOpenFilePinned={onOpenFilePinned}
          searchQuery={searchQuery}
          depth={depth}
          projectId={projectId}
          openDirs={openDirs}
          toggleDir={toggleDir}
          gitStatusMap={gitStatusMap}
          projectPath={projectPath}
          selection={selection}
          flatPaths={flatPaths}
        />
      ))}
    </div>
  )
}
