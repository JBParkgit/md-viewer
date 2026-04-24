import { useAppStore } from '../stores/useAppStore'
import { markRecentlySaved } from './recentSave'

export interface WikiLinkRewriteSummary {
  updatedFiles: string[]
  updatedLinks: number
  skippedDirtyFiles: string[]
}

interface WikiLinkMatch {
  full: string
  target: string
  alias: string | null
}

interface RenameRule {
  oldPath: string
  newPath: string
  oldRel: string
  newRel: string
  oldBase: string
  newBase: string
  pathOnly: boolean
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '').replace(/\/$/, '')
}

function stripMdExt(name: string): string {
  return name.replace(/\.md$/i, '')
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function relativeToProject(projectPath: string, filePath: string): string {
  const project = normalizePath(projectPath)
  const file = normalizePath(filePath)
  const prefix = project.endsWith('/') ? project : project + '/'
  if (file === project) return ''
  return file.startsWith(prefix) ? file.slice(prefix.length) : file
}

function basenameNoExt(filePath: string): string {
  const name = normalizePath(filePath).split('/').pop() || filePath
  return stripMdExt(name)
}

function getWikiMatches(content: string): WikiLinkMatch[] {
  const matches: WikiLinkMatch[] = []
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    matches.push({ full: m[0], target: m[1].trim(), alias: m[2] ?? null })
  }
  return matches
}

function replaceWikiLinks(content: string, rewrite: (target: string) => string | null): { content: string; count: number } {
  let count = 0
  const next = content.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_full, rawTarget: string, rawAlias?: string) => {
    const target = rawTarget.trim()
    const alias = rawAlias ?? null
    const rewritten = rewrite(target)
    if (!rewritten || rewritten === target) return _full
    count++
    return alias === null ? `[[${rewritten}]]` : `[[${rewritten}|${alias}]]`
  })
  return { content: next, count }
}

function buildRenameRule(
  projectPath: string,
  oldPath: string,
  newPath: string,
  oldBaseCounts: Map<string, number>,
): RenameRule | null {
  const oldRelWithExt = relativeToProject(projectPath, oldPath)
  const newRelWithExt = relativeToProject(projectPath, newPath)
  if (!/\.md$/i.test(oldRelWithExt) || !/\.md$/i.test(newRelWithExt)) return null
  const oldRel = stripMdExt(oldRelWithExt)
  const newRel = stripMdExt(newRelWithExt)
  const oldBase = stripMdExt((oldRelWithExt.split('/').pop() || oldRelWithExt))
  const newBase = stripMdExt((newRelWithExt.split('/').pop() || newRelWithExt))
  return {
    oldPath: normalizePath(oldPath),
    newPath: normalizePath(newPath),
    oldRel,
    newRel,
    oldBase,
    newBase,
    pathOnly: oldBase === newBase || (oldBaseCounts.get(oldBase.toLowerCase()) ?? 0) !== 1,
  }
}

function rewriteTarget(target: string, rules: RenameRule[]): string | null {
  const normalized = normalizePath(target)
  for (const rule of rules) {
    if (normalized === rule.oldRel) return rule.newRel
    if (normalized.startsWith(rule.oldRel + '/')) return rule.newRel + normalized.slice(rule.oldRel.length)
    if (!normalized.includes('/') && !rule.pathOnly && normalized.toLowerCase() === rule.oldBase.toLowerCase()) {
      return rule.newBase
    }
  }
  return null
}

export async function updateWikiLinksForPathChanges(
  projectPath: string,
  oldToNew: Array<{ oldPath: string; newPath: string }>,
): Promise<WikiLinkRewriteSummary> {
  if (oldToNew.length === 0) return { updatedFiles: [], updatedLinks: 0, skippedDirtyFiles: [] }

  const mdFiles = await window.electronAPI.listMdFiles(projectPath)
  const oldBaseCounts = new Map<string, number>()
  for (const path of mdFiles) {
    const base = basenameNoExt(path).toLowerCase()
    oldBaseCounts.set(base, (oldBaseCounts.get(base) ?? 0) + 1)
  }
  for (const { oldPath } of oldToNew) {
    if (!/\.md$/i.test(oldPath)) continue
    const base = basenameNoExt(oldPath).toLowerCase()
    if (!oldBaseCounts.has(base)) oldBaseCounts.set(base, 1)
  }

  const rules = oldToNew
    .map(({ oldPath, newPath }) => buildRenameRule(projectPath, oldPath, newPath, oldBaseCounts))
    .filter((v): v is RenameRule => !!v)
  if (rules.length === 0) return { updatedFiles: [], updatedLinks: 0, skippedDirtyFiles: [] }

  const updatedFiles: string[] = []
  let updatedLinks = 0
  const skippedDirtyFiles: string[] = []

  for (const filePath of mdFiles) {
    const openTab = [...useAppStore.getState().tabs, ...useAppStore.getState().rightTabs].find(t => t.filePath === filePath)
    if (openTab?.isDirty) {
      const source = openTab.content
      const preview = replaceWikiLinks(source, (target) => rewriteTarget(target, rules))
      if (preview.count > 0) skippedDirtyFiles.push(filePath)
      continue
    }
    const res = await window.electronAPI.readFile(filePath)
    const source = openTab?.content ?? res.content
    if ((!res.success && !openTab) || source === undefined) continue
    const { content, count } = replaceWikiLinks(source, (target) => rewriteTarget(target, rules))
    if (count === 0 || content === source) continue
    markRecentlySaved(filePath)
    const write = await window.electronAPI.writeFile(filePath, content)
    if (!write.success) continue
    if (openTab) useAppStore.getState().markTabSaved(openTab.id, content)
    updatedFiles.push(filePath)
    updatedLinks += count
  }

  return { updatedFiles, updatedLinks, skippedDirtyFiles }
}

export function describeWikiLinkUpdates(files: string[], linkCount: number): string {
  if (files.length === 0 || linkCount === 0) return ''
  const fileWord = files.length === 1 ? '1 file' : `${files.length} files`
  const linkWord = linkCount === 1 ? '1 link' : `${linkCount} links`
  return `${fileWord}, ${linkWord}`
}

export function replaceTextualPath(content: string, oldRelPath: string, newRelPath: string): string {
  const oldNoExt = stripMdExt(normalizePath(oldRelPath))
  const newNoExt = stripMdExt(normalizePath(newRelPath))
  return content.replace(new RegExp(escapeRegExp(oldNoExt), 'g'), newNoExt)
}
