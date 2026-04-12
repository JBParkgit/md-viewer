import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'

const TAG_COLORS = [
  { id: 'blue', bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
  { id: 'green', bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-500' },
  { id: 'red', bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
  { id: 'purple', bg: 'bg-purple-100 dark:bg-purple-900/40', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
  { id: 'amber', bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
  { id: 'cyan', bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500' },
  { id: 'rose', bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
  { id: 'gray', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', dot: 'bg-gray-500' },
]

export function getTagColorClasses(tagColors: Record<string, string>, tag: string) {
  const colorId = tagColors[tag]
  const found = TAG_COLORS.find(c => c.id === colorId)
  return found || TAG_COLORS[0] // default blue
}

interface TagFile {
  filePath: string
  fileName: string
  tags: string[]
}

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

export default function TagPanel({ onOpenFile }: Props) {
  const projects = useAppStore(s => s.projects)
  const tagColors = useAppStore(s => s.tagColors)
  const setTagColor = useAppStore(s => s.setTagColor)

  const [tagFiles, setTagFiles] = useState<TagFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [colorMenuTag, setColorMenuTag] = useState<string | null>(null)
  const [tagSearch, setTagSearch] = useState('')

  // Collect tags from all projects
  const loadTags = useCallback(async () => {
    if (projects.length === 0) { setTagFiles([]); return }
    setLoading(true)
    const all: TagFile[] = []
    for (const project of projects) {
      try {
        const results = await window.electronAPI.collectTags(project.path)
        all.push(...results)
      } catch {}
    }
    setTagFiles(all)
    setLoading(false)
  }, [projects])

  useEffect(() => { loadTags() }, [loadTags])

  // Re-scan tags whenever any file is saved (so new body `#tags` appear immediately)
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null
    const handler = () => {
      if (timeout) clearTimeout(timeout)
      // Debounce so rapid consecutive saves only trigger one scan
      timeout = setTimeout(() => { loadTags() }, 300)
    }
    window.addEventListener('file-saved', handler)
    return () => {
      window.removeEventListener('file-saved', handler)
      if (timeout) clearTimeout(timeout)
    }
  }, [loadTags])

  // Build tag → count map
  const tagMap = new Map<string, number>()
  for (const f of tagFiles) {
    for (const t of f.tags) {
      tagMap.set(t, (tagMap.get(t) || 0) + 1)
    }
  }
  const sortedTags = [...tagMap.entries()].sort((a, b) => b[1] - a[1])
  const maxCount = sortedTags.length > 0 ? sortedTags[0][1] : 1

  // Auto color based on count ratio
  const COUNT_COLORS = [
    { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-400' },       // lowest
    { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300' },
    { bg: 'bg-cyan-100 dark:bg-cyan-900/40', text: 'text-cyan-700 dark:text-cyan-300' },
    { bg: 'bg-green-100 dark:bg-green-900/40', text: 'text-green-700 dark:text-green-300' },
    { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300' },
    { bg: 'bg-rose-100 dark:bg-rose-900/40', text: 'text-rose-700 dark:text-rose-300' },     // highest
  ]
  function getCountColor(count: number) {
    if (maxCount <= 1) return COUNT_COLORS[1]
    const ratio = (count - 1) / (maxCount - 1) // 0 ~ 1
    const idx = Math.min(Math.floor(ratio * COUNT_COLORS.length), COUNT_COLORS.length - 1)
    return COUNT_COLORS[idx]
  }

  const filteredTags = tagSearch
    ? sortedTags.filter(([tag]) => tag.toLowerCase().includes(tagSearch.toLowerCase()))
    : sortedTags

  // Files matching selected tag
  const filteredFiles = selectedTag
    ? tagFiles.filter(f => f.tags.includes(selectedTag))
    : []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
        태그 수집 중...
      </div>
    )
  }

  if (sortedTags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <span>태그가 있는 문서가 없습니다</span>
        <span className="text-gray-400/60">MD 파일 프론트매터에 tags를 추가하세요</span>
      </div>
    )
  }

  return (
    <div className="py-1">
      {/* Tag search */}
      <div className="px-3 pt-2 pb-1">
        <div className="relative">
          <input
            type="text"
            value={tagSearch}
            onChange={e => setTagSearch(e.target.value)}
            placeholder="태그 검색..."
            className="w-full pl-7 pr-2 py-1.5 text-xs rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
          />
          <svg className="absolute left-2 top-2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {tagSearch && (
            <button onClick={() => setTagSearch('')} className="absolute right-2 top-2 text-gray-400 hover:text-gray-600">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tag cloud */}
      <div className="px-3 py-2">
        <div className="text-xs text-gray-400 mb-2">태그 ({filteredTags.length}{tagSearch ? ` / ${sortedTags.length}` : ''}개)</div>
        <div className="flex flex-wrap gap-1.5">
          {filteredTags.map(([tag, count]) => {
            const countColor = getCountColor(count)
            const userColor = tagColors[tag] ? getTagColorClasses(tagColors, tag) : null
            const colors = userColor || countColor
            const isActive = selectedTag === tag
            return (
              <button
                key={tag}
                onClick={() => setSelectedTag(isActive ? null : tag)}
                onContextMenu={(e) => { e.preventDefault(); setColorMenuTag(tag) }}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all ${
                  isActive
                    ? `${colors.bg} ${colors.text} ring-2 ring-blue-400`
                    : `${colors.bg} ${colors.text} hover:ring-1 hover:ring-gray-300`
                }`}
              >
                # {tag}
                <span className="opacity-60">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Color picker menu */}
      {colorMenuTag && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setColorMenuTag(null)} />
          <div className="relative z-50 mx-3 mb-2 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl">
            <div className="text-xs text-gray-500 mb-1.5">"{colorMenuTag}" 색상</div>
            <div className="flex gap-1.5">
              {TAG_COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setTagColor(colorMenuTag, c.id); setColorMenuTag(null) }}
                  className={`w-5 h-5 rounded-full ${c.dot} ${
                    tagColors[colorMenuTag] === c.id ? 'ring-2 ring-offset-1 ring-blue-400' : 'hover:ring-1 hover:ring-gray-400'
                  }`}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Filtered file list */}
      {selectedTag && (
        <div className="border-t border-gray-200 dark:border-gray-700">
          <div className="px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 font-medium">
            "{selectedTag}" 태그 문서 ({filteredFiles.length}개)
          </div>
          {filteredFiles.map(f => (
            <div
              key={f.filePath}
              onClick={() => onOpenFile(f.filePath, f.fileName)}
              className="px-3 py-1.5 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-gray-100 dark:border-gray-700/50 last:border-0"
            >
              <div className="text-xs font-medium text-blue-600 dark:text-blue-400 truncate">
                {f.fileName}
              </div>
              <div className="flex gap-1 mt-0.5 flex-wrap">
                {f.tags.map(t => {
                  const tc = getTagColorClasses(tagColors, t)
                  return (
                    <span key={t} className={`text-xs px-1.5 py-0 rounded-full ${tc.bg} ${tc.text}`}>
                      {t}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
