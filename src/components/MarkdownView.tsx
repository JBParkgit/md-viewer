import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
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
  const { darkMode, setTabScrollPos } = useAppStore()
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))
  const containerRef = useRef<HTMLDivElement>(null)
  const [modalImage, setModalImage] = useState<string | null>(null)

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

  // Restore scroll position
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = tab.scrollPos
    }
  }, [tab.id])

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

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto bg-white dark:bg-gray-900"
      onScroll={handleScroll}
    >
      <div className="max-w-4xl mx-auto px-8 py-8">
        {/* Frontmatter tags */}
        {parseFrontmatterTags(tab.content).length > 0 && (
          <TagBadges tags={parseFrontmatterTags(tab.content)} />
        )}
        <div ref={markdownBodyRef} className="markdown-body text-gray-900 dark:text-gray-100">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
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
            {stripFrontmatter(tab.content)}
          </ReactMarkdown>
        </div>
      </div>

      {modalImage && (
        <ImageModal src={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  )
}
