import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useAppStore, type Tab } from '../stores/useAppStore'
import ImageModal from './ImageModal'
import { parseFrontmatterTags, stripFrontmatter } from '../utils/frontmatter'
import { getTagColorClasses } from './TagPanel'
import remarkMark from '../utils/remarkMark'
import remarkInlineTag from '../utils/remarkInlineTag'
import MermaidDiagram from './MermaidDiagram'

interface Props {
  tab: Tab
  scrollRef?: React.MutableRefObject<HTMLDivElement | null>
  lineNumbers?: boolean
  cursorLine?: number
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
  const Tag = `h${level}` as keyof JSX.IntrinsicElements
  return (
    <Tag id={slug} data-fold-level={level} {...props}>
      <span
        className="fold-toggle"
        data-fold-target={slug}
        title="접기/펼치기"
      >
        <svg className="fold-chevron" viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </span>
      {children}
    </Tag>
  )
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

export default function MarkdownView({ tab, scrollRef, lineNumbers, cursorLine }: Props) {
  // Individual selectors: keep MarkdownView from re-rendering on every
  // unrelated store update (tabs array mutations, kanban state, etc.).
  const darkMode = useAppStore(s => s.darkMode)
  const setTabScrollPos = useAppStore(s => s.setTabScrollPos)
  const projects = useAppStore(s => s.projects)
  const openTab = useAppStore(s => s.openTab)
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
    const fmLines = tab.content.split('\n')
    const fmMatch = tab.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    const offset = fmMatch ? fmMatch[0].split('\n').length - 1 : 0
    const addKey = (text: string, lineNum: number) => {
      if (!text) return
      for (const len of [60, 30, 15, 8]) {
        const key = text.slice(0, len)
        if (key.length >= 2 && !map.has(key)) map.set(key, lineNum)
      }
    }

    lines.forEach((line, i) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed === '---' || trimmed === '```' || /^\|[-:| ]+\|$/.test(trimmed)) return
      const lineNum = i + 1 + offset
      // Store raw trimmed line
      addKey(trimmed, lineNum)
      // Also store with markdown syntax stripped so rendered text matches
      const rendered = trimmed
        .replace(/^#{1,6}\s+/, '')       // headings
        .replace(/^[-*+]\s+/, '')        // unordered lists
        .replace(/^\d+\.\s+/, '')        // ordered lists
        .replace(/^>\s*/, '')            // blockquotes
        .replace(/^- \[[ x]\]\s*/i, '') // task lists
        .replace(/\*\*|__/g, '')         // bold
        .replace(/\*|_/g, '')            // italic
        .replace(/~~(.+?)~~/g, '$1')     // strikethrough
        .replace(/`([^`]+)`/g, '$1')     // inline code
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
        .trim()
      if (rendered && rendered !== trimmed) addKey(rendered, lineNum)
    })
    return map
  }, [tab.content, lineNumbers])

  // Restore scroll position (include filePath so preview tab reuse resets to top)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = tab.scrollPos
    }
  }, [tab.id, tab.filePath])

  // Save scroll position — debounced so a fast scroll doesn't trigger
  // a store update (and thus a MarkdownView re-render) on every frame.
  // Scroll position only matters for restoration on tab switch, so
  // persisting it 200ms after scroll stops is fine.
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleScroll = useCallback(() => {
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
    scrollSaveTimerRef.current = setTimeout(() => {
      if (containerRef.current) {
        setTabScrollPos(tab.id, containerRef.current.scrollTop)
      }
    }, 200)
  }, [tab.id, setTabScrollPos])
  useEffect(() => () => {
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
  }, [])

  // Highlight preview element closest to editor cursor line
  useEffect(() => {
    if (!cursorLine || !markdownBodyRef.current) return
    const els = markdownBodyRef.current.querySelectorAll('[data-line]')
    let best: Element | null = null
    let bestDist = Infinity
    for (const el of els) {
      const start = parseInt(el.getAttribute('data-line') || '0')
      const end = parseInt(el.getAttribute('data-line-end') || '0') || start
      // If cursor is inside a range block, distance is 0
      if (cursorLine >= start && cursorLine <= end) {
        best = el; bestDist = 0; break
      }
      const d = Math.min(Math.abs(start - cursorLine), Math.abs(end - cursorLine))
      if (d < bestDist) { bestDist = d; best = el }
    }
    const prev = markdownBodyRef.current.querySelector('.cursor-highlight')
    if (prev) prev.classList.remove('cursor-highlight')
    if (best) best.classList.add('cursor-highlight')
  }, [cursorLine])

  // After render: assign data-line attributes via text matching + interpolation
  const markdownBodyRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!lineNumbers || !lineMap || !markdownBodyRef.current) return
    const stripped = stripFrontmatter(tab.content)
    const totalLines = stripped.split('\n').length
    const fmMatch = tab.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
    const fmOffset = fmMatch ? fmMatch[0].split('\n').length - 1 : 0

    // Collect leaf block elements (skip parents that contain matched children)
    const allBlocks = Array.from(
      markdownBodyRef.current.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,.code-block,pre:not(.code-block pre),table,hr')
    ).filter(el => {
      if (el.tagName === 'PRE' && el.closest('.code-block')) return false
      if (el.tagName === 'LI' && el.querySelector('ul,ol')) {
        // Keep the li but it will match its own text
      }
      return true
    })

    // Pass 1: text match — assign data-line where possible
    const matched: { idx: number; line: number }[] = []
    const tryMatch = (text: string): number | null => {
      if (!text) return null
      const t = text.trim()
      if (t.length < 2) return null
      for (const len of [60, 30, 15, 8]) {
        const key = t.slice(0, len)
        if (key.length >= 2 && lineMap.has(key)) return lineMap.get(key)!
      }
      return null
    }

    // Collect all text nodes and map them to their block parent
    const blockLineMap = new Map<Element, number>()
    const walker = document.createTreeWalker(
      markdownBodyRef.current, NodeFilter.SHOW_TEXT, null
    )
    let textNode: Node | null
    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent?.trim()
      if (!text || text.length < 2) continue
      const line = tryMatch(text)
      if (line === null) continue
      // Find the nearest block parent that's in our allBlocks list
      let parent = textNode.parentElement
      while (parent && parent !== markdownBodyRef.current) {
        if (allBlocks.includes(parent)) {
          if (!blockLineMap.has(parent)) blockLineMap.set(parent, line)
          break
        }
        parent = parent.parentElement
      }
    }

    allBlocks.forEach((el, idx) => {
      el.removeAttribute('data-line')
      el.removeAttribute('data-line-end')

      // Try block-level text node match first
      let line: number | null = blockLineMap.get(el) ?? null

      // Try full element text
      if (line === null) {
        const fullText = (el.textContent || '').trim()
        line = tryMatch(fullText)
        if (line === null) {
          const firstLine = fullText.split(/\n/)[0]?.trim()
          if (firstLine && firstLine !== fullText) line = tryMatch(firstLine)
        }
      }

      if (line !== null) {
        el.setAttribute('data-line', String(line))
        matched.push({ idx, line })
      }
    })

    // Pass 2: interpolate unmatched elements from surrounding matches
    // Add virtual anchors at start and end
    const anchors = [
      { idx: -1, line: 1 + fmOffset },
      ...matched,
      { idx: allBlocks.length, line: totalLines + fmOffset },
    ]

    for (let a = 0; a < anchors.length - 1; a++) {
      const from = anchors[a]
      const to = anchors[a + 1]
      const gapCount = to.idx - from.idx - 1
      if (gapCount <= 0) continue
      const lineRange = to.line - from.line
      for (let g = 1; g <= gapCount; g++) {
        const elIdx = from.idx + g
        if (elIdx < 0 || elIdx >= allBlocks.length) continue
        const el = allBlocks[elIdx]
        if (el.hasAttribute('data-line')) continue
        const interpolated = Math.round(from.line + (lineRange * g) / (gapCount + 1))
        el.setAttribute('data-line', String(interpolated))
      }
    }
  }, [tab.content, lineNumbers, lineMap])

  // Fold/collapse sections by heading
  useEffect(() => {
    const container = markdownBodyRef.current
    if (!container) return

    function toggleSection(heading: HTMLElement) {
      const level = parseInt(heading.getAttribute('data-fold-level') || '0', 10)
      if (!level) return
      const collapsed = heading.classList.toggle('folded')
      let sibling = heading.nextElementSibling as HTMLElement | null
      while (sibling) {
        const sibLevel = sibling.getAttribute('data-fold-level')
        if (sibLevel && parseInt(sibLevel, 10) <= level) break
        if (collapsed) {
          sibling.setAttribute('data-folded-by', heading.id)
          sibling.style.display = 'none'
        } else {
          if (sibling.getAttribute('data-folded-by') === heading.id) {
            sibling.removeAttribute('data-folded-by')
            sibling.style.display = ''
          }
          if (sibling.getAttribute('data-fold-level') && sibling.classList.contains('folded')) {
            const innerLevel = parseInt(sibling.getAttribute('data-fold-level')!, 10)
            let inner = sibling.nextElementSibling as HTMLElement | null
            while (inner) {
              const il = inner.getAttribute('data-fold-level')
              if (il && parseInt(il, 10) <= innerLevel) break
              inner = inner.nextElementSibling as HTMLElement | null
            }
            sibling = inner
            continue
          }
        }
        sibling = sibling.nextElementSibling as HTMLElement | null
      }
    }

    function handleClick(e: Event) {
      const target = e.target as HTMLElement
      const toggle = target.closest('.fold-toggle') as HTMLElement | null
      if (!toggle) return
      const heading = toggle.parentElement as HTMLElement | null
      if (heading) toggleSection(heading)
    }

    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [tab.content])

  // Convert local file paths to file:// URLs
  const resolveImageSrc = useCallback((src: string): string => {
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
  }, [tab.filePath])

  // Memoize the ReactMarkdown element so it isn't recreated (and the
  // components object isn't re-instantiated, which would force every
  // SyntaxHighlighter block to re-highlight) on unrelated re-renders.
  const markdownElement = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMark, remarkInlineTag]}
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
          if (isBlock && match[1] === 'mermaid') {
            return (
              <MermaidDiagram
                code={String(children).replace(/\n$/, '')}
                isDark={isDark}
              />
            )
          }
          if (isBlock) {
            return (
              <pre className="code-block">
                <SyntaxHighlighter
                  style={isDark ? oneDark : oneLight}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{ margin: 0, borderRadius: '8px', fontSize: '0.875em' }}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </pre>
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
  ), [processedContent, isDark, resolveImageSrc, handleWikiLink])

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
          {markdownElement}
        </div>
      </div>

      {modalImage && (
        <ImageModal src={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  )
}
