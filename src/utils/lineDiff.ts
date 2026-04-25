// Minimal LCS-based line diff. We avoid pulling in a 3rd-party diff package
// because markdown documents are usually small (<500 lines) and a hand-rolled
// O(n*m) DP is plenty fast and deterministic at this size.

export type DiffLine =
  | { type: 'equal'; left: string; right: string; leftNo: number; rightNo: number }
  | { type: 'delete'; left: string; leftNo: number }
  | { type: 'insert'; right: string; rightNo: number }

// Guard: skip the LCS when both sides exceed this many lines. With a Uint16Array
// the 4000×4000 DP table is ~32MB, which is fine, but anything bigger would
// briefly stall the renderer thread. Real markdown rarely hits this.
const MAX_LCS_LINES = 4000

export interface DiffResult {
  lines: DiffLine[]
  truncated: boolean   // true if the file was too large to LCS-diff
}

export function lineDiff(a: string, b: string): DiffResult {
  const aLines = a.split('\n')
  const bLines = b.split('\n')
  const n = aLines.length
  const m = bLines.length

  if (n > MAX_LCS_LINES || m > MAX_LCS_LINES) {
    // Fallback: dump both sides without alignment so users still see the content.
    const lines: DiffLine[] = []
    for (let i = 0; i < n; i++) lines.push({ type: 'delete', left: aLines[i], leftNo: i + 1 })
    for (let j = 0; j < m; j++) lines.push({ type: 'insert', right: bLines[j], rightNo: j + 1 })
    return { lines, truncated: true }
  }

  // Backwards LCS so we can walk forward during backtrack.
  // Uint16Array works as long as no row's LCS length exceeds 65535 — true at 4000-line cap.
  const stride = m + 1
  const dp = new Uint16Array((n + 1) * stride)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const idx = i * stride + j
      if (aLines[i] === bLines[j]) {
        dp[idx] = dp[(i + 1) * stride + (j + 1)] + 1
      } else {
        const down = dp[(i + 1) * stride + j]
        const right = dp[i * stride + (j + 1)]
        dp[idx] = down > right ? down : right
      }
    }
  }

  const out: DiffLine[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (aLines[i] === bLines[j]) {
      out.push({ type: 'equal', left: aLines[i], right: bLines[j], leftNo: i + 1, rightNo: j + 1 })
      i++; j++
    } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
      out.push({ type: 'delete', left: aLines[i], leftNo: i + 1 })
      i++
    } else {
      out.push({ type: 'insert', right: bLines[j], rightNo: j + 1 })
      j++
    }
  }
  while (i < n) { out.push({ type: 'delete', left: aLines[i], leftNo: i + 1 }); i++ }
  while (j < m) { out.push({ type: 'insert', right: bLines[j], rightNo: j + 1 }); j++ }
  return { lines: out, truncated: false }
}
