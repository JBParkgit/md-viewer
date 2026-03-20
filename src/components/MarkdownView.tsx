import { useRef, useEffect, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useAppStore, type Tab } from '../stores/useAppStore'
import ImageModal from './ImageModal'

interface Props {
  tab: Tab
}

export default function MarkdownView({ tab }: Props) {
  const { darkMode, setTabScrollPos } = useAppStore()
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))
  const containerRef = useRef<HTMLDivElement>(null)
  const [modalImage, setModalImage] = useState<string | null>(null)

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

  // Convert local file paths to file:// URLs
  const resolveImageSrc = (src: string): string => {
    if (!src) return src
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://') || src.startsWith('data:')) {
      return src
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
        <div className="markdown-body text-gray-900 dark:text-gray-100">
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
            {tab.content}
          </ReactMarkdown>
        </div>
      </div>

      {modalImage && (
        <ImageModal src={modalImage} onClose={() => setModalImage(null)} />
      )}
    </div>
  )
}
