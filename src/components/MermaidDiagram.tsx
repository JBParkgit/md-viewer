import { useEffect, useRef, useState } from 'react'

interface Props {
  code: string
  isDark: boolean
}

// Lazy-loaded mermaid singleton so the ~2MB library stays out of the initial bundle
let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default)
  }
  return mermaidPromise
}

let idCounter = 0

export default function MermaidDiagram({ code, isDark }: Props) {
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef<string>(`mermaid-${++idCounter}`)

  useEffect(() => {
    let cancelled = false
    setError(null)

    loadMermaid()
      .then((mermaid) => {
        if (cancelled) return
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        })
        // Render to SVG string
        return mermaid.render(idRef.current, code)
      })
      .then((result) => {
        if (cancelled || !result) return
        setSvg(result.svg)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        // mermaid sometimes leaves an error div in the DOM — clean it up
        document.querySelectorAll(`#d${idRef.current}`).forEach((el) => el.remove())
        const msg = e instanceof Error ? e.message : String(e)
        setError(msg)
      })

    return () => {
      cancelled = true
    }
  }, [code, isDark])

  if (error) {
    return (
      <div className="my-4 p-3 rounded border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs">
        <div className="font-semibold mb-1">Mermaid 렌더 오류</div>
        <pre className="whitespace-pre-wrap font-mono">{error}</pre>
        <details className="mt-2 opacity-70">
          <summary className="cursor-pointer">원본 코드</summary>
          <pre className="whitespace-pre-wrap font-mono mt-1">{code}</pre>
        </details>
      </div>
    )
  }

  if (!svg) {
    return (
      <div className="my-4 p-3 text-xs text-gray-500 dark:text-gray-400 italic">
        Mermaid 렌더링…
      </div>
    )
  }

  return (
    <div
      className="my-4 flex justify-center mermaid-diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
