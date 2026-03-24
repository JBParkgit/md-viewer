import { useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '../stores/useAppStore'
import { parseFrontmatterTags } from '../utils/frontmatter'

interface Props {
  content: string
  filePath: string
  projectPath: string
}

// ── TOC helpers ──────────────────────────────────────────────────────────────

interface Heading {
  id: string
  text: string
  level: number
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

// ── TOC Panel ────────────────────────────────────────────────────────────────

function TocPanel({ content }: { content: string }) {
  const [activeId, setActiveId] = useState('')

  const headings = useMemo<Heading[]>(() => {
    const lines = content.split('\n')
    const result: Heading[] = []
    const seenSlugs: Map<string, number> = new Map()
    for (const line of lines) {
      const match = line.match(/^(#{1,4})\s+(.+)$/)
      if (match) {
        const level = match[1].length
        const text = match[2].replace(/[*_`]/g, '')
        let slug = slugify(text)
        const count = seenSlugs.get(slug) ?? 0
        if (count > 0) slug = `${slug}-${count}`
        seenSlugs.set(slug, count + 1)
        result.push({ id: slug, text, level })
      }
    }
    return result
  }, [content])

  useEffect(() => {
    const container = document.querySelector('.markdown-body')
    if (!container) return
    const headingEls = Array.from(container.querySelectorAll('h1,h2,h3,h4'))
    if (headingEls.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter(e => e.isIntersecting)
        if (visible.length > 0) {
          const id = visible[0].target.id
          if (id) setActiveId(id)
        }
      },
      { rootMargin: '-20% 0px -70% 0px' }
    )
    headingEls.forEach(el => {
      if (!el.id) el.id = slugify(el.textContent || '')
      observer.observe(el)
    })
    return () => observer.disconnect()
  }, [content])

  const handleClick = (id: string) => {
    const el = document.getElementById(id)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveId(id)
    }
  }

  if (headings.length === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">목차 없음</div>
  }

  return (
    <nav className="space-y-0.5 px-3 py-2">
      {headings.map((h) => (
        <button
          key={h.id}
          onClick={() => handleClick(h.id)}
          className={`w-full text-left text-xs py-0.5 rounded transition-colors truncate ${
            activeId === h.id
              ? 'text-blue-600 dark:text-blue-400 font-medium'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
          }`}
          style={{ paddingLeft: `${(h.level - 1) * 10}px` }}
          title={h.text}
        >
          {h.text}
        </button>
      ))}
    </nav>
  )
}

// ── Outgoing Links Panel ─────────────────────────────────────────────────────

function OutgoingLinksPanel({ content, filePath, projectPath }: { content: string; filePath: string; projectPath: string }) {
  const { openTab, tabs } = useAppStore()
  const [resolved, setResolved] = useState<{ name: string; resolvedPath: string | null }[]>([])
  const [loading, setLoading] = useState(true)

  const linkTargets = useMemo(() => {
    const targets = new Set<string>()
    const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
    let m: RegExpExecArray | null
    while ((m = wikiRe.exec(content)) !== null) targets.add(m[1].trim())
    const mdLinkRe = /\[([^\]]+)\]\(([^)#\s]+)\)/g
    while ((m = mdLinkRe.exec(content)) !== null) {
      const href = m[2].trim()
      if (!href.startsWith('http') && !href.startsWith('mailto') && !href.startsWith('#') && !href.startsWith('docuflow')) {
        const name = href.split('/').pop()?.split('\\').pop() || href
        if (name) targets.add(name)
      }
    }
    return [...targets]
  }, [content])

  useEffect(() => {
    if (!projectPath || linkTargets.length === 0) { setResolved([]); setLoading(false); return }
    setLoading(true)
    Promise.all(
      linkTargets.map(async name => ({
        name,
        resolvedPath: await window.electronAPI.findFile(projectPath, name).catch(() => null),
      }))
    ).then(results => { setResolved(results); setLoading(false) })
  }, [linkTargets, projectPath])

  const handleOpen = async (fp: string) => {
    const fn = fp.replace(/\\/g, '/').split('/').pop() || fp
    const existing = tabs.find(t => t.filePath === fp)
    if (existing) { openTab(fp, fn, existing.content, 'md', false); return }
    const result = await window.electronAPI.readFile(fp)
    if (result.success && result.content !== undefined) openTab(fp, fn, result.content, 'md', true)
  }

  if (loading) return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">로딩 중...</div>
  if (resolved.length === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">참조하는 문서 없음</div>
  }

  return (
    <div className="px-3 py-2 space-y-1">
      {resolved.map(({ name, resolvedPath }) => {
        const displayName = resolvedPath
          ? resolvedPath.replace(/\\/g, '/').split('/').pop() || name
          : name
        return resolvedPath ? (
          <button
            key={name}
            onClick={() => handleOpen(resolvedPath)}
            className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title={resolvedPath}
          >
            <svg className="w-3 h-3 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="truncate">{displayName}</span>
          </button>
        ) : (
          <div
            key={name}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-gray-400 dark:text-gray-500"
            title="파일을 찾을 수 없음"
          >
            <svg className="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="truncate line-through">{displayName}</span>
            <span className="ml-auto flex-shrink-0 text-red-400 dark:text-red-500 text-[9px]">없음</span>
          </div>
        )
      })}
    </div>
  )
}

// ── Backlinks Panel ──────────────────────────────────────────────────────────

function BacklinksPanel({ filePath, projectPath }: { filePath: string; projectPath: string }) {
  const { openTab, tabs } = useAppStore()
  const [backlinks, setBacklinks] = useState<{ filePath: string; fileName: string }[]>([])
  const [loading, setLoading] = useState(true)

  const currentFileName = filePath.replace(/\\/g, '/').split('/').pop() || ''
  const currentNameNoExt = currentFileName.replace(/\.md$/i, '').toLowerCase()

  useEffect(() => {
    if (!projectPath) { setLoading(false); return }
    setLoading(true)
    window.electronAPI.collectLinks(projectPath).then(all => {
      const found = all.filter(item =>
        item.filePath !== filePath &&
        item.targets.some(t => {
          const tLower = t.toLowerCase()
          return tLower === currentNameNoExt || tLower === currentFileName.toLowerCase() ||
            tLower.replace(/\.md$/i, '') === currentNameNoExt
        })
      )
      setBacklinks(found)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filePath, projectPath, currentFileName, currentNameNoExt])

  const handleOpen = async (fp: string, fn: string) => {
    // If already open, just activate it
    const existing = tabs.find(t => t.filePath === fp)
    if (existing) { openTab(fp, fn, existing.content, 'md', false); return }
    const result = await window.electronAPI.readFile(fp)
    if (result.success && result.content !== undefined) {
      openTab(fp, fn, result.content, 'md', true) // preview tab
    }
  }

  if (loading) return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">로딩 중...</div>
  if (backlinks.length === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">이 문서를 참조하는 파일 없음</div>
  }

  return (
    <div className="px-3 py-2 space-y-1">
      {backlinks.map(b => (
        <button
          key={b.filePath}
          onClick={() => handleOpen(b.filePath, b.fileName)}
          className="w-full text-left flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={b.filePath}
        >
          <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="truncate">{b.fileName}</span>
        </button>
      ))}
    </div>
  )
}

// ── Related Docs Panel ────────────────────────────────────────────────────────

function RelatedPanel({ content, filePath, projectPath }: { content: string; filePath: string; projectPath: string }) {
  const { openTab, tabs } = useAppStore()
  const [related, setRelated] = useState<{ filePath: string; fileName: string; commonCount: number; tags: string[] }[]>([])
  const [loading, setLoading] = useState(true)

  const currentTags = useMemo(() => parseFrontmatterTags(content), [content])

  useEffect(() => {
    if (!projectPath || currentTags.length === 0) { setLoading(false); return }
    setLoading(true)
    window.electronAPI.collectTags(projectPath).then(all => {
      const items = all
        .filter(item => item.filePath !== filePath)
        .map(item => ({
          ...item,
          commonCount: item.tags.filter(t => currentTags.includes(t)).length,
        }))
        .filter(item => item.commonCount > 0)
        .sort((a, b) => b.commonCount - a.commonCount)
        .slice(0, 8)
      setRelated(items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [filePath, projectPath, currentTags])

  const handleOpen = async (fp: string, fn: string) => {
    const existing = tabs.find(t => t.filePath === fp)
    if (existing) { openTab(fp, fn, existing.content, 'md', false); return }
    const result = await window.electronAPI.readFile(fp)
    if (result.success && result.content !== undefined) {
      openTab(fp, fn, result.content, 'md', true) // preview tab
    }
  }

  if (loading) return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">로딩 중...</div>
  if (currentTags.length === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">이 문서에 태그가 없습니다</div>
  }
  if (related.length === 0) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 px-3 py-4">관련 문서 없음</div>
  }

  return (
    <div className="px-3 py-2 space-y-1">
      {related.map(r => (
        <button
          key={r.filePath}
          onClick={() => handleOpen(r.filePath, r.fileName)}
          className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={r.filePath}
        >
          <div className="flex items-center gap-1.5">
            <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="truncate text-gray-700 dark:text-gray-300">{r.fileName}</span>
            <span className="ml-auto flex-shrink-0 text-[10px] text-gray-400">공통 {r.commonCount}</span>
          </div>
          <div className="flex flex-wrap gap-0.5 mt-0.5 pl-4">
            {r.tags.filter(t => currentTags.includes(t)).map(t => (
              <span key={t} className="text-[9px] px-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">{t}</span>
            ))}
          </div>
        </button>
      ))}
    </div>
  )
}

// ── Main RightPanel ───────────────────────────────────────────────────────────

export default function RightPanel({ content, filePath, projectPath }: Props) {
  const { rightPanelTab, setRightPanelTab } = useAppStore()
  const [backlinkCount, setBacklinkCount] = useState<number | null>(null)

  const currentFileName = filePath.replace(/\\/g, '/').split('/').pop() || ''
  const currentNameNoExt = currentFileName.replace(/\.md$/i, '').toLowerCase()

  // Outgoing link count (from content, no IPC needed)
  const outgoingCount = useMemo(() => {
    const targets = new Set<string>()
    const wikiRe = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g
    let m: RegExpExecArray | null
    while ((m = wikiRe.exec(content)) !== null) targets.add(m[1].trim())
    const mdLinkRe = /\[([^\]]+)\]\(([^)#\s]+)\)/g
    while ((m = mdLinkRe.exec(content)) !== null) {
      const href = m[2].trim()
      if (!href.startsWith('http') && !href.startsWith('mailto') && !href.startsWith('#') && !href.startsWith('docuflow')) {
        const name = href.split('/').pop()?.split('\\').pop() || href
        if (name) targets.add(name)
      }
    }
    return targets.size
  }, [content])

  // Fetch backlink count for badge
  useEffect(() => {
    if (!projectPath) return
    window.electronAPI.collectLinks(projectPath).then(all => {
      const count = all.filter(item =>
        item.filePath !== filePath &&
        item.targets.some(t => {
          const tLower = t.toLowerCase()
          return tLower === currentNameNoExt || tLower === currentFileName.toLowerCase() ||
            tLower.replace(/\.md$/i, '') === currentNameNoExt
        })
      ).length
      setBacklinkCount(count)
    }).catch(() => {})
  }, [filePath, projectPath, currentFileName, currentNameNoExt])

  const tabs = [
    { id: 'toc' as const, label: '목차' },
    { id: 'links' as const, label: '링크', badge: outgoingCount || null },
    { id: 'backlinks' as const, label: '백링크', badge: backlinkCount },
    { id: 'related' as const, label: '관련문서' },
  ]

  return (
    <div className="w-56 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col overflow-hidden">
      {/* Tab switcher */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setRightPanelTab(tab.id)}
            className={`flex-1 px-1 py-1.5 text-[10px] font-medium transition-colors relative ${
              rightPanelTab === tab.id
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-white dark:bg-gray-900'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge !== null && tab.badge > 0 && (
              <span className="ml-0.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] font-bold">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div className="flex-1 overflow-y-auto">
        {rightPanelTab === 'toc' && <TocPanel content={content} />}
        {rightPanelTab === 'links' && (
          <OutgoingLinksPanel content={content} filePath={filePath} projectPath={projectPath} />
        )}
        {rightPanelTab === 'backlinks' && (
          <BacklinksPanel filePath={filePath} projectPath={projectPath} />
        )}
        {rightPanelTab === 'related' && (
          <RelatedPanel content={content} filePath={filePath} projectPath={projectPath} />
        )}
      </div>
    </div>
  )
}
