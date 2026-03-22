import { create } from 'zustand'

export interface KanbanCard {
  id: string
  title: string
  description: string
  assignee: string
  dueDate: string
  labels: string[]
  linkedFiles: string[]
  createdAt: string
  completedAt: string
}

export interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

export interface KanbanBoard {
  id: string
  name: string
  columns: KanbanColumn[]
  labels: string[]
  archivedCards: KanbanCard[]
  archiveDays: number
  archiveColumnId: string
}

export interface KanbanProject {
  boards: KanbanBoard[]
  activeBoardId: string
}

interface KanbanStore {
  projects: Record<string, KanbanProject>
  loading: boolean

  loadProject: (projectPath: string) => Promise<void>
  saveProject: (projectPath: string) => Promise<void>

  // Board CRUD
  addBoard: (projectPath: string, name: string) => void
  removeBoard: (projectPath: string, boardId: string) => void
  renameBoard: (projectPath: string, boardId: string, name: string) => void
  setActiveBoard: (projectPath: string, boardId: string) => void

  // Column CRUD
  addColumn: (projectPath: string, boardId: string, title: string) => void
  removeColumn: (projectPath: string, boardId: string, columnId: string) => void
  renameColumn: (projectPath: string, boardId: string, columnId: string, title: string) => void

  // Card CRUD
  addCard: (projectPath: string, boardId: string, columnId: string, card: Omit<KanbanCard, 'id' | 'createdAt' | 'completedAt'>) => void
  updateCard: (projectPath: string, boardId: string, columnId: string, cardId: string, updates: Partial<KanbanCard>) => void
  removeCard: (projectPath: string, boardId: string, columnId: string, cardId: string) => void
  moveCard: (projectPath: string, boardId: string, fromColId: string, toColId: string, cardId: string, toIndex: number) => void

  // Archive
  archiveCard: (projectPath: string, boardId: string, columnId: string, cardId: string) => void
  restoreCard: (projectPath: string, boardId: string, cardId: string, toColumnId?: string) => void
  deleteArchivedCard: (projectPath: string, boardId: string, cardId: string) => void
  clearArchive: (projectPath: string, boardId: string) => void
  setArchiveDays: (projectPath: string, boardId: string, days: number) => void
  setArchiveColumnId: (projectPath: string, boardId: string, columnId: string) => void
  runAutoArchive: (projectPath: string, boardId: string) => void
}

let cardCounter = 0
let colCounter = 0
let boardCounter = 0

function createDefaultBoard(name = '기본 보드'): KanbanBoard {
  const col1 = `col-${++colCounter}`
  const col2 = `col-${++colCounter}`
  const col3 = `col-${++colCounter}`
  const col4 = `col-${++colCounter}`
  return {
    id: `board-${++boardCounter}`,
    name,
    columns: [
      { id: col1, title: '아이디어', cards: [] },
      { id: col2, title: '제작중', cards: [] },
      { id: col3, title: '검수중', cards: [] },
      { id: col4, title: '완료', cards: [] },
    ],
    labels: ['긴급', '버그', '기능', '개선', '문서'],
    archivedCards: [],
    archiveDays: 7,
    archiveColumnId: col4,
  }
}

function defaultProject(): KanbanProject {
  const board = createDefaultBoard()
  return { boards: [board], activeBoardId: board.id }
}

function syncCounters(proj: KanbanProject) {
  for (const board of proj.boards) {
    const bNum = parseInt(board.id.replace('board-', ''))
    if (bNum > boardCounter) boardCounter = bNum
    for (const col of board.columns) {
      const cNum = parseInt(col.id.replace('col-', ''))
      if (cNum > colCounter) colCounter = cNum
      for (const card of col.cards) {
        const kNum = parseInt(card.id.replace('card-', ''))
        if (kNum > cardCounter) cardCounter = kNum
      }
    }
    for (const card of (board.archivedCards || [])) {
      const kNum = parseInt(card.id.replace('card-', ''))
      if (kNum > cardCounter) cardCounter = kNum
    }
  }
}

// Migrate from old single-board format or fix missing fields
function migrateProject(data: unknown): KanbanProject {
  const raw = data as Record<string, unknown>
  // Old format: { columns, labels, ... } → wrap in project
  if (raw.columns && !raw.boards) {
    const board = raw as unknown as KanbanBoard
    if (!board.id) board.id = `board-${++boardCounter}`
    if (!board.name) board.name = '기본 보드'
    if (!board.archivedCards) board.archivedCards = []
    if (!board.archiveDays) board.archiveDays = 7
    if (!board.archiveColumnId && board.columns.length > 0) {
      board.archiveColumnId = board.columns[board.columns.length - 1].id
    }
    for (const col of board.columns) {
      for (const card of col.cards) {
        if (card.completedAt === undefined) card.completedAt = ''
        if (!card.linkedFiles) card.linkedFiles = (card as any).linkedFile ? [(card as any).linkedFile] : []
      }
    }
    return { boards: [board], activeBoardId: board.id }
  }
  // New format
  const proj = raw as unknown as KanbanProject
  if (!proj.boards) proj.boards = []
  if (proj.boards.length === 0) return defaultProject()
  for (const board of proj.boards) {
    if (!board.archivedCards) board.archivedCards = []
    if (!board.archiveDays) board.archiveDays = 7
    if (!board.archiveColumnId && board.columns.length > 0) {
      board.archiveColumnId = board.columns[board.columns.length - 1].id
    }
    for (const col of board.columns) {
      for (const card of col.cards) {
        if (card.completedAt === undefined) card.completedAt = ''
        if (!card.linkedFiles) card.linkedFiles = []
      }
    }
  }
  if (!proj.activeBoardId) proj.activeBoardId = proj.boards[0].id
  return proj
}

// Helper: update a specific board within a project
function updateBoard(proj: KanbanProject, boardId: string, fn: (b: KanbanBoard) => KanbanBoard): KanbanProject {
  return { ...proj, boards: proj.boards.map(b => b.id === boardId ? fn(b) : b) }
}

export const useKanbanStore = create<KanbanStore>((set, get) => ({
  projects: {},
  loading: false,

  loadProject: async (projectPath) => {
    set({ loading: true })
    try {
      const kanbanPath = projectPath.replace(/\\/g, '/') + '/.docuflow/kanban.json'
      const result = await window.electronAPI.readFile(kanbanPath)
      if (result.success && result.content) {
        const proj = migrateProject(JSON.parse(result.content))
        syncCounters(proj)
        set(s => ({ projects: { ...s.projects, [projectPath]: proj }, loading: false }))
        // Auto-archive active board
        const activeBoard = proj.boards.find(b => b.id === proj.activeBoardId)
        if (activeBoard) get().runAutoArchive(projectPath, activeBoard.id)
      } else {
        set(s => ({ projects: { ...s.projects, [projectPath]: defaultProject() }, loading: false }))
      }
    } catch {
      set(s => ({ projects: { ...s.projects, [projectPath]: defaultProject() }, loading: false }))
    }
  },

  saveProject: async (projectPath) => {
    const proj = get().projects[projectPath]
    if (!proj) return
    const dirPath = projectPath.replace(/\\/g, '/') + '/.docuflow'
    const filePath = dirPath + '/kanban.json'
    await window.electronAPI.createDir(dirPath).catch(() => {})
    await window.electronAPI.writeFile(filePath, JSON.stringify(proj, null, 2))
  },

  // ── Board CRUD ───────────────────────────────────────────────────────────

  addBoard: (projectPath, name) => {
    const board = createDefaultBoard(name)
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = { ...proj, boards: [...proj.boards, board], activeBoardId: board.id }
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  removeBoard: (projectPath, boardId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj || proj.boards.length <= 1) return s
      const boards = proj.boards.filter(b => b.id !== boardId)
      const activeBoardId = proj.activeBoardId === boardId ? boards[0].id : proj.activeBoardId
      return { projects: { ...s.projects, [projectPath]: { boards, activeBoardId } } }
    })
    get().saveProject(projectPath)
  },

  renameBoard: (projectPath, boardId, name) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({ ...b, name }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  setActiveBoard: (projectPath, boardId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      return { projects: { ...s.projects, [projectPath]: { ...proj, activeBoardId: boardId } } }
    })
    get().saveProject(projectPath)
    get().runAutoArchive(projectPath, boardId)
  },

  // ── Column CRUD ──────────────────────────────────────────────────────────

  addColumn: (projectPath, boardId, title) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const newCol: KanbanColumn = { id: `col-${++colCounter}`, title, cards: [] }
      const updated = updateBoard(proj, boardId, b => ({ ...b, columns: [...b.columns, newCol] }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  removeColumn: (projectPath, boardId, columnId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => {
        const cols = b.columns.filter(c => c.id !== columnId)
        const archiveColumnId = b.archiveColumnId === columnId && cols.length > 0
          ? cols[cols.length - 1].id : b.archiveColumnId
        return { ...b, columns: cols, archiveColumnId }
      })
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  renameColumn: (projectPath, boardId, columnId, title) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({
        ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, title } : c),
      }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  // ── Card CRUD ────────────────────────────────────────────────────────────

  addCard: (projectPath, boardId, columnId, card) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => {
        const newCard: KanbanCard = {
          ...card, id: `card-${++cardCounter}`,
          createdAt: new Date().toISOString(),
          completedAt: columnId === b.archiveColumnId ? new Date().toISOString() : '',
        }
        return { ...b, columns: b.columns.map(c => c.id === columnId ? { ...c, cards: [...c.cards, newCard] } : c) }
      })
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  updateCard: (projectPath, boardId, columnId, cardId, updates) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({
        ...b, columns: b.columns.map(c =>
          c.id === columnId ? { ...c, cards: c.cards.map(card => card.id === cardId ? { ...card, ...updates } : card) } : c
        ),
      }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  removeCard: (projectPath, boardId, columnId, cardId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({
        ...b, columns: b.columns.map(c =>
          c.id === columnId ? { ...c, cards: c.cards.filter(card => card.id !== cardId) } : c
        ),
      }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  moveCard: (projectPath, boardId, fromColId, toColId, cardId, toIndex) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => {
        const fromCol = b.columns.find(c => c.id === fromColId)
        if (!fromCol) return b
        const card = fromCol.cards.find(c => c.id === cardId)
        if (!card) return b
        const movedCard = { ...card }
        if (toColId === b.archiveColumnId && fromColId !== b.archiveColumnId) {
          movedCard.completedAt = new Date().toISOString()
        } else if (toColId !== b.archiveColumnId && fromColId === b.archiveColumnId) {
          movedCard.completedAt = ''
        }
        return {
          ...b, columns: b.columns.map(c => {
            if (c.id === fromColId && c.id === toColId) {
              const cards = c.cards.filter(x => x.id !== cardId); cards.splice(toIndex, 0, movedCard); return { ...c, cards }
            }
            if (c.id === fromColId) return { ...c, cards: c.cards.filter(x => x.id !== cardId) }
            if (c.id === toColId) { const cards = [...c.cards]; cards.splice(toIndex, 0, movedCard); return { ...c, cards } }
            return c
          }),
        }
      })
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  // ── Archive ──────────────────────────────────────────────────────────────

  archiveCard: (projectPath, boardId, columnId, cardId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => {
        const col = b.columns.find(c => c.id === columnId)
        if (!col) return b
        const card = col.cards.find(c => c.id === cardId)
        if (!card) return b
        return {
          ...b,
          columns: b.columns.map(c => c.id === columnId ? { ...c, cards: c.cards.filter(x => x.id !== cardId) } : c),
          archivedCards: [...b.archivedCards, { ...card, completedAt: card.completedAt || new Date().toISOString() }],
        }
      })
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  restoreCard: (projectPath, boardId, cardId, toColumnId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => {
        const card = b.archivedCards.find(c => c.id === cardId)
        if (!card) return b
        const targetCol = toColumnId || (b.columns.length > 0 ? b.columns[0].id : null)
        if (!targetCol) return b
        return {
          ...b,
          archivedCards: b.archivedCards.filter(c => c.id !== cardId),
          columns: b.columns.map(c => c.id === targetCol ? { ...c, cards: [...c.cards, { ...card, completedAt: '' }] } : c),
        }
      })
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  deleteArchivedCard: (projectPath, boardId, cardId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({
        ...b, archivedCards: b.archivedCards.filter(c => c.id !== cardId),
      }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  clearArchive: (projectPath, boardId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({ ...b, archivedCards: [] }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  setArchiveDays: (projectPath, boardId, days) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({ ...b, archiveDays: Math.max(1, days) }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  setArchiveColumnId: (projectPath, boardId, columnId) => {
    set(s => {
      const proj = s.projects[projectPath]
      if (!proj) return s
      const updated = updateBoard(proj, boardId, b => ({ ...b, archiveColumnId: columnId }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },

  runAutoArchive: (projectPath, boardId) => {
    const proj = get().projects[projectPath]
    if (!proj) return
    const board = proj.boards.find(b => b.id === boardId)
    if (!board) return
    const archiveCol = board.columns.find(c => c.id === board.archiveColumnId)
    if (!archiveCol) return

    const now = Date.now()
    const msThreshold = board.archiveDays * 86400000
    const toArchive = archiveCol.cards.filter(card => card.completedAt && (now - new Date(card.completedAt).getTime()) >= msThreshold)
    if (toArchive.length === 0) return

    const archiveIds = new Set(toArchive.map(c => c.id))
    set(s => {
      const currentProj = s.projects[projectPath]
      if (!currentProj) return s
      const updated = updateBoard(currentProj, boardId, b => ({
        ...b,
        columns: b.columns.map(c =>
          c.id === b.archiveColumnId ? { ...c, cards: c.cards.filter(card => !archiveIds.has(card.id)) } : c
        ),
        archivedCards: [...b.archivedCards, ...toArchive],
      }))
      return { projects: { ...s.projects, [projectPath]: updated } }
    })
    get().saveProject(projectPath)
  },
}))
