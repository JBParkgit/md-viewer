import { useState, useEffect } from 'react'
import { useAppStore } from '../stores/useAppStore'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

interface MediaItem {
  path: string
  type: 'image' | 'video'
}

interface ProjectMedia {
  projectId: string
  projectName: string
  items: MediaItem[]
}

function toFileUrl(filePath: string) {
  return 'file:///' + filePath.replace(/\\/g, '/')
}

export default function ImageGallery({ onOpenFile }: Props) {
  const projects = useAppStore(s => s.projects)
  const [projectMedia, setProjectMedia] = useState<ProjectMedia[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (projects.length === 0) {
      setProjectMedia([])
      return
    }
    let cancelled = false
    setLoading(true)
    const load = async () => {
      try {
        const results: ProjectMedia[] = []
        for (const project of projects) {
          const imgs = await window.electronAPI.listImages(project.path)
          let vids: string[] = []
          try { vids = await window.electronAPI.listVideos(project.path) } catch {}
          const items: MediaItem[] = [
            ...imgs.map(p => ({ path: p, type: 'image' as const })),
            ...vids.map(p => ({ path: p, type: 'video' as const })),
          ]
          if (items.length > 0) {
            results.push({ projectId: project.id, projectName: project.name, items })
          }
        }
        if (!cancelled) {
          setProjectMedia(results)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [projects])

  const toggleCollapsed = (projectId: string) => {
    setCollapsed(prev => ({ ...prev, [projectId]: !prev[projectId] }))
  }

  const totalCount = projectMedia.reduce((sum, p) => sum + p.items.length, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32 text-xs text-gray-400">
        <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mr-2" />
        미디어 검색 중...
      </div>
    )
  }

  if (projectMedia.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 gap-2 text-gray-400 text-xs">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>프로젝트에 미디어가 없습니다</span>
      </div>
    )
  }

  return (
    <div className="py-1">
      <div className="text-xs text-gray-400 px-3 py-1">총 {totalCount}개 미디어</div>
      {projectMedia.map(({ projectId, projectName, items }) => {
        const isCollapsed = !!collapsed[projectId]
        return (
          <div key={projectId} className="border-b border-gray-200 dark:border-gray-700 last:border-0">
            <button
              onClick={() => toggleCollapsed(projectId)}
              className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg
                className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="truncate">{projectName}</span>
              <span className="text-gray-400 font-normal ml-auto flex-shrink-0">{items.length}</span>
            </button>
            {!isCollapsed && (
              <div className="grid grid-cols-2 gap-1.5 px-2 pb-2">
                {items.map(item => {
                  const fileName = item.path.replace(/\\/g, '/').split('/').pop() || ''
                  return (
                    <div
                      key={item.path}
                      onClick={() => onOpenFile(item.path, fileName)}
                      draggable
                      onDragStart={(e) => { e.preventDefault(); window.electronAPI.startDrag(item.path) }}
                      className="group relative cursor-pointer rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-gray-100 dark:bg-gray-700 aspect-square"
                      title={item.path}
                    >
                      {item.type === 'image' ? (
                        <img
                          src={toFileUrl(item.path)}
                          alt={fileName}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="relative w-full h-full">
                          <video
                            src={toFileUrl(item.path)}
                            className="w-full h-full object-cover"
                            muted
                            preload="metadata"
                            onLoadedData={(e) => {
                              const v = e.currentTarget
                              v.currentTime = Math.min(1, v.duration * 0.1)
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                              <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M8 5v14l11-7z" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 px-1.5 py-1 bg-black/60 text-white text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                        {fileName}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
