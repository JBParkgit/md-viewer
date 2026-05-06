import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { useAppStore } from '../stores/useAppStore'
import remarkMark from '../utils/remarkMark'
import remarkInlineTag from '../utils/remarkInlineTag'
import { expandDetailsBlocks } from '../utils/expandDetailsBlocks'
import MermaidDiagram from './MermaidDiagram'
import { stripFrontmatter } from '../utils/frontmatter'

// GitHub-default sanitize schema with className/id allowed on every tag, so
// remarkInlineTag's <span class="inline-tag"> and our heading anchors survive.
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...((defaultSchema.attributes as any)?.['*'] ?? []), 'className', 'id'],
  },
}

interface Props {
  content: string
  /** Absolute path of the source file. Used to resolve relative image src. */
  basePath?: string
  className?: string
}

// Lightweight markdown renderer for read-only contexts (file history preview,
// diff "rendered" mode). Intentionally has none of MarkdownView's tab/store
// coupling: no scroll restoration, no fold toggles, no wiki-link navigation —
// historical/comparison content shouldn't pull the user out of the modal.
export default function ReadOnlyMarkdownPreview({ content, basePath, className }: Props) {
  const darkMode = useAppStore(s => s.darkMode)
  const isDark = darkMode === 'dark' ||
    (darkMode === 'system' && document.documentElement.classList.contains('dark'))

  // Same wikilink preprocessing as MarkdownView, with code-fence masking so
  // examples inside ``` blocks aren't rewritten.
  const processed = useMemo(() => {
    const src = stripFrontmatter(content)
    const tokens: string[] = []
    const masked = src
      .replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, (m) => {
        tokens.push(m)
        return `WLMASK${tokens.length - 1}`
      })
      .replace(
        /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
        (_, target, label) => `[${label || target}](docuflow://${encodeURIComponent(String(target).trim())})`,
      )
    const expanded = expandDetailsBlocks(masked)
    return expanded.replace(/WLMASK(\d+)/g, (_, i) => tokens[Number(i)])
  }, [content])

  const resolveImageSrc = useMemo(() => (src: string): string => {
    if (!src) return src
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://') || src.startsWith('data:')) {
      return src
    }
    if (/^[A-Za-z]:[\\/]/.test(src) || src.startsWith('/')) {
      return 'file:///' + src.replace(/\\/g, '/')
    }
    if (!basePath) return src
    const dir = basePath.replace(/[\\/][^\\/]+$/, '')
    const abs = `${dir}/${src}`.replace(/\\/g, '/')
    return `file:///${abs}`
  }, [basePath])

  return (
    <div className={`markdown-body text-gray-900 dark:text-gray-100 ${className || ''}`}>
      <ReactMarkdown
        remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMark, remarkInlineTag] as any}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]] as any}
        urlTransform={(url) => url}
        components={{
          code({ className: cls, children, ...props }) {
            const match = /language-(\w+)/.exec(cls || '')
            if (match && match[1] === 'mermaid') {
              return (
                <MermaidDiagram
                  code={String(children).replace(/\n$/, '')}
                  isDark={isDark}
                />
              )
            }
            if (match) {
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
            return <code className={cls} {...props}>{children}</code>
          },
          img({ src, alt, ...props }) {
            return <img src={resolveImageSrc(src || '')} alt={alt} {...props} />
          },
          a({ href, children, ...props }) {
            // Wikilinks: visible but inert — read-only previews shouldn't yank
            // the user into a different tab while inspecting history/diff.
            if (href?.startsWith('docuflow://')) {
              return (
                <span
                  className="text-purple-600 dark:text-purple-400 font-medium"
                  title="이 미리보기에서는 링크를 따라갈 수 없습니다"
                >
                  {children}
                </span>
              )
            }
            if (href?.startsWith('http')) {
              return (
                <a
                  href={href}
                  onClick={(e) => { e.preventDefault(); window.open(href, '_blank') }}
                  {...props}
                >
                  {children}
                </a>
              )
            }
            // Internal anchors and relative file paths: render as inert text
            // so a click doesn't navigate the embedding modal.
            return (
              <a
                href={href}
                onClick={(e) => e.preventDefault()}
                title="이 미리보기에서는 링크를 따라갈 수 없습니다"
                {...props}
              >
                {children}
              </a>
            )
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  )
}
