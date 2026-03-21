import { useEffect, useRef, useState } from 'react'
import type { Tab } from '../stores/useAppStore'

interface Props {
  tab: Tab
}

function toFileUrl(filePath: string) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoPlayer({ tab }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)

  const src = toFileUrl(tab.filePath)
  const ext = tab.fileName.split('.').pop()?.toLowerCase() ?? ''
  const extUpper = ext.toUpperCase()

  // Formats natively supported by Chromium <video>
  const NATIVE_FORMATS = ['mp4', 'webm', 'ogg', 'mov']
  const isNative = NATIVE_FORMATS.includes(ext)

  useEffect(() => {
    setPlaying(false)
    setCurrentTime(0)
    setDuration(0)
    // Auto-open unsupported formats in default app
    if (!isNative) {
      window.electronAPI.openPath(tab.filePath)
    }
  }, [tab.filePath])

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) { v.play(); setPlaying(true) }
    else { v.pause(); setPlaying(false) }
  }

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime)
  }

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration)
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value)
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrentTime(time)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = Number(e.target.value)
    setVolume(vol)
    if (videoRef.current) videoRef.current.volume = vol
    if (vol > 0) setMuted(false)
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !muted
      setMuted(!muted)
    }
  }

  const cyclePlaybackRate = () => {
    const rates = [0.5, 1, 1.25, 1.5, 2]
    const idx = rates.indexOf(playbackRate)
    const next = rates[(idx + 1) % rates.length]
    setPlaybackRate(next)
    if (videoRef.current) videoRef.current.playbackRate = next
  }

  const toggleFullscreen = () => {
    const v = videoRef.current
    if (!v) return
    if (document.fullscreenElement) document.exitFullscreen()
    else v.requestFullscreen()
  }

  const handleEnded = () => setPlaying(false)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const v = videoRef.current
    if (!v) return
    if (e.key === ' ' || e.key === 'k') { e.preventDefault(); togglePlay() }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); v.currentTime = Math.max(0, v.currentTime - 5) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); v.currentTime = Math.min(duration, v.currentTime + 5) }
    else if (e.key === 'f') { e.preventDefault(); toggleFullscreen() }
    else if (e.key === 'm') { e.preventDefault(); toggleMute() }
  }

  return (
    <div
      className="flex flex-col h-full bg-black focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-400 truncate flex-1" title={tab.filePath}>
          {tab.filePath}
        </span>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {ext}
          {duration > 0 && <> &middot; {formatTime(duration)}</>}
        </span>
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

      {/* Video */}
      {isNative ? (
        <div className="flex-1 flex items-center justify-center overflow-hidden bg-black" onClick={togglePlay}>
          <video
            ref={videoRef}
            src={src}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={handleEnded}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            className="max-w-full max-h-full"
            style={{ outline: 'none' }}
          />
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-black gap-3">
          <svg className="w-16 h-16 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <p className="text-gray-400 text-sm">{extUpper} 형식은 기본 앱에서 재생됩니다.</p>
          <button
            onClick={() => window.electronAPI.openPath(tab.filePath)}
            className="px-4 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            기본 앱으로 다시 열기
          </button>
        </div>
      )}

      {/* Controls */}
      {isNative && <div className="flex flex-col px-4 py-2 bg-gray-900 border-t border-gray-700 flex-shrink-0 gap-1.5">
        {/* Seek bar */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={currentTime}
          onChange={handleSeek}
          className="w-full h-1 accent-blue-500 cursor-pointer"
        />

        <div className="flex items-center gap-3">
          {/* Play/Pause */}
          <button onClick={togglePlay} className="text-white hover:text-blue-400 transition-colors" title={playing ? '일시정지' : '재생'}>
            {playing ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Time */}
          <span className="text-xs text-gray-400 min-w-[80px]">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          {/* Volume */}
          <button onClick={toggleMute} className="text-white hover:text-blue-400 transition-colors" title={muted ? '음소거 해제' : '음소거'}>
            {muted || volume === 0 ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={handleVolumeChange}
            className="w-16 h-1 accent-blue-500 cursor-pointer"
          />

          <div className="flex-1" />

          {/* Playback rate */}
          <button
            onClick={cyclePlaybackRate}
            className="px-1.5 py-0.5 text-xs text-gray-400 hover:text-white border border-gray-600 rounded transition-colors"
            title="재생 속도"
          >
            {playbackRate}x
          </button>

          {/* Fullscreen */}
          <button onClick={toggleFullscreen} className="text-white hover:text-blue-400 transition-colors" title="전체화면">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        </div>
      </div>}
    </div>
  )
}
