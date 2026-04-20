import { create } from 'zustand'
import { initProjectTemplates } from '../utils/mdTemplates'

export type TabFileType = 'md' | 'image' | 'pdf' | 'docx' | 'video' | 'other'

export const PREDEFINED_TAGS = [
  { id: 'in-progress', label: '진행중', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  { id: 'approved', label: '승인완료', color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  { id: 'review', label: '검토필요', color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  { id: 'draft', label: '초안', color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' },
  { id: 'final', label: '최종본', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
] as const

export type TagId = typeof PREDEFINED_TAGS[number]['id']

export interface Tab {
  id: string
  filePath: string
  fileName: string
  fileType: TabFileType
  content: string          // md: 텍스트 내용 / image: 사용 안 함
  isDirty: boolean
  isEditMode: boolean
  isPreview: boolean       // true = 임시 탭 (이탤릭), 다음 파일 클릭 시 교체
  scrollPos: number
  fileChangedOnDisk: boolean
}

export interface Project {
  id: string
  path: string           // root folder path
  name: string           // display name (last segment of path)
  collapsed: boolean
}

export type PaneId = 'left' | 'right'

interface AppStore {
  // Tabs (left pane — also the primary pane when not split)
  tabs: Tab[]
  activeTabId: string | null
  openTab: (filePath: string, fileName: string, content: string, fileType?: TabFileType, isPreview?: boolean) => void
  pinTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabContent: (tabId: string, content: string) => void
  markTabDirty: (tabId: string, dirty: boolean) => void
  setTabEditMode: (tabId: string, editMode: boolean) => void
  setTabScrollPos: (tabId: string, pos: number) => void
  setTabFileChanged: (filePath: string, changed: boolean) => void
  markTabSaved: (tabId: string, content: string) => void

  // Split pane
  splitMode: null | 'vertical'
  activePaneId: PaneId
  rightTabs: Tab[]
  rightActiveTabId: string | null
  toggleSplit: () => void
  closeSplit: () => void
  setActivePane: (paneId: PaneId) => void
  moveTabToPane: (tabId: string, targetPane: PaneId) => void

  // Projects (multiple root folders)
  projects: Project[]
  addProject: (folderPath: string) => void
  removeProject: (projectId: string) => void
  renameProject: (projectId: string, newName: string) => void
  reorderProject: (fromIndex: number, toIndex: number) => void
  toggleProjectCollapsed: (projectId: string) => void

  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void
  fullTextQuery: string
  setFullTextQuery: (query: string) => void
  searchProjectId: string | null   // which project to full-text search (null = all)
  setSearchProjectId: (id: string | null) => void

  // Last opened directory per project (for new file creation)
  lastOpenedDir: Record<string, string>
  setLastOpenedDir: (projectId: string, dirPath: string) => void

  // Expanded folder paths per project (persisted across sidebar tab switches)
  openDirs: Record<string, string[]>
  toggleOpenDir: (projectId: string, dirPath: string, isOpen: boolean) => void

  // Sidebar tab
  sidebarTab: 'tree' | 'favorites' | 'recent' | 'gallery' | 'tags' | 'docs' | 'git' | 'kanban' | 'calendar' | 'workflow'
  setSidebarTab: (tab: 'tree' | 'favorites' | 'recent' | 'gallery' | 'tags' | 'docs' | 'git' | 'kanban' | 'calendar' | 'workflow') => void
  gitSelectedProject: string | null
  setGitSelectedProject: (path: string | null) => void
  kanbanProjectPath: string | null
  setKanbanProjectPath: (path: string | null) => void
  imageNavProjectPath: string | null
  setImageNavProjectPath: (path: string | null) => void

  // Favorites
  favorites: string[]
  addFavorite: (filePath: string) => void
  removeFavorite: (filePath: string) => void

  // Recent files
  recentFiles: { path: string; name: string }[]
  addRecentFile: (path: string, name: string) => void

  // File tags
  fileTags: Record<string, string[]>
  addFileTag: (filePath: string, tagId: string) => void
  removeFileTag: (filePath: string, tagId: string) => void

  // Tag colors
  tagColors: Record<string, string>
  setTagColor: (tag: string, color: string) => void
  removeTagColor: (tag: string) => void

  // Project colors (projectId -> color index)
  projectColors: Record<string, number>
  setProjectColor: (projectId: string, colorIndex: number) => void

  // Sidebar visibility
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void

  // Settings
  darkMode: 'system' | 'light' | 'dark'
  setDarkMode: (mode: 'system' | 'light' | 'dark') => void
  fontSize: number
  setFontSize: (size: number) => void
  fontFamily: string
  setFontFamily: (font: string) => void
  showTOC: boolean
  setShowTOC: (show: boolean) => void
  spellcheckEnabled: boolean
  setSpellcheckEnabled: (enabled: boolean) => void
  rightPanelTab: 'toc' | 'links' | 'backlinks' | 'related' | 'workflow'
  setRightPanelTab: (tab: 'toc' | 'links' | 'backlinks' | 'related' | 'workflow') => void

  // Current user (for workflow author / reviewer identity)
  currentUser: string
  setCurrentUser: (name: string) => void
}

let tabCounter = 0
export let projectCounter = 0
export function setProjectCounter(n: number) { projectCounter = n }

function saveProjects(projects: Project[]) {
  window.electronAPI.storeSet('projects', projects.map(p => ({ path: p.path, name: p.name })))
}

export const useAppStore = create<AppStore>((set, get) => ({
  // ── Tabs ──────────────────────────────────────────────────────────────────
  tabs: [],
  activeTabId: null,

  // ── Split pane ───────────────────────────────────────────────────────────
  splitMode: null,
  activePaneId: 'left',
  rightTabs: [],
  rightActiveTabId: null,

  openTab: (filePath, fileName, content, fileType = 'md', isPreview = false) => {
    const state = get()
    const { activePaneId, splitMode } = state

    // Check both panes for existing tab
    const existingLeft = state.tabs.find(t => t.filePath === filePath)
    const existingRight = state.rightTabs.find(t => t.filePath === filePath)
    const existing = existingLeft || existingRight
    const existingPane: PaneId = existingLeft ? 'left' : 'right'

    if (existing) {
      const updates: Partial<AppStore> = { activePaneId: existingPane }
      if (!isPreview && existing.isPreview) {
        if (existingPane === 'left') {
          Object.assign(updates, {
            tabs: state.tabs.map(t => t.id === existing.id ? { ...t, isPreview: false } : t),
            activeTabId: existing.id,
          })
        } else {
          Object.assign(updates, {
            rightTabs: state.rightTabs.map(t => t.id === existing.id ? { ...t, isPreview: false } : t),
            rightActiveTabId: existing.id,
          })
        }
      } else {
        if (existingPane === 'left') updates.activeTabId = existing.id
        else updates.rightActiveTabId = existing.id
      }
      set(updates as any)
      return
    }

    const id = `tab-${++tabCounter}`
    const newTab: Tab = {
      id, filePath, fileName, fileType, content,
      isDirty: false, isEditMode: false, isPreview,
      scrollPos: 0, fileChangedOnDisk: false,
    }

    const pane = splitMode ? activePaneId : 'left'
    const paneTabs = pane === 'left' ? state.tabs : state.rightTabs
    const tabsKey = pane === 'left' ? 'tabs' : 'rightTabs'
    const activeKey = pane === 'left' ? 'activeTabId' : 'rightActiveTabId'

    if (isPreview) {
      const previewIdx = paneTabs.findIndex(t => t.isPreview)
      if (previewIdx !== -1) {
        const updated = [...paneTabs]
        updated[previewIdx] = { ...newTab, id: paneTabs[previewIdx].id }
        set({ [tabsKey]: updated, [activeKey]: paneTabs[previewIdx].id } as any)
        return
      }
    }

    set({ [tabsKey]: [...paneTabs, newTab], [activeKey]: id } as any)
  },

  pinTab: (tabId) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, isPreview: false } : t),
      rightTabs: s.rightTabs.map(t => t.id === tabId ? { ...t, isPreview: false } : t),
    }))
  },

  closeTab: (tabId) => {
    const state = get()
    const inLeft = state.tabs.some(t => t.id === tabId)
    const inRight = state.rightTabs.some(t => t.id === tabId)

    if (inLeft) {
      const idx = state.tabs.findIndex(t => t.id === tabId)
      const newTabs = state.tabs.filter(t => t.id !== tabId)
      let newActive = state.activeTabId
      if (state.activeTabId === tabId) {
        if (newTabs.length === 0) newActive = null
        else if (idx > 0) newActive = newTabs[idx - 1].id
        else newActive = newTabs[0].id
      }
      const updates: any = { tabs: newTabs, activeTabId: newActive }
      if (newTabs.length === 0 && state.splitMode) {
        updates.tabs = state.rightTabs
        updates.activeTabId = state.rightActiveTabId
        updates.rightTabs = []
        updates.rightActiveTabId = null
        updates.splitMode = null
        updates.activePaneId = 'left'
      }
      set(updates)
    } else if (inRight) {
      const idx = state.rightTabs.findIndex(t => t.id === tabId)
      const newTabs = state.rightTabs.filter(t => t.id !== tabId)
      let newActive = state.rightActiveTabId
      if (state.rightActiveTabId === tabId) {
        if (newTabs.length === 0) newActive = null
        else if (idx > 0) newActive = newTabs[idx - 1].id
        else newActive = newTabs[0].id
      }
      const updates: any = { rightTabs: newTabs, rightActiveTabId: newActive }
      if (newTabs.length === 0 && state.splitMode) {
        updates.splitMode = null
        updates.activePaneId = 'left'
      }
      set(updates)
    }
  },

  setActiveTab: (tabId) => {
    const state = get()
    if (state.tabs.some(t => t.id === tabId)) {
      set({ activeTabId: tabId, activePaneId: 'left' })
    } else if (state.rightTabs.some(t => t.id === tabId)) {
      set({ rightActiveTabId: tabId, activePaneId: 'right' })
    }
  },

  updateTabContent: (tabId, content) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: true } : t),
      rightTabs: s.rightTabs.map(t => t.id === tabId ? { ...t, content, isDirty: true } : t),
    }))
  },

  markTabDirty: (tabId, dirty) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t),
      rightTabs: s.rightTabs.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t),
    }))
  },

  setTabEditMode: (tabId, editMode) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, isEditMode: editMode } : t),
      rightTabs: s.rightTabs.map(t => t.id === tabId ? { ...t, isEditMode: editMode } : t),
    }))
  },

  setTabScrollPos: (tabId, pos) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, scrollPos: pos } : t),
      rightTabs: s.rightTabs.map(t => t.id === tabId ? { ...t, scrollPos: pos } : t),
    }))
  },

  setTabFileChanged: (filePath, changed) => {
    set(s => ({
      tabs: s.tabs.map(t => t.filePath === filePath ? { ...t, fileChangedOnDisk: changed } : t),
      rightTabs: s.rightTabs.map(t => t.filePath === filePath ? { ...t, fileChangedOnDisk: changed } : t),
    }))
  },

  markTabSaved: (tabId, content) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: false, fileChangedOnDisk: false } : t),
      rightTabs: s.rightTabs.map(t => t.id === tabId ? { ...t, content, isDirty: false, fileChangedOnDisk: false } : t),
    }))
  },

  toggleSplit: () => {
    const state = get()
    if (state.splitMode) {
      // Close split: merge right tabs into left
      const merged = [...state.tabs, ...state.rightTabs]
      set({
        splitMode: null,
        tabs: merged,
        activeTabId: state.activePaneId === 'right' ? state.rightActiveTabId : state.activeTabId,
        rightTabs: [],
        rightActiveTabId: null,
        activePaneId: 'left',
      })
    } else {
      // Split: move current active tab to right pane
      const activeTab = state.tabs.find(t => t.id === state.activeTabId)
      if (!activeTab || state.tabs.length < 2) {
        // Need at least 2 tabs to split, or just enable empty right
        set({ splitMode: 'vertical', activePaneId: 'left' })
        return
      }
      const leftTabs = state.tabs.filter(t => t.id !== activeTab.id)
      const leftActive = leftTabs.length > 0 ? leftTabs[leftTabs.length - 1].id : null
      set({
        splitMode: 'vertical',
        tabs: leftTabs,
        activeTabId: leftActive,
        rightTabs: [activeTab],
        rightActiveTabId: activeTab.id,
        activePaneId: 'right',
      })
    }
  },

  closeSplit: () => {
    const state = get()
    const merged = [...state.tabs, ...state.rightTabs]
    set({
      splitMode: null,
      tabs: merged,
      activeTabId: state.activePaneId === 'right' ? state.rightActiveTabId : state.activeTabId,
      rightTabs: [],
      rightActiveTabId: null,
      activePaneId: 'left',
    })
  },

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  moveTabToPane: (tabId, targetPane) => {
    const state = get()
    const fromLeft = state.tabs.find(t => t.id === tabId)
    const fromRight = state.rightTabs.find(t => t.id === tabId)

    if (fromLeft && targetPane === 'right') {
      const newLeft = state.tabs.filter(t => t.id !== tabId)
      let leftActive = state.activeTabId
      if (leftActive === tabId) {
        leftActive = newLeft.length > 0 ? newLeft[Math.max(0, state.tabs.indexOf(fromLeft) - 1)].id : null
      }
      set({
        tabs: newLeft,
        activeTabId: leftActive,
        rightTabs: [...state.rightTabs, fromLeft],
        rightActiveTabId: fromLeft.id,
        activePaneId: 'right',
        splitMode: 'vertical',
      })
    } else if (fromRight && targetPane === 'left') {
      const newRight = state.rightTabs.filter(t => t.id !== tabId)
      let rightActive = state.rightActiveTabId
      if (rightActive === tabId) {
        rightActive = newRight.length > 0 ? newRight[Math.max(0, state.rightTabs.indexOf(fromRight) - 1)].id : null
      }
      const updates: any = {
        tabs: [...state.tabs, fromRight],
        activeTabId: fromRight.id,
        rightTabs: newRight,
        rightActiveTabId: rightActive,
        activePaneId: 'left',
      }
      if (newRight.length === 0) {
        updates.splitMode = null
        updates.activePaneId = 'left'
      }
      set(updates)
    }
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  projects: [],

  addProject: (folderPath) => {
    const { projects } = get()
    // Normalize: convert forward slashes, collapse duplicate slashes
    const normalizedPath = folderPath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/$/, '')
      .replace(/^([a-zA-Z]):\//, (_, d) => d.toUpperCase() + ':/')
    if (projects.some(p => p.path === normalizedPath)) return
    const name = normalizedPath.split('/').filter(Boolean).pop() || normalizedPath
    const project: Project = {
      id: `proj-${++projectCounter}`,
      path: normalizedPath,
      name,
      collapsed: true,
    }
    const updated = [...projects, project]
    set({ projects: updated })
    saveProjects(updated)
    initProjectTemplates(folderPath)
  },

  removeProject: (projectId) => {
    const { projects, openDirs } = get()
    const updated = projects.filter(p => p.id !== projectId)
    set({ projects: updated })
    saveProjects(updated)
    if (openDirs[projectId]) {
      const nextOpenDirs = { ...openDirs }
      delete nextOpenDirs[projectId]
      window.electronAPI.storeSet('openDirs', nextOpenDirs)
      set({ openDirs: nextOpenDirs })
    }
  },

  renameProject: (projectId, newName) => {
    const { projects } = get()
    const trimmed = newName.trim()
    if (!trimmed) return
    const updated = projects.map(p => p.id === projectId ? { ...p, name: trimmed } : p)
    set({ projects: updated })
    saveProjects(updated)
  },

  reorderProject: (fromIndex, toIndex) => {
    const { projects } = get()
    if (fromIndex === toIndex) return
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= projects.length || toIndex >= projects.length) return
    const updated = [...projects]
    const [moved] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, moved)
    set({ projects: updated })
    saveProjects(updated)
  },

  toggleProjectCollapsed: (projectId) => {
    set(s => ({
      projects: s.projects.map(p =>
        p.id === projectId ? { ...p, collapsed: !p.collapsed } : p
      ),
    }))
  },

  // ── Search ────────────────────────────────────────────────────────────────
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  fullTextQuery: '',
  setFullTextQuery: (q) => set({ fullTextQuery: q }),
  searchProjectId: null,
  setSearchProjectId: (id) => set({ searchProjectId: id }),

  // ── Last opened directory ────────────────────────────────────────────────
  lastOpenedDir: {},
  setLastOpenedDir: (projectId, dirPath) => {
    set(s => ({ lastOpenedDir: { ...s.lastOpenedDir, [projectId]: dirPath } }))
  },

  // ── Expanded folder paths per project ────────────────────────────────────
  openDirs: {},
  toggleOpenDir: (projectId, dirPath, isOpen) => {
    set(s => {
      const current = s.openDirs[projectId] || []
      const has = current.includes(dirPath)
      let next: string[]
      if (isOpen && !has) next = [...current, dirPath]
      else if (!isOpen && has) next = current.filter(p => p !== dirPath)
      else return s
      const updated = { ...s.openDirs, [projectId]: next }
      window.electronAPI.storeSet('openDirs', updated)
      return { openDirs: updated }
    })
  },

  // ── Sidebar tab ───────────────────────────────────────────────────────────
  sidebarTab: 'tree',
  setSidebarTab: (tab) => set({ sidebarTab: tab }),
  gitSelectedProject: null,
  setGitSelectedProject: (path) => set({ gitSelectedProject: path }),
  kanbanProjectPath: null,
  setKanbanProjectPath: (path) => set({ kanbanProjectPath: path }),
  imageNavProjectPath: null,
  setImageNavProjectPath: (path) => set({ imageNavProjectPath: path }),

  // ── Favorites ─────────────────────────────────────────────────────────────
  favorites: [],
  addFavorite: (filePath) => {
    set(s => {
      if (s.favorites.includes(filePath)) return s
      const updated = [...s.favorites, filePath]
      window.electronAPI.storeSet('favorites', updated)
      return { favorites: updated }
    })
  },
  removeFavorite: (filePath) => {
    set(s => {
      const updated = s.favorites.filter(f => f !== filePath)
      window.electronAPI.storeSet('favorites', updated)
      return { favorites: updated }
    })
  },

  // ── Recent files ──────────────────────────────────────────────────────────
  recentFiles: [],
  addRecentFile: (path, name) => {
    set(s => {
      const filtered = s.recentFiles.filter(f => f.path !== path)
      const updated = [{ path, name }, ...filtered].slice(0, 20)
      window.electronAPI.storeSet('recentFiles', updated)
      return { recentFiles: updated }
    })
  },

  // ── File tags ─────────────────────────────────────────────────────────────
  fileTags: {},
  addFileTag: (filePath, tagId) => {
    set(s => {
      const current = s.fileTags[filePath] || []
      if (current.includes(tagId)) return s
      const updated = { ...s.fileTags, [filePath]: [...current, tagId] }
      window.electronAPI.storeSet('fileTags', updated)
      return { fileTags: updated }
    })
  },
  removeFileTag: (filePath, tagId) => {
    set(s => {
      const current = s.fileTags[filePath] || []
      const filtered = current.filter(t => t !== tagId)
      const updated = { ...s.fileTags }
      if (filtered.length === 0) delete updated[filePath]
      else updated[filePath] = filtered
      window.electronAPI.storeSet('fileTags', updated)
      return { fileTags: updated }
    })
  },

  // ── Tag colors ──────────────────────────────────────────────────────────
  tagColors: {},
  setTagColor: (tag, color) => {
    set(s => {
      const updated = { ...s.tagColors, [tag]: color }
      window.electronAPI.storeSet('tagColors', updated)
      return { tagColors: updated }
    })
  },
  removeTagColor: (tag) => {
    set(s => {
      const updated = { ...s.tagColors }
      delete updated[tag]
      window.electronAPI.storeSet('tagColors', updated)
      return { tagColors: updated }
    })
  },

  // ── Project colors ────────────────────────────────────────────────────────
  projectColors: {},
  setProjectColor: (projectId, colorIndex) => {
    set(s => {
      const updated = { ...s.projectColors, [projectId]: colorIndex }
      window.electronAPI.storeSet('projectColors', updated)
      return { projectColors: updated }
    })
  },

  // ── Sidebar visibility ───────────────────────────────────────────────────
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => {
    window.electronAPI.storeSet('sidebarCollapsed', collapsed)
    set({ sidebarCollapsed: collapsed })
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed
    window.electronAPI.storeSet('sidebarCollapsed', next)
    set({ sidebarCollapsed: next })
  },
  // ── Settings ──────────────────────────────────────────────────────────────
  darkMode: 'system',
  setDarkMode: (mode) => {
    window.electronAPI.setTheme(mode)
    set({ darkMode: mode })
    if (mode === 'dark') document.documentElement.classList.add('dark')
    else document.documentElement.classList.remove('dark')
  },

  fontSize: 16,
  setFontSize: (size) => {
    const clamped = Math.min(24, Math.max(12, size))
    window.electronAPI.storeSet('fontSize', clamped)
    document.documentElement.style.setProperty('--md-font-size', `${clamped}px`)
    set({ fontSize: clamped })
  },

  fontFamily: 'default',
  setFontFamily: (font) => {
    window.electronAPI.storeSet('fontFamily', font)
    const families: Record<string, string> = {
      'default': "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Malgun Gothic', sans-serif",
      'pretendard': "'Pretendard', 'Malgun Gothic', sans-serif",
      'noto-sans': "'Noto Sans KR', 'Malgun Gothic', sans-serif",
      'nanumgothic': "'NanumGothic', 'Malgun Gothic', sans-serif",
      'nanummyeongjo': "'NanumMyeongjo', 'Batang', serif",
      'malgun': "'Malgun Gothic', sans-serif",
      'gulim': "'Gulim', sans-serif",
    }
    document.documentElement.style.setProperty('--md-font-family', families[font] || families['default'])
    set({ fontFamily: font })
  },

  showTOC: false,
  setShowTOC: (show) => set({ showTOC: show }),

  // Spellcheck is off by default because Chromium's Korean dictionary
  // lookups add layout/paint work as CodeMirror's viewport scrolls in
  // new lines, noticeably worsening fast-scroll jank on large files.
  spellcheckEnabled: false,
  setSpellcheckEnabled: (enabled) => {
    window.electronAPI.storeSet('spellcheckEnabled', enabled)
    set({ spellcheckEnabled: enabled })
  },

  rightPanelTab: 'toc',
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  // ── Current user ──────────────────────────────────────────────────────────
  currentUser: '',
  setCurrentUser: (name) => {
    window.electronAPI.storeSet('currentUser', name)
    set({ currentUser: name })
  },
}))
