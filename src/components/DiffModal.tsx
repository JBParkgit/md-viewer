import { useEffect, useMemo, useState } from 'react'
import { lineDiff, type DiffLine } from '../utils/lineDiff'

interface Props {
  projectPath: string
  relPath: string
  leftRef: string
  rightRef: string
  leftLabel: string   // shown on the left header (e.g. "받기 전")
  rightLabel: string  // shown on the right header (e.g. "받기 후")
  onClose: () => void
}

export default function DiffModal({ projectPath, relPath, leftRef, rightRef, leftLabel, rightLabel, onClose }: Props) {
  const [leftContent, setLeftContent] = useState<string | null>(null)
  const [rightContent, setRightContent] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [leftMissing, setLeftMissing] = useState(false)
  const [rightMissing, setRightMissing] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLeftContent(null)
    setRightContent(null)
    setLeftMissing(false)
    setRightMissing(false)
    Promise.all([
      window.electronAPI.gitFileShow(projectPath, leftRef, relPath),
      window.electronAPI.gitFileShow(projectPath, rightRef, relPath),
    ]).then(([l, r]) => {
      if (cancelled) return
      // gitFileShow fails when the file did not exist at that ref (added / deleted).
      // Surface that as "missing" so the UI can label the side accordingly instead
      // of showing a confusing empty pane.
      setLeftContent(l.success ? (l.output || '') : '')
      setLeftMissing(!l.success)
      setRightContent(r.success ? (r.output || '') : '')
      setRightMissing(!r.success)
      setLoading(false)
    }).catch(() => {
      if (cancelled) return
      setLeftContent('')
      setRightContent('')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [projectPath, relPath, leftRef, rightRef])

  const diff = useMemo(() => {
    if (leftContent === null || rightContent === null) return null
    return lineDiff(leftContent, rightContent)
  }, [leftContent, rightContent])

  const summary = useMemo(() => {
    if (!diff) return null
    let added = 0, removed = 0
    for (const d of diff.lines) {
      if (d.type === 'insert') added++
      else if (d.type === 'delete') removed++
    }
    return { added, removed }
  }, [diff])

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/60" onClick={onClose} />
      <div className="fixed inset-0 z-[201] flex items-center justify-center pointer-events-none p-4">
        <div className="pointer-events-auto bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col w-full max-w-6xl h-[85vh]">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.7} d="M8 7h8m-8 5h8m-5 5h5M3 5l3 3-3 3" />
            </svg>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate" title={relPath}>
                {relPath}
              </div>
              <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                <span className="text-gray-500 dark:text-gray-400">{leftLabel}</span>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
                <span className="text-gray-700 dark:text-gray-300">{rightLabel}</span>
                {summary && (
                  <span className="ml-2 inline-flex items-center gap-1">
                    <span className="text-green-600 dark:text-green-400">+{summary.added}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-red-500 dark:text-red-400">-{summary.removed}</span>
                  </span>
                )}
                {diff?.truncated && (
                  <span className="ml-2 text-orange-500">파일이 커서 정렬 없이 표시</span>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
              title="닫기 (Esc)"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Sub-header: left/right column labels */}
          <div className="grid grid-cols-2 px-0 text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 border-r border-gray-200 dark:border-gray-700">
              {leftLabel}{leftMissing && ' · 이 시점에는 없는 파일'}
            </div>
            <div className="px-3 py-1.5">
              {rightLabel}{rightMissing && ' · 이 시점에는 없는 파일'}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {loading && <div className="p-6 text-xs text-gray-400">불러오는 중...</div>}
            {!loading && diff && summary && summary.added === 0 && summary.removed === 0 && (
              <div className="p-6 text-xs text-gray-400">두 시점 사이에 변경 사항이 없습니다.</div>
            )}
            {!loading && diff && (summary?.added || summary?.removed) ? (
              <DiffSideBySide lines={diff.lines} />
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

interface Row {
  leftNo: number | null
  rightNo: number | null
  leftText: string
  rightText: string
  leftKind: 'equal' | 'delete' | 'empty'
  rightKind: 'equal' | 'insert' | 'empty'
}

function buildRows(lines: DiffLine[]): Row[] {
  const rows: Row[] = []
  let i = 0
  while (i < lines.length) {
    const ln = lines[i]
    if (ln.type === 'equal') {
      rows.push({
        leftNo: ln.leftNo, rightNo: ln.rightNo,
        leftText: ln.left, rightText: ln.right,
        leftKind: 'equal', rightKind: 'equal',
      })
      i++
      continue
    }
    // Group a contiguous run of deletes+inserts so we can pair them visually.
    const dels: { left: string; leftNo: number }[] = []
    const ins: { right: string; rightNo: number }[] = []
    while (i < lines.length && lines[i].type !== 'equal') {
      const cur = lines[i]
      if (cur.type === 'delete') dels.push({ left: cur.left, leftNo: cur.leftNo })
      else if (cur.type === 'insert') ins.push({ right: cur.right, rightNo: cur.rightNo })
      i++
    }
    const max = Math.max(dels.length, ins.length)
    for (let k = 0; k < max; k++) {
      const d = dels[k]
      const ip = ins[k]
      rows.push({
        leftNo: d ? d.leftNo : null,
        rightNo: ip ? ip.rightNo : null,
        leftText: d ? d.left : '',
        rightText: ip ? ip.right : '',
        leftKind: d ? 'delete' : 'empty',
        rightKind: ip ? 'insert' : 'empty',
      })
    }
  }
  return rows
}

function DiffSideBySide({ lines }: { lines: DiffLine[] }) {
  const rows = useMemo(() => buildRows(lines), [lines])
  return (
    <table className="w-full border-collapse font-mono text-[12px] leading-snug">
      <colgroup>
        <col style={{ width: '3rem' }} />
        <col style={{ width: '50%' }} />
        <col style={{ width: '3rem' }} />
        <col style={{ width: '50%' }} />
      </colgroup>
      <tbody>
        {rows.map((r, idx) => {
          const leftBg =
            r.leftKind === 'delete' ? 'bg-red-50 dark:bg-red-900/20'
            : r.leftKind === 'empty' ? 'bg-gray-50 dark:bg-gray-900/40'
            : ''
          const rightBg =
            r.rightKind === 'insert' ? 'bg-green-50 dark:bg-green-900/20'
            : r.rightKind === 'empty' ? 'bg-gray-50 dark:bg-gray-900/40'
            : ''
          const leftTextColor = r.leftKind === 'delete' ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'
          const rightTextColor = r.rightKind === 'insert' ? 'text-green-700 dark:text-green-300' : 'text-gray-800 dark:text-gray-200'
          return (
            <tr key={idx}>
              <td className={`px-2 py-0.5 text-right text-gray-400 select-none border-r border-gray-200 dark:border-gray-700 align-top ${leftBg}`}>
                {r.leftNo ?? ''}
              </td>
              <td className={`px-2 py-0.5 whitespace-pre-wrap break-words align-top ${leftBg} ${leftTextColor}`}>
                {r.leftText || (r.leftKind === 'empty' ? ' ' : '')}
              </td>
              <td className={`px-2 py-0.5 text-right text-gray-400 select-none border-l border-r border-gray-200 dark:border-gray-700 align-top ${rightBg}`}>
                {r.rightNo ?? ''}
              </td>
              <td className={`px-2 py-0.5 whitespace-pre-wrap break-words align-top ${rightBg} ${rightTextColor}`}>
                {r.rightText || (r.rightKind === 'empty' ? ' ' : '')}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
