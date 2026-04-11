const FM_REGEX = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

/**
 * A "block" in YAML frontmatter: one top-level key plus all its continuation
 * lines (indented children, list items, blanks). This is the unit both the tag
 * and workflow updaters operate on, so they can never accidentally tear apart
 * each other's nested structures.
 */
interface YamlBlock {
  key: string
  lines: string[]
}

/** Split a YAML body into top-level blocks. Lines that don't belong to any
 *  recognizable block (rare — usually just blanks at the start) are kept
 *  under a leading block with key === "". */
function parseYamlBlocks(yaml: string): YamlBlock[] {
  const blocks: YamlBlock[] = []
  let current: YamlBlock | null = null
  for (const rawLine of yaml.split(/\r?\n/)) {
    const topMatch = rawLine.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/)
    if (topMatch) {
      current = { key: topMatch[1], lines: [rawLine] }
      blocks.push(current)
    } else if (current) {
      current.lines.push(rawLine)
    } else {
      // Lines before the first key (blank lines, stray comments). Park them in
      // a leading "" block so they're preserved on rewrite.
      if (blocks.length === 0 || blocks[0].key !== '') {
        blocks.unshift({ key: '', lines: [rawLine] })
      } else {
        blocks[0].lines.push(rawLine)
      }
    }
  }
  return blocks
}

/** Re-serialize blocks into a YAML body, dropping empty trailing lines. */
function serializeYamlBlocks(blocks: YamlBlock[]): string {
  const lines: string[] = []
  for (const b of blocks) {
    for (const l of b.lines) lines.push(l)
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop()
  return lines.join('\n')
}

/** Replace (or remove) all blocks whose key is in `keysToReplace`, then
 *  append `replacement` lines (if any) at the end. */
function replaceBlocks(
  blocks: YamlBlock[],
  keysToReplace: Set<string>,
  replacement: { key: string; lines: string[] } | null,
): YamlBlock[] {
  const kept = blocks.filter(b => !keysToReplace.has(b.key))
  if (replacement && replacement.lines.length > 0) {
    kept.push({ key: replacement.key, lines: replacement.lines })
  }
  return kept
}

/** Parse Obsidian-style inline `#tag` mentions from the document body.
 *  Skips fenced code blocks, inline code spans, and markdown heading lines.
 *  Supports nested tags (`#project/alpha`) and Korean characters. */
export function parseInlineTags(content: string): string[] {
  const bodyWithoutFm = content.replace(FM_REGEX, '')
  const stripped = bodyWithoutFm.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '')
  const found = new Set<string>()
  for (const rawLine of stripped.split('\n')) {
    if (/^\s{0,3}#{1,6}\s+/.test(rawLine)) continue
    const cleaned = rawLine.replace(/`[^`]*`/g, '')
    const tagRe = /(^|[\s([{,;:!?])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu
    let m: RegExpExecArray | null
    while ((m = tagRe.exec(cleaned)) !== null) {
      const tag = m[2]
      if (/^\d+$/.test(tag)) continue
      found.add(tag)
    }
  }
  return [...found]
}

/** All tags for a document — frontmatter tags plus body `#tag` mentions. */
export function parseAllTags(content: string): string[] {
  const fm = parseFrontmatterTags(content)
  const inline = parseInlineTags(content)
  const seen = new Set(fm)
  const merged = [...fm]
  for (const t of inline) {
    if (!seen.has(t)) { seen.add(t); merged.push(t) }
  }
  return merged
}

/** Parse tags from YAML frontmatter */
export function parseFrontmatterTags(content: string): string[] {
  const match = content.match(FM_REGEX)
  if (!match) return []
  const yaml = match[1]
  const inlineMatch = yaml.match(/^tags:\s*\[([^\]]*)\]/m)
  if (inlineMatch) {
    return inlineMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  const listMatch = yaml.match(/^tags:\s*\n((?:\s*-\s*.+\n?)*)/m)
  if (listMatch) {
    return listMatch[1]
      .split('\n')
      .map(line => line.replace(/^\s*-\s*/, '').trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  }
  return []
}

/** Get content without frontmatter (for rendering) */
export function stripFrontmatter(content: string): string {
  return content.replace(FM_REGEX, '')
}

/** Update or insert tags in frontmatter. Operates on top-level blocks so it
 *  never disturbs nested workflow lists like `approvers:\n  - name: ...`. */
export function updateFrontmatterTags(content: string, tags: string[]): string {
  const tagLine = tags.length > 0 ? `tags: [${tags.join(', ')}]` : ''
  const match = content.match(FM_REGEX)

  if (match) {
    const blocks = parseYamlBlocks(match[1])
    const replaced = replaceBlocks(
      blocks,
      new Set(['tags']),
      tagLine ? { key: 'tags', lines: [tagLine] } : null,
    )
    const newYaml = serializeYamlBlocks(replaced)
    if (!newYaml.trim()) return content.replace(FM_REGEX, '')
    return content.replace(FM_REGEX, `---\n${newYaml}\n---\n`)
  }

  if (!tagLine) return content
  return `---\n${tagLine}\n---\n${content}`
}

// ── Workflow frontmatter ──────────────────────────────────────────────────

export type WorkflowStatus = 'draft' | 'review' | 'approved' | 'rejected'
export type ReviewerStatus = 'pending' | 'approved' | 'rejected'

export interface Reviewer {
  name: string
  status: ReviewerStatus
  comment?: string
  reviewedAt?: string
}

export type HistoryAction = 'requested' | 'approved' | 'rejected' | 'reverted'

export interface HistoryEntry {
  at: string          // YYYY-MM-DD
  by: string          // user name
  action: HistoryAction
  note?: string       // request note (for `requested`) or comment (for approve/reject)
}

export interface WorkflowMeta {
  status: WorkflowStatus
  author: string
  created?: string
  dueDate?: string
  /** Optional note from the author shown to approvers when review is requested. */
  requestNote?: string
  /** Chronological audit log of request/approve/reject cycles. Newest at end. */
  history: HistoryEntry[]
  /** Merged list of people who must approve. Legacy `reviewers` in frontmatter is read and merged here. */
  approvers: Reviewer[]
}

const EMPTY_WORKFLOW: WorkflowMeta = {
  status: 'draft',
  author: '',
  history: [],
  approvers: [],
}

interface ParsedFm {
  meta: Record<string, unknown>
  yaml: string
  body: string
  hasFm: boolean
}

function parseFm(content: string): ParsedFm {
  const match = content.match(FM_REGEX)
  if (!match) return { meta: {}, yaml: '', body: content, hasFm: false }
  const yaml = match[1]
  const body = content.slice(match[0].length)
  const meta = parseYamlLoose(yaml)
  return { meta, yaml, body, hasFm: true }
}

/** Very small YAML parser supporting scalars and the reviewer/approver list shape we write. */
function parseYamlLoose(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const lines = yaml.split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line || /^\s*#/.test(line)) { i++; continue }
    const scalarMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
    if (!scalarMatch) { i++; continue }
    const key = scalarMatch[1]
    const rawVal = scalarMatch[2]
    if (rawVal === '' || rawVal === undefined) {
      // Possibly a nested list of objects: lines starting with "  - name: ..."
      const items: Record<string, string>[] = []
      i++
      while (i < lines.length && /^\s*-\s/.test(lines[i])) {
        const item: Record<string, string> = {}
        // First line: "  - key: value"
        const first = lines[i].match(/^\s*-\s*([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
        if (first) item[first[1]] = unquote(first[2])
        i++
        while (i < lines.length && /^\s{4,}[A-Za-z_]/.test(lines[i]) && !/^\s*-\s/.test(lines[i])) {
          const sub = lines[i].match(/^\s+([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/)
          if (sub) item[sub[1]] = unquote(sub[2])
          i++
        }
        items.push(item)
      }
      if (items.length > 0) result[key] = items
      else result[key] = ''
      continue
    }
    // Inline list: [a, b]
    if (/^\[.*\]$/.test(rawVal)) {
      result[key] = rawVal.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean)
    } else {
      result[key] = unquote(rawVal)
    }
    i++
  }
  return result
}

function unquote(s: string): string {
  return s.replace(/^['"]|['"]$/g, '').trim()
}

function quoteIfNeeded(s: string): string {
  if (s === '' || /[:#,\[\]{}&*!|>'"%@`]/.test(s)) return JSON.stringify(s)
  return s
}

/** Parse workflow metadata from a markdown file content. Returns null if no workflow fields present. */
export function parseWorkflow(content: string): WorkflowMeta | null {
  const { meta, hasFm } = parseFm(content)
  if (!hasFm) return null
  const status = typeof meta.status === 'string' ? meta.status as string : null
  const author = typeof meta.author === 'string' ? meta.author : ''
  if (!status && !meta.reviewers && !meta.approvers) return null
  if (status && !['draft', 'review', 'approved', 'rejected'].includes(status)) return null

  const toReviewers = (v: unknown): Reviewer[] => {
    if (!Array.isArray(v)) return []
    return v.map(item => {
      const it = item as Record<string, string>
      const rs: ReviewerStatus = (it.status === 'approved' || it.status === 'rejected') ? it.status : 'pending'
      return {
        name: it.name || '',
        status: rs,
        comment: it.comment || '',
        reviewedAt: it.reviewedAt || '',
      }
    }).filter(r => r.name)
  }

  // Merge legacy reviewers + approvers into a single list, deduping by name.
  const legacyReviewers = toReviewers(meta.reviewers)
  const approvers = toReviewers(meta.approvers)
  const seen = new Set<string>()
  const merged: Reviewer[] = []
  for (const p of [...legacyReviewers, ...approvers]) {
    if (seen.has(p.name)) continue
    seen.add(p.name)
    merged.push(p)
  }

  // Parse history entries (nested list of objects, same shape as approvers parser).
  const history: HistoryEntry[] = []
  if (Array.isArray(meta.history)) {
    for (const item of meta.history) {
      const it = item as Record<string, string>
      const action = it.action
      if (action !== 'requested' && action !== 'approved' && action !== 'rejected' && action !== 'reverted') continue
      history.push({
        at: it.at || '',
        by: it.by || '',
        action,
        note: it.note || undefined,
      })
    }
  }

  return {
    status: (status as WorkflowStatus) || 'draft',
    author,
    created: typeof meta.created === 'string' ? meta.created : undefined,
    dueDate: typeof meta.dueDate === 'string' ? meta.dueDate : undefined,
    requestNote: typeof meta.requestNote === 'string' && meta.requestNote ? meta.requestNote : undefined,
    history,
    approvers: merged,
  }
}

const WORKFLOW_KEYS = new Set(['status', 'author', 'created', 'dueDate', 'requestNote', 'history', 'reviewers', 'approvers'])

function serializeWorkflow(wf: WorkflowMeta): string {
  const lines: string[] = []
  lines.push(`status: ${wf.status}`)
  if (wf.author) lines.push(`author: ${quoteIfNeeded(wf.author)}`)
  if (wf.created) lines.push(`created: ${wf.created}`)
  if (wf.dueDate) lines.push(`dueDate: ${wf.dueDate}`)
  if (wf.requestNote) lines.push(`requestNote: ${quoteIfNeeded(wf.requestNote)}`)
  if (wf.history.length === 0) {
    lines.push(`history: []`)
  } else {
    lines.push(`history:`)
    for (const h of wf.history) {
      lines.push(`  - at: ${h.at}`)
      lines.push(`    by: ${quoteIfNeeded(h.by)}`)
      lines.push(`    action: ${h.action}`)
      if (h.note) lines.push(`    note: ${quoteIfNeeded(h.note)}`)
    }
  }
  if (wf.approvers.length === 0) {
    lines.push(`approvers: []`)
  } else {
    lines.push(`approvers:`)
    for (const r of wf.approvers) {
      lines.push(`  - name: ${quoteIfNeeded(r.name)}`)
      lines.push(`    status: ${r.status}`)
      if (r.comment) lines.push(`    comment: ${quoteIfNeeded(r.comment)}`)
      if (r.reviewedAt) lines.push(`    reviewedAt: ${r.reviewedAt}`)
    }
  }
  return lines.join('\n')
}

/** Remove all workflow fields from frontmatter while preserving everything
 *  else (tags, custom fields, etc). If the resulting frontmatter is empty,
 *  the entire `---` block is stripped. */
export function removeFrontmatterWorkflow(content: string): string {
  const match = content.match(FM_REGEX)
  if (!match) return content
  const blocks = parseYamlBlocks(match[1])
  const kept = blocks.filter(b => !WORKFLOW_KEYS.has(b.key))
  const newYaml = serializeYamlBlocks(kept)
  if (!newYaml.trim()) return content.replace(FM_REGEX, '')
  return content.replace(FM_REGEX, `---\n${newYaml}\n---\n`)
}

/** Update or insert workflow fields in frontmatter, preserving other fields
 *  (notably `tags`) and their nested structures. */
export function updateFrontmatterWorkflow(content: string, wf: WorkflowMeta): string {
  const match = content.match(FM_REGEX)
  const wfLines = serializeWorkflow(wf).split('\n')
  if (match) {
    const blocks = parseYamlBlocks(match[1])
    // Strip every workflow-owned key (including legacy `reviewers`), then
    // append the freshly serialized workflow as one combined block. We use a
    // synthetic key (`__workflow__`) so a second update finds and replaces it.
    const replaced = replaceBlocks(
      blocks,
      WORKFLOW_KEYS,
      { key: 'status', lines: wfLines },
    )
    const newYaml = serializeYamlBlocks(replaced)
    return content.replace(FM_REGEX, `---\n${newYaml}\n---\n`)
  }
  const newYaml = wfLines.join('\n')
  return `---\n${newYaml}\n---\n${content}`
}

export function createInitialWorkflow(author: string): WorkflowMeta {
  return {
    status: 'draft',
    author,
    created: new Date().toISOString().slice(0, 10),
    history: [],
    approvers: [],
  }
}

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: '초안',
  review: '검토중',
  approved: '승인됨',
  rejected: '반려됨',
}

export const WORKFLOW_STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  review: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

export const WORKFLOW_STATUS_ICONS: Record<WorkflowStatus, string> = {
  draft: '📝',
  review: '👀',
  approved: '✅',
  rejected: '❌',
}

/** True if the given user is actively waiting to act on this doc. */
export function isPendingActionFor(wf: WorkflowMeta, user: string): boolean {
  if (!user) return false
  if (wf.status !== 'review') return false
  return wf.approvers.some(a => a.name === user && a.status === 'pending')
}

/** Apply an approver decision for the current user. Returns new meta or null if user isn't in the approvers list. */
export function applyDecision(
  wf: WorkflowMeta,
  user: string,
  decision: 'approved' | 'rejected',
  comment: string,
): WorkflowMeta | null {
  const now = new Date().toISOString().slice(0, 10)
  const approvers = wf.approvers.map(a =>
    a.name === user && a.status === 'pending'
      ? { ...a, status: decision, comment, reviewedAt: now }
      : a
  )
  const changed = approvers.some((a, i) => a !== wf.approvers[i])
  if (!changed) return null

  let status: WorkflowStatus = wf.status
  if (decision === 'rejected') {
    status = 'rejected'
  } else if (approvers.length > 0 && approvers.every(a => a.status === 'approved')) {
    status = 'approved'
  }
  const history: HistoryEntry[] = [
    ...wf.history,
    { at: now, by: user, action: decision, note: comment || undefined },
  ]
  return { ...wf, approvers, status, history }
}

export { EMPTY_WORKFLOW }
