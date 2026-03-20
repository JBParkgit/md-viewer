import { useEffect, useMemo, useRef, useState } from 'react'

interface Heading {
  id: string
  text: string
  level: number
}

interface Props {
  content: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

export default function TableOfContents({ content }: Props) {
  const [activeId, setActiveId] = useState<string>('')

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

  // Track active heading via IntersectionObserver
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

  if (headings.length === 0) return null

  return (
    <div className="w-56 flex-shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-y-auto">
      <div className="px-3 py-3">
        <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
          목차
        </div>
        <nav className="space-y-0.5">
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
      </div>
    </div>
  )
}
