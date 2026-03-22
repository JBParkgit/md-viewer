import { useEffect, useRef, useState, useCallback, type WheelEvent, type MouseEvent } from 'react'
import { useAppStore, type Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
  onOpenFile?: (filePath: string, fileName: string) => void
}

interface ImgInfo {
  naturalW: number
  naturalH: number
  fileSize: string
}

const ZOOM_LEVELS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5]

function toFileUrl(filePath: string) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function ImageViewer({ tab, onOpenFile }: Props) {
  const src = toFileUrl(tab.filePath)
  const ext = tab.fileName.split('.').pop()?.toUpperCase() ?? ''

  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [fit, setFit] = useState<'fit' | 'actual' | 'free'>('fit')
  const [imgInfo, setImgInfo] = useState<ImgInfo | null>(null)
  const [bgStyle, setBgStyle] = useState<'checker' | 'black' | 'white'>('checker')

  const dragging = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  // ── Sibling images for prev/next navigation ─────────────────────────────
  const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
  const projects = useAppStore(s => s.projects)
  const [siblings, setSiblings] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(-1)
  const siblingsRef = useRef<string[]>([])
  const navProjectRef = useRef<string | null>(null)
  const setImageNavProjectPath = useAppStore(s => s.setImageNavProjectPath)

  // Keep ref in sync with state
  useEffect(() => { siblingsRef.current = siblings }, [siblings])

  useEffect(() => {
    const normFilePath = tab.filePath.replace(/\\/g, '/')

    // If file exists in current siblings list, just update index (stay in same project)
    const curSiblings = siblingsRef.current
    if (curSiblings.length > 0) {
      const idx = curSiblings.findIndex(p => p.replace(/\\/g, '/') === normFilePath)
      if (idx >= 0) {
        setCurrentIndex(idx)
        return
      }
    }

    // File not in current list — detect project and rebuild
    const dir = normFilePath.replace(/\/[^/]+$/, '')

    // Prefer: 1) locked nav project ref, 2) store's imageNavProjectPath, 3) auto-detect
    let project: typeof projects[0] | null = null
    const candidates = [navProjectRef.current, useAppStore.getState().imageNavProjectPath]
    for (const candidate of candidates) {
      if (!candidate) continue
      const p = projects.find(pr => pr.path === candidate)
      if (p && normFilePath.startsWith(p.path.replace(/\\/g, '/') + '/')) {
        project = p
        break
      }
    }
    if (!project) {
      const matchingProjects = projects
        .filter(p => normFilePath.startsWith(p.path.replace(/\\/g, '/') + '/'))
        .sort((a, b) => b.path.length - a.path.length)
      project = matchingProjects[0] ?? null
    }

    if (!project) {
      navProjectRef.current = null
      setImageNavProjectPath(null)
      window.electronAPI.readDir(dir).then(nodes => {
        const imgs = nodes
          .filter(n => n.type === 'file' && IMAGE_EXTS.includes(n.name.split('.').pop()?.toLowerCase() ?? ''))
          .map(n => n.path)
          .sort((a, b) => a.localeCompare(b, 'ko'))
        siblingsRef.current = imgs
        setSiblings(imgs)
        setCurrentIndex(imgs.findIndex(p => p.replace(/\\/g, '/') === normFilePath))
      })
      return
    }

    navProjectRef.current = project.path
    setImageNavProjectPath(project.path)
    window.electronAPI.listImages(project.path).then(imgs => {
      const sorted = imgs.sort((a, b) => a.localeCompare(b, 'ko'))
      siblingsRef.current = sorted
      setSiblings(sorted)
      setCurrentIndex(sorted.findIndex(p => p.replace(/\\/g, '/') === normFilePath))
    })
  }, [tab.filePath, projects])

  const goPrev = useCallback(() => {
    if (currentIndex <= 0 || !onOpenFile) return
    const prev = siblingsRef.current[currentIndex - 1]
    if (!prev) return
    const name = prev.replace(/\\/g, '/').split('/').pop() || ''
    onOpenFile(prev, name)
  }, [currentIndex, onOpenFile])

  const goNext = useCallback(() => {
    if (currentIndex < 0 || currentIndex >= siblingsRef.current.length - 1 || !onOpenFile) return
    const next = siblingsRef.current[currentIndex + 1]
    if (!next) return
    const name = next.replace(/\\/g, '/').split('/').pop() || ''
    onOpenFile(next, name)
  }, [currentIndex, onOpenFile])

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [goPrev, goNext])

  // ── Fit to window ────────────────────────────────────────────────────────
  const applyFit = useCallback(() => {
    const container = containerRef.current
    const img = imgRef.current
    if (!container || !img || !img.naturalWidth) return
    const cw = container.clientWidth - 48
    const ch = container.clientHeight - 48
    const scaleW = cw / img.naturalWidth
    const scaleH = ch / img.naturalHeight
    setScale(Math.min(1, scaleW, scaleH))
    setOffset({ x: 0, y: 0 })
  }, [])

  // Load image info + fit on mount / tab change
  useEffect(() => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
    setFit('fit')
    setImgInfo(null)

    window.electronAPI.stat(tab.filePath).then(s => {
      if (s) setImgInfo(prev => ({ ...prev!, fileSize: formatBytes(s.size) }))
    })
  }, [tab.filePath])

  const handleImgLoad = () => {
    const img = imgRef.current
    if (!img) return
    setImgInfo(prev => ({
      naturalW: img.naturalWidth,
      naturalH: img.naturalHeight,
      fileSize: prev?.fileSize ?? '',
    }))
    applyFit()
  }

  // Re-fit when fit mode is 'fit'
  useEffect(() => {
    if (fit === 'fit') applyFit()
    else if (fit === 'actual') {
      setScale(1)
      setOffset({ x: 0, y: 0 })
    }
  }, [fit, applyFit])

  // ── Zoom ──────────────────────────────────────────────────────────────────
  const zoomTo = (newScale: number) => {
    setScale(Math.min(10, Math.max(0.05, newScale)))
    setFit('free')
  }

  const zoomIn = () => {
    const next = ZOOM_LEVELS.find(z => z > scale) ?? scale * 1.5
    zoomTo(next)
  }

  const zoomOut = () => {
    const next = [...ZOOM_LEVELS].reverse().find(z => z < scale) ?? scale / 1.5
    zoomTo(next)
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    setScale(s => Math.min(10, Math.max(0.05, s * factor)))
    setFit('free')
  }

  // ── Pan (drag) ────────────────────────────────────────────────────────────
  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    setIsDragging(true)
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging.current) return
    e.preventDefault()
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setOffset(o => ({ x: o.x + dx, y: o.y + dy }))
    setFit('free')
  }

  const handleMouseUp = () => { dragging.current = false; setIsDragging(false) }

  // ── Context menu (right-click copy) ─────────────────────────────────────
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  const handleContextMenu = (e: MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  const handleCopyImage = async () => {
    setCtxMenu(null)
    const result = await window.electronAPI.copyImageToClipboard(tab.filePath)
    if (result.success) {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 1500)
    }
  }

  // ── Drag to external app ────────────────────────────────────────────────
  const handleImgDragStart = (e: React.DragEvent) => {
    e.preventDefault()
    window.electronAPI.startDrag(tab.filePath)
  }

  // ── Background styles ─────────────────────────────────────────────────────
  const bgClass = {
    checker: 'bg-checker',
    black: 'bg-black',
    white: 'bg-white',
  }[bgStyle]

  return (
    <div className="flex flex-col h-full bg-gray-100 dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        {/* File info */}
        <span className="text-xs text-gray-400 truncate flex-1" title={tab.filePath}>
          {tab.filePath}
        </span>

        {imgInfo && (
          <span className="text-xs text-gray-400 flex-shrink-0 hidden sm:block">
            {imgInfo.naturalW} × {imgInfo.naturalH}px &nbsp;·&nbsp; {ext} &nbsp;·&nbsp; {imgInfo.fileSize}
          </span>
        )}

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

        {/* Background toggle */}
        <div className="flex items-center rounded border border-gray-200 dark:border-gray-600 overflow-hidden">
          {(['checker', 'white', 'black'] as const).map(bg => (
            <button
              key={bg}
              onClick={() => setBgStyle(bg)}
              title={bg === 'checker' ? '체커보드 배경' : bg === 'white' ? '흰색 배경' : '검정 배경'}
              className={`w-6 h-6 flex items-center justify-center text-xs transition-colors ${
                bgStyle === bg ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              {bg === 'checker' && (
                <span className="w-3.5 h-3.5 rounded-sm" style={{
                  background: 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 6px 6px',
                }} />
              )}
              {bg === 'white' && <span className="w-3.5 h-3.5 rounded-sm border border-gray-300 bg-white" />}
              {bg === 'black' && <span className="w-3.5 h-3.5 rounded-sm bg-gray-900" />}
            </button>
          ))}
        </div>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

        {/* Zoom controls */}
        <button
          onClick={zoomOut}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          title="축소"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
          </svg>
        </button>

        <button
          onClick={() => { setFit('fit'); applyFit() }}
          className={`px-2 h-6 text-xs rounded border transition-colors ${
            fit === 'fit'
              ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title="창에 맞추기"
        >
          {Math.round(scale * 100)}%
        </button>

        <button
          onClick={zoomIn}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
          title="확대"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </button>

        <div className="w-px h-4 bg-gray-200 dark:bg-gray-600" />

        {/* Fit / Actual size */}
        <button
          onClick={() => setFit('fit')}
          className={`px-2 h-6 text-xs rounded transition-colors ${
            fit === 'fit'
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title="창에 맞추기"
        >
          맞춤
        </button>
        <button
          onClick={() => setFit('actual')}
          className={`px-2 h-6 text-xs rounded transition-colors ${
            fit === 'actual'
              ? 'bg-blue-600 text-white'
              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'
          }`}
          title="실제 크기 (100%)"
        >
          1:1
        </button>

        {/* Open externally */}
        <button
          onClick={() => window.electronAPI.openPath(tab.filePath)}
          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500"
          title="기본 앱으로 열기"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden flex items-center justify-center relative ${bgClass}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={tab.fileName}
          onLoad={handleImgLoad}
          draggable={false}
          onDragStart={e => e.preventDefault()}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.05s',
            maxWidth: 'none',
            userSelect: 'none',
            pointerEvents: 'none',
            imageRendering: scale > 3 ? 'pixelated' : 'auto',
          }}
        />

        {/* Prev / Next buttons */}
        {onOpenFile && siblings.length > 1 && (
          <>
            <button
              onClick={e => { e.stopPropagation(); goPrev() }}
              disabled={currentIndex <= 0}
              className={`absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-all ${
                currentIndex <= 0 ? 'opacity-30 cursor-default' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={e => { e.stopPropagation(); goNext() }}
              disabled={currentIndex >= siblings.length - 1}
              className={`absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-black/30 hover:bg-black/50 text-white transition-all ${
                currentIndex >= siblings.length - 1 ? 'opacity-30 cursor-default' : 'opacity-70 hover:opacity-100'
              }`}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl py-1 min-w-40"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              onClick={handleCopyImage}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
              이미지 복사
            </button>
            <button
              onClick={() => { setCtxMenu(null); window.electronAPI.showItemInFolder(tab.filePath) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
              </svg>
              탐색기에서 열기
            </button>
            <button
              onClick={() => { setCtxMenu(null); window.electronAPI.openPath(tab.filePath) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              기본 앱으로 열기
            </button>
          </div>
        </>
      )}

      {/* Copy success toast */}
      {copySuccess && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg shadow-lg z-50">
          클립보드에 복사됨
        </div>
      )}

      {/* Status bar */}
      {imgInfo && (
        <div className="flex items-center gap-4 px-4 h-6 text-xs text-gray-400 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span>{tab.fileName}</span>
          <span>{imgInfo.naturalW} × {imgInfo.naturalH}px</span>
          <span>{imgInfo.fileSize}</span>
          <span>{ext}</span>
          <span>{Math.round(scale * 100)}%</span>
          {siblings.length > 1 && <span>{currentIndex + 1} / {siblings.length}</span>}
        </div>
      )}
    </div>
  )
}
