import { create } from 'zustand'
import { parseWorkflow, type WorkflowMeta, type WorkflowStatus } from '../utils/frontmatter'

export interface WorkflowEntry {
  filePath: string
  fileName: string
  projectPath: string
  meta: WorkflowMeta
}

interface WorkflowStore {
  entries: Record<string, WorkflowEntry>  // keyed by filePath
  scanning: boolean
  lastScanAt: number | null

  scanProjects: (projectPaths: string[]) => Promise<void>
  scanProject: (projectPath: string) => Promise<void>
  refreshFile: (filePath: string, projectPath?: string) => Promise<void>
  removeFile: (filePath: string) => void

  getEntries: () => WorkflowEntry[]
  getByStatus: (status: WorkflowStatus) => WorkflowEntry[]
  getReceivedRequests: (user: string) => WorkflowEntry[]
  getMyDrafts: (user: string) => WorkflowEntry[]
}

function fileNameOf(p: string): string {
  return p.replace(/\\/g, '/').split('/').pop() || p
}

function findProjectForFile(filePath: string, projectPaths: string[]): string {
  const norm = filePath.replace(/\\/g, '/')
  let best = ''
  for (const p of projectPaths) {
    const pn = p.replace(/\\/g, '/')
    if (norm.startsWith(pn) && pn.length > best.length) best = p
  }
  return best
}

export const useWorkflowStore = create<WorkflowStore>((set, get) => ({
  entries: {},
  scanning: false,
  lastScanAt: null,

  scanProjects: async (projectPaths) => {
    if (projectPaths.length === 0) {
      set({ entries: {}, lastScanAt: Date.now() })
      return
    }
    set({ scanning: true })
    const next: Record<string, WorkflowEntry> = {}
    for (const projectPath of projectPaths) {
      try {
        const files = await window.electronAPI.listMdFiles(projectPath)
        for (const filePath of files) {
          try {
            const res = await window.electronAPI.readFile(filePath)
            if (!res.success || res.content === undefined) continue
            const meta = parseWorkflow(res.content)
            if (!meta) continue
            next[filePath] = {
              filePath,
              fileName: fileNameOf(filePath),
              projectPath,
              meta,
            }
          } catch { /* skip */ }
        }
      } catch { /* skip */ }
    }
    set({ entries: next, scanning: false, lastScanAt: Date.now() })
  },

  scanProject: async (projectPath) => {
    try {
      const files = await window.electronAPI.listMdFiles(projectPath)
      const updates: Record<string, WorkflowEntry> = {}
      const seen = new Set<string>()
      for (const filePath of files) {
        seen.add(filePath)
        try {
          const res = await window.electronAPI.readFile(filePath)
          if (!res.success || res.content === undefined) continue
          const meta = parseWorkflow(res.content)
          if (!meta) continue
          updates[filePath] = {
            filePath,
            fileName: fileNameOf(filePath),
            projectPath,
            meta,
          }
        } catch { /* skip */ }
      }
      set(s => {
        // Drop stale entries from this project
        const pruned: Record<string, WorkflowEntry> = {}
        for (const [k, v] of Object.entries(s.entries)) {
          if (v.projectPath === projectPath) {
            if (seen.has(k) && updates[k]) pruned[k] = updates[k]
            // else removed (no workflow meta anymore or deleted)
          } else {
            pruned[k] = v
          }
        }
        for (const [k, v] of Object.entries(updates)) {
          pruned[k] = v
        }
        return { entries: pruned, lastScanAt: Date.now() }
      })
    } catch { /* skip */ }
  },

  refreshFile: async (filePath, projectPath) => {
    try {
      const res = await window.electronAPI.readFile(filePath)
      if (!res.success || res.content === undefined) {
        get().removeFile(filePath)
        return
      }
      const meta = parseWorkflow(res.content)
      if (!meta) {
        get().removeFile(filePath)
        return
      }
      set(s => ({
        entries: {
          ...s.entries,
          [filePath]: {
            filePath,
            fileName: fileNameOf(filePath),
            projectPath: projectPath || s.entries[filePath]?.projectPath || '',
            meta,
          },
        },
      }))
    } catch { /* skip */ }
  },

  removeFile: (filePath) => {
    set(s => {
      if (!s.entries[filePath]) return s
      const next = { ...s.entries }
      delete next[filePath]
      return { entries: next }
    })
  },

  getEntries: () => Object.values(get().entries),

  getByStatus: (status) => Object.values(get().entries).filter(e => e.meta.status === status),

  getReceivedRequests: (user) => {
    if (!user) return []
    return Object.values(get().entries).filter(e =>
      e.meta.status === 'review' &&
      e.meta.approvers.some(a => a.name === user && a.status === 'pending')
    )
  },

  getMyDrafts: (user) => {
    if (!user) return []
    return Object.values(get().entries).filter(e => e.meta.author === user && e.meta.status === 'draft')
  },
}))

export { findProjectForFile }
