import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  onClose: () => void
}

export default function ImageModal({ src, onClose }: Props) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const lastPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    setScale(s => Math.min(5, Math.max(0.2, s - e.deltaY * 0.001)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragging.current = true
    lastPos.current = { x: e.clientX, y: e.clientY }
    e.preventDefault()
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    setPos(p => ({
      x: p.x + e.clientX - lastPos.current.x,
      y: p.y + e.clientY - lastPos.current.y,
    }))
    lastPos.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseUp = () => {
    dragging.current = false
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <button
        className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 text-white"
        onClick={onClose}
        title="닫기 (ESC)"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <button
          onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.2, s - 0.2)) }}
          className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-sm"
        >
          −
        </button>
        <span className="text-white text-sm w-14 text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.2)) }}
          className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-sm"
        >
          +
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setScale(1); setPos({ x: 0, y: 0 }) }}
          className="px-3 py-1 rounded bg-white/20 hover:bg-white/30 text-white text-sm"
        >
          초기화
        </button>
      </div>

      <img
        src={src}
        alt="확대 이미지"
        onClick={e => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          cursor: dragging.current ? 'grabbing' : 'grab',
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          borderRadius: '8px',
          userSelect: 'none',
          transition: dragging.current ? 'none' : 'transform 0.1s',
        }}
        draggable={false}
      />
    </div>
  )
}
