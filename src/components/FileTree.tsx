import { useState, useRef } from 'react'
import { useAppStore, PREDEFINED_TAGS } from '../stores/useAppStore'
import { getFileGroup, FileTypeIcon } from '../utils/fileType'
import type { FileNode } from '../types/electron'

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

interface FileRowProps {
  node: FileNode
  onOpenFile: (filePath: string, fileName: string) => void
  onOpenFilePinned: (filePath: string, fileName: string) => void
  searchQuery: string
  depth: number
  projectId?: string
  openDirs?: Set<string>
  toggleDir?: (path: string, open: boolean) => void
}

function FileRow({ node, onOpenFile, onOpenFilePinned, searchQuery, depth, projectId, openDirs, toggleDir }: FileRowProps) {
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
  const { favorites, addFavorite, removeFavorite, tabs, activeTabId, closeTab, fileTags, addFileTag, removeFileTag, setLastOpenedDir } = useAppStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const nodeTags = fileTags[node.path] || []

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
    e.dataTransfer.effectAllowed = 'copyMove'
    e.dataTransfer.setData('application/x-filepath', node.path)
    e.stopPropagation()
  }

  // Drop target handler (for directories)
  const handleDirDrop = async (e: React.DragEvent, targetDirPath?: string) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const srcPath = e.dataTransfer.getData('application/x-filepath')
    if (!srcPath) return
    const destDir = targetDirPath || node.path
    if (srcPath === destDir) return
    // Don't drop a parent into its own child
    if (destDir.startsWith(srcPath + '\\') || destDir.startsWith(srcPath + '/')) return
    const result = await window.electronAPI.move(srcPath, destDir)
    if (!result.success) {
      alert(result.error || '이동 실패')
    }
  }

  const handleDirDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-filepath')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
    }
  }

  const handleDirDragLeave = () => setIsDragOver(false)

  const isFav = favorites.includes(node.path)
  const isActiveFile = tabs.find(t => t.id === activeTabId)?.filePath === node.path
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
          onClick={() => {
            const willOpen = !open
            setOpen(willOpen)
            if (willOpen && projectId) setLastOpenedDir(projectId, displayNode.path)
          }}
          className={`flex items-center gap-1.5 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs ${isDragOver ? 'bg-blue-50 dark:bg-blue-900/30 outline outline-1 outline-blue-400' : ''}`}
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
              className="flex-1 text-xs px-1 py-0 rounded border border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
            />
          ) : (
            <span className="truncate text-gray-700 dark:text-gray-300">
              <Highlighted text={compactName} query={searchQuery} />
            </span>
          )}
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
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── File ───────────────────────────────────────────────────────────────
  // 싱글클릭 = preview 탭 / 더블클릭 = 고정 탭 (md·이미지)
  // 그 외 파일 = 더블클릭 → OS 기본 앱
  const handleClick = () => {
    if (isInApp) onOpenFile(node.path, node.name)
  }

  const handleDoubleClick = () => {
    if (isInApp) {
      onOpenFilePinned(node.path, node.name)
    } else {
      window.electronAPI.openPath(node.path)
    }
  }

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }) }}
        className={`flex items-center gap-1.5 py-1 rounded text-xs group ${
          isInApp ? 'cursor-pointer' : 'cursor-default'
        } ${
          isActiveFile
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
            : isInApp
              ? 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-500 dark:text-gray-500'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px' }}
        title={isInApp ? node.path : `더블클릭으로 열기: ${node.path}`}
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
            className="flex-1 text-xs px-1 py-0 rounded border border-blue-400 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
          />
        ) : (
          <span className="flex-1 truncate">
            <Highlighted text={node.name} query={searchQuery} />
          </span>
        )}
        {nodeTags.map(tagId => {
          const tag = PREDEFINED_TAGS.find(t => t.id === tagId)
          if (!tag) return null
          return (
            <span key={tagId} className={`px-1 py-0 rounded text-[9px] leading-tight flex-shrink-0 ${tag.color}`}>
              {tag.label}
            </span>
          )
        })}
        {isFav && (
          <svg className="w-3 h-3 text-yellow-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
          </svg>
        )}
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
            <div className="my-1 border-t border-gray-100 dark:border-gray-700" />
            <div className="relative">
              <button
                onClick={() => setShowTagMenu(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                태그 관리
                <svg className="w-3 h-3 ml-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
              {showTagMenu && (
                <div className="mt-0.5 mx-1 mb-1 bg-gray-50 dark:bg-gray-750 rounded-md border border-gray-100 dark:border-gray-600">
                  {PREDEFINED_TAGS.map(tag => {
                    const hasTag = nodeTags.includes(tag.id)
                    return (
                      <button
                        key={tag.id}
                        onClick={() => { hasTag ? removeFileTag(node.path, tag.id) : addFileTag(node.path, tag.id) }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                      >
                        <span className={`w-3 h-3 rounded-sm flex items-center justify-center border ${hasTag ? 'bg-blue-500 border-blue-500 text-white' : 'border-gray-300 dark:border-gray-500'}`}>
                          {hasTag && (
                            <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${tag.color}`}>{tag.label}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
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
}

export default function FileTree({ nodes, onOpenFile, onOpenFilePinned, searchQuery, depth = 0, projectId, openDirs, toggleDir }: Props) {
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
        />
      ))}
    </div>
  )
}
