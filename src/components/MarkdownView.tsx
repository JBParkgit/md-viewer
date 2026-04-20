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
  onScroll?: () => void
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function getAstText(node: any): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || ''
  if (node.children && Array.isArray(node.children)) return node.children.map(getAstText).join('')
  return ''
}

function visitHeadings(node: any, visitor: (n: any) => void) {
  if (node.type === 'heading') visitor(node)
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) visitHeadings(child, visitor)
  }
}

function remarkHeadingId() {
  return (tree: any) => {
    const slugCounts = new Map<string, number>()
    visitHeadings(tree, (node) => {
      const text = getAstText(node)
      let slug = slugify(text)
      const count = slugCounts.get(slug) ?? 0
      if (count > 0) slug = `${slug}-${count}`
      slugCounts.set(slug, count + 1)
      
      node.data = node.data || {}
      node.data.hProperties = node.data.hProperties || {}
      node.data.hProperties.id = slug
    })
  }
}

function visitBlocks(node: any, visitor: (n: any) => void) {
  const isBlock = ['paragraph', 'heading', 'list', 'listItem', 'code', 'blockquote', 'table', 'thematicBreak', 'html'].includes(node.type)
  if (isBlock) visitor(node)
  if (node.children && Array.isArray(node.children)) {
    for (const child of node.children) visitBlocks(child, visitor)
  }
}

function remarkLinePosition(options = { fmOffset: 0 }) {
  return (tree: any) => {
    visitBlocks(tree, (node) => {
      if (node.position && node.position.start) {
        node.data = node.data || {}
        node.data.hProperties = node.data.hProperties || {}
        node.data.hProperties['data-line'] = node.position.start.line + options.fmOffset
        node.data.hProperties['data-line-end'] = Math.max(
          node.position.start.line + options.fmOffset, 
          node.position.end?.line ? node.position.end.line + options.fmOffset : 0
        )
      }
    })
  }
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
  const slug = props.id || ""
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

export default function MarkdownView({ tab, scrollRef, lineNumbers, cursorLine, onScroll }: Props) {
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

  // Debounced save — declared before the restore effect so that the restore
  // effect can cancel any pending save.
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Restore scroll position. Preview-tab reuse keeps the same tab.id but
  // swaps filePath, so we explicitly detect that case and force top.
  const prevTabIdRef = useRef(tab.id)
  const prevFilePathRef = useRef(tab.filePath)
  useEffect(() => {
    if (!containerRef.current) return
    // A pending save from the previous file would otherwise land on the
    // new file (same preview tab.id) and pollute its saved scroll position.
    if (scrollSaveTimerRef.current) {
      clearTimeout(scrollSaveTimerRef.current)
      scrollSaveTimerRef.current = null
    }
    const isPreviewReuse =
      prevTabIdRef.current === tab.id && prevFilePathRef.current !== tab.filePath
    containerRef.current.scrollTop = isPreviewReuse ? 0 : tab.scrollPos
    prevTabIdRef.current = tab.id
    prevFilePathRef.current = tab.filePath
  }, [tab.id, tab.filePath])

  // Save scroll position — debounced so a fast scroll doesn't trigger
  // a store update (and thus a MarkdownView re-render) on every frame.
  // Scroll position only matters for restoration on tab switch, so
  // persisting it 200ms after scroll stops is fine. The callback verifies
  // the file is still the one that was scrolled, so a timer scheduled
  // before a preview-tab reuse can't corrupt the new file's scrollPos.
  const handleScroll = useCallback(() => {
    if (onScroll) onScroll()
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
    const scrolledPath = tab.filePath
    scrollSaveTimerRef.current = setTimeout(() => {
      if (!containerRef.current) return
      if (scrolledPath !== prevFilePathRef.current) return
      setTabScrollPos(tab.id, containerRef.current.scrollTop)
    }, 200)
  }, [tab.id, tab.filePath, setTabScrollPos, onScroll])
  useEffect(() => () => {
    if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
  }, [])

  const markdownBodyRef = useRef<HTMLDivElement>(null)

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
  const fmMatch = tab.content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  const fmOffset = fmMatch ? fmMatch[0].split('\n').length - 1 : 0
  
  const markdownElement = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[
        [remarkGfm, { singleTilde: false }], 
        remarkMark, 
        remarkInlineTag, 
        remarkHeadingId, 
        ...(lineNumbers ? [[remarkLinePosition, { fmOffset }]] : [])
      ] as any}
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
  ), [processedContent, isDark, resolveImageSrc, handleWikiLink, lineNumbers, fmOffset])


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
