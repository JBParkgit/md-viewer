import { useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
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
}

function FileRow({ node, onOpenFile, onOpenFilePinned, searchQuery, depth }: FileRowProps) {
  const [open, setOpen] = useState(!!searchQuery)
  const { favorites, addFavorite, removeFavorite, tabs, activeTabId } = useAppStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const isFav = favorites.includes(node.path)
  const isActiveFile = tabs.find(t => t.id === activeTabId)?.filePath === node.path
  const group = getFileGroup(node.name)
  const isMd = group === 'md'
  const isImage = group === 'image'
  const isInApp = isMd || isImage

  // ── Directory ──────────────────────────────────────────────────────────
  if (node.type === 'directory') {
    return (
      <div>
        <div
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-xs"
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
          <span className="truncate text-gray-700 dark:text-gray-300">
            <Highlighted text={node.name} query={searchQuery} />
          </span>
        </div>
        {open && node.children && node.children.length > 0 && (
          <div>
            {node.children.map(child => (
              <FileRow
                key={child.path}
                node={child}
                onOpenFile={onOpenFile}
                onOpenFilePinned={onOpenFilePinned}
                searchQuery={searchQuery}
                depth={depth + 1}
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
        <span className="flex-1 truncate">
          <Highlighted text={node.name} query={searchQuery} />
        </span>
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
}

export default function FileTree({ nodes, onOpenFile, onOpenFilePinned, searchQuery, depth = 0 }: Props) {
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
        />
      ))}
    </div>
  )
}
