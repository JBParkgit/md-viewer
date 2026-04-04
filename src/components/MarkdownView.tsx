import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useAppStore, type Tab } from '../stores/useAppStore'
import ImageModal from './ImageModal'
import { parseFrontmatterTags, stripFrontmatter } from '../utils/frontmatter'
import { getTagColorClasses } from './TagPanel'

interface Props {
  tab: Tab
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>
  lineNumbers?: boolean
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

const headingSlugCounts = new Map<string, number>()

function getTextContent(node: any): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(getTextContent).join('')
  if (node?.props?.children) return getTextContent(node.props.children)
  return ''
}

function scrollToHeading(id: string) {
  const container = document.querySelector('[data-md-scroll]') as HTMLElement | null
  if (!container) return

  // 1) Try by ID directly
  let el = document.getElementById(id) || document.getElementById(slugify(id))

  // 2) Fallback: match heading by text content
  if (!el) {
    const slug = slugify(id)
    el = Array.from(container.querySelectorAll('h1, h2, h3, h4, h5, h6'))
      .find(h => slugify(h.textContent || '') === slug) as HTMLElement | null
  }

  if (!el) return
  const top = el.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
  container.scrollTo({ top, behavior: 'smooth' })
}

function HeadingWithId({ level, children, node, ...props }: { level: number; children?: any; node?: any; [k: string]: any }) {
  const text = getTextContent(children)
  let slug = slugify(text)
  const count = headingSlugCounts.get(slug) ?? 0
  if (count > 0) slug = `${slug}-${count}`
  headingSlugCounts.set(slug, count + 1)
  const tagProps = { id: slug, ...props }
  switch (level) {
    case 1: return <h1 {...tagProps}>{children}</h1>
    case 2: return <h2 {...tagProps}>{children}</h2>
    case 3: return <h3 {...tagProps}>{children}</h3>
    case 4: return <h4 {...tagProps}>{children}</h4>
    case 5: return <h5 {...tagProps}>{children}</h5>
    default: return <h6 {...tagProps}>{children}</h6>
  }
}

function TagBadges({ tags }: { tags: string[] }) {
  const tagColors = useAppStore(s => s.tagColors)
  return (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {tags.map(tag => {
        const c = getTagColorClasses(tagColors, tag)
        return (
          <span key={tag} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
            # {tag}
          </span>
        )
      })}
    </div>
  )
}

export default function MarkdownView({ tab, scrollRef, lineNumbers }: Props) {
  const { darkMode, setTabScrollPos, projects, openTab } = useAppStore()
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))
  const containerRef = useRef<HTMLDivElement>(null)
  const [modalImage, setModalImage] = useState<string | null>(null)
  const [wikiNotFound, setWikiNotFound] = useState<string | null>(null)

  const handleWikiLink = useCallback(async (name: string) => {
    for (const p of projects) {
      const found = await window.electronAPI.findFile(p.path, name)
      if (found) {
        const result = await window.electronAPI.readFile(found)
        if (result.success && result.content !== undefined) {
          const fileName = found.replace(/\\/g, '/').split('/').pop() || found
          const alreadyOpen = useAppStore.getState().tabs.find(t => t.filePath === found)
          openTab(found, fileName, result.content, 'md', !alreadyOpen)
          return
        }
      }
    }
    setWikiNotFound(name)
    setTimeout(() => setWikiNotFound(null), 3000)
  }, [projects, openTab])

  // Preprocess [[wikilinks]] → [label](docuflow://target)
  const processedContent = useMemo(() =>
    stripFrontmatter(tab.content).replace(
      /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
      (_, target, label) => `[${label || target}](docuflow://${encodeURIComponent(target.trim())})`
    ), [tab.content])

  // Wire up external scroll ref
  useEffect(() => {
    if (scrollRef) scrollRef.current = containerRef.current
  }, [scrollRef])

  // Build line map: for each source line, which content does it start?
  const lineMap = useMemo(() => {
    if (!lineNumbers) return null
    const stripped = stripFrontmatter(tab.content)
    const lines = stripped.split('\n')
    const map: Map<string, number> = new Map()
    // Map first few words of each non-empty line to its line number (in stripped content)
    // We'll use this to match rendered text to source lines
    const fmLines = tab.content.split('\n')
    const fmMatch = tab.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    const offset = fmMatch ? fmMatch[0].split('\n').length - 1 : 0
    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (trimmed) {
        // Store line number (1-based, accounting for frontmatter offset)
        map.set(trimmed.slice(0, 60), i + 1 + offset)
      }
    })
    return map
  }, [tab.content, lineNumbers])

  // Restore scroll position (include filePath so preview tab reuse resets to top)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = tab.scrollPos
    }
  }, [tab.id, tab.filePath])

  // Save scroll position on scroll
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setTabScrollPos(tab.id, containerRef.current.scrollTop)
    }
  }, [tab.id, setTabScrollPos])

  // After render: assign data-line attributes to block elements
  const markdownBodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lineNumbers || !lineMap || !markdownBodyRef.current) return
    const blocks = markdownBodyRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote,pre,table,hr')
    blocks.forEach(el => {
      const text = (el.textContent || '').trim().slice(0, 60)
      if (text && lineMap.has(text)) {
        el.setAttribute('data-line', String(lineMap.get(text)))
      }
    })
  }, [tab.content, lineNumbers, lineMap])

  // Convert local file paths to file:// URLs
  const resolveImageSrc = (src: string): string => {
    if (!src) return src
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://') || src.startsWith('data:')) {
      return src
    }
    // Absolute path (e.g. C:/... or /...)
    if (/^[A-Za-z]:[\\/]/.test(src) || src.startsWith('/')) {
      return 'file:///' + src.replace(/\\/g, '/')
    }
    // Relative path: resolve against file's directory
    const dir = tab.filePath.replace(/[\\/][^\\/]+$/, '')
    const abs = `${dir}/${src}`.replace(/\\/g, '/')
    return `file:///${abs}`
  }

  headingSlugCounts.clear()

  return (
    <div
      ref={containerRef}
      data-md-scroll
      className="h-full overflow-y-auto bg-white dark:bg-gray-900"
      onScroll={handleScroll}
    >
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Frontmatter tags */}
        {parseFrontmatterTags(tab.content).length > 0 && (
          <TagBadges tags={parseFrontmatterTags(tab.content)} />
        )}
        {wikiNotFound && (
          <div className="mb-3 px-3 py-2 rounded-md bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs">
            문서를 찾을 수 없습니다: <strong>{wikiNotFound}</strong>
          </div>
        )}
        <div ref={markdownBodyRef} className="markdown-body text-gray-900 dark:text-gray-100">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            urlTransform={(url) => url}
            components={{
              h1: (p) => <HeadingWithId level={1} {...p} />,
              h2: (p) => <HeadingWithId level={2} {...p} />,
              h3: (p) => <HeadingWithId level={3} {...p} />,
              h4: (p) => <HeadingWithId level={4} {...p} />,
              h5: (p) => <HeadingWithId level={5} {...p} />,
              h6: (p) => <HeadingWithId level={6} {...p} />,
              code({ className, children, ...props }) {
                const match = /language-(\w+)/.exec(className || '')
                const isBlock = !props.ref && match
                if (isBlock) {
                  return (
                    <SyntaxHighlighter
                      style={isDark ? oneDark : oneLight}
                      language={match[1]}
                      PreTag="div"
                      customStyle={{
                        margin: '1em 0',
                        borderRadius: '8px',
                        fontSize: '0.875em',
                      }}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  )
                }
                return <code className={className} {...props}>{children}</code>
              },
              img({ src, alt, ...props }) {
                const resolved = resolveImageSrc(src || '')
                return (
                  <img
                    src={resolved}
                    alt={alt}
                    {...props}
                    onClick={() => setModalImage(resolved)}
                    style={{ cursor: 'zoom-in' }}
                  />
                )
              },
              a({ href, children, ...props }) {
                if (href?.startsWith('docuflow://')) {
                  const name = decodeURIComponent(href.slice(11))
                  return (
                    <span
                      className="wikilink cursor-pointer text-purple-600 dark:text-purple-400 hover:underline font-medium"
                      onClick={() => handleWikiLink(name)}
                      title={`문서 열기: ${name}`}
                    >
                      {children}
                    </span>
                  )
                }
                // Internal anchor link → smooth scroll to heading
                if (href?.startsWith('#')) {
                  return (
                    <a
                      href={href}
                      onClick={(e) => {
                        e.preventDefault()
                        scrollToHeading(decodeURIComponent(href.slice(1)))
                      }}
                      {...props}
                    >
                      {children}
                    </a>
                  )
                }
                // Local .md file link → open as document
                if (href && !href.startsWith('http') && !href.startsWith('mailto') &&
                    !href.startsWith('data:') && !href.startsWith('file://')) {
                  const fileName = href.split(/[/\\]/).pop() || href
                  const ext = fileName.split('.').pop()?.toLowerCase()
                  if (!ext || ext === 'md') {
                    return (
                      <span
                        className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={() => handleWikiLink(fileName.replace(/\.md$/i, '') || fileName)}
                        title={`문서 열기: ${fileName}`}
                      >
                        {children}
                      </span>
                    )
                  }
                }
                // External link → open in browser
                return (
                  <a
                    href={href}
                    onClick={(e) => {
                      e.preventDefault()
                      if (href?.startsWith('http')) window.open(href, '_blank')
                    }}
                    {...props}
                  >
                    {children}
                  </a>
                )
              },
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>

      {modalImage && (
        <ImageModal src={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  )
}
