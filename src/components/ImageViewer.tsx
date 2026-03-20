import { useEffect, useRef, useState, useCallback, type WheelEvent, type MouseEvent } from 'react'
import type { Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
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

export default function ImageViewer({ tab }: Props) {
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
  const lastMouse = useRef({ x: 0, y: 0 })

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
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging.current) return
    setOffset(o => ({
      x: o.x + e.clientX - lastMouse.current.x,
      y: o.y + e.clientY - lastMouse.current.y,
    }))
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setFit('free')
  }

  const handleMouseUp = () => { dragging.current = false }

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
        className={`flex-1 overflow-hidden flex items-center justify-center ${bgClass}`}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: dragging.current ? 'grabbing' : 'grab' }}
      >
        <img
          ref={imgRef}
          src={src}
          alt={tab.fileName}
          onLoad={handleImgLoad}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging.current ? 'none' : 'transform 0.05s',
            maxWidth: 'none',
            userSelect: 'none',
            imageRendering: scale > 3 ? 'pixelated' : 'auto',
          }}
        />
      </div>

      {/* Status bar */}
      {imgInfo && (
        <div className="flex items-center gap-4 px-4 h-6 text-xs text-gray-400 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
          <span>{tab.fileName}</span>
          <span>{imgInfo.naturalW} × {imgInfo.naturalH}px</span>
          <span>{imgInfo.fileSize}</span>
          <span>{ext}</span>
          <span>{Math.round(scale * 100)}%</span>
        </div>
      )}
    </div>
  )
}
