import { useState, useCallback } from 'react'

interface Props {
  onInsert: (markdown: string) => void
  onClose: () => void
}

export default function TableEditor({ onInsert, onClose }: Props) {
  const [rows, setRows] = useState(3)
  const [cols, setCols] = useState(3)
  const [cells, setCells] = useState<string[][]>(() =>
    Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => ''))
  )
  const [headers, setHeaders] = useState<string[]>(() =>
    Array.from({ length: 3 }, () => '')
  )

  const resize = useCallback((newRows: number, newCols: number) => {
    setRows(newRows)
    setCols(newCols)
    setHeaders(prev => {
      const h = [...prev]
      while (h.length < newCols) h.push('')
      return h.slice(0, newCols)
    })
    setCells(prev => {
      const c = prev.map(row => {
        const r = [...row]
        while (r.length < newCols) r.push('')
        return r.slice(0, newCols)
      })
      while (c.length < newRows) c.push(Array.from({ length: newCols }, () => ''))
      return c.slice(0, newRows)
    })
  }, [])

  const updateHeader = (col: number, value: string) => {
    setHeaders(prev => prev.map((h, i) => i === col ? value : h))
  }

  const updateCell = (row: number, col: number, value: string) => {
    setCells(prev => prev.map((r, ri) => ri === row ? r.map((c, ci) => ci === col ? value : c) : r))
  }

  const addRow = () => resize(rows + 1, cols)
  const addCol = () => resize(rows, cols + 1)
  const removeRow = (idx: number) => {
    if (rows <= 1) return
    setCells(prev => prev.filter((_, i) => i !== idx))
    setRows(r => r - 1)
  }
  const removeCol = (idx: number) => {
    if (cols <= 1) return
    setHeaders(prev => prev.filter((_, i) => i !== idx))
    setCells(prev => prev.map(row => row.filter((_, i) => i !== idx)))
    setCols(c => c - 1)
  }

  const generateMarkdown = () => {
    const pad = (s: string, len: number) => s.padEnd(len)
    const colWidths = Array.from({ length: cols }, (_, ci) => {
      const headerLen = (headers[ci] || `열${ci + 1}`).length
      const maxCell = Math.max(...cells.map(row => (row[ci] || '').length))
      return Math.max(headerLen, maxCell, 3)
    })

    const headerLine = '| ' + headers.map((h, i) => pad(h || `열${i + 1}`, colWidths[i])).join(' | ') + ' |'
    const separatorLine = '| ' + colWidths.map(w => '-'.repeat(w)).join(' | ') + ' |'
    const dataLines = cells.map(row =>
      '| ' + row.map((c, i) => pad(c || '', colWidths[i])).join(' | ') + ' |'
    )

    return [headerLine, separatorLine, ...dataLines].join('\n')
  }

  const handleInsert = () => {
    onInsert(generateMarkdown())
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 w-[700px] max-w-[90vw] max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">표 만들기</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700">
            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Table editor */}
        <div className="flex-1 overflow-auto p-5">
          <div className="overflow-x-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="w-6" />
                  {Array.from({ length: cols }, (_, ci) => (
                    <th key={ci} className="relative">
                      <input
                        value={headers[ci]}
                        onChange={e => updateHeader(ci, e.target.value)}
                        placeholder={`열${ci + 1}`}
                        className="w-full min-w-[80px] px-2 py-1.5 text-xs font-semibold bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-blue-400 text-center"
                      />
                      {cols > 1 && (
                        <button
                          onClick={() => removeCol(ci)}
                          className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                          title="열 삭제"
                        >x</button>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cells.map((row, ri) => (
                  <tr key={ri}>
                    <td className="pr-1">
                      {rows > 1 && (
                        <button
                          onClick={() => removeRow(ri)}
                          className="w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                          title="행 삭제"
                        >x</button>
                      )}
                    </td>
                    {row.map((cell, ci) => (
                      <td key={ci}>
                        <input
                          value={cell}
                          onChange={e => updateCell(ri, ci, e.target.value)}
                          className="w-full min-w-[80px] px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-blue-400"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-3">
            <button onClick={addRow} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              행 추가
            </button>
            <button onClick={addCol} className="flex items-center gap-1 px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              열 추가
            </button>
          </div>

          {/* Preview */}
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-400 mb-1">미리보기</div>
            <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre overflow-x-auto">
              {generateMarkdown()}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">
            취소
          </button>
          <button onClick={handleInsert} className="px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white">
            삽입
          </button>
        </div>
      </div>
    </div>
  )
}
