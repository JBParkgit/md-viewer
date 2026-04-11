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

interface AppStore {
  // Tabs
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

  openTab: (filePath, fileName, content, fileType = 'md', isPreview = false) => {
    const { tabs } = get()

    // 이미 열려 있는 탭이면 그냥 활성화
    const existing = tabs.find(t => t.filePath === filePath)
    if (existing) {
      // preview 탭을 고정 탭으로 열 때 핀 처리
      if (!isPreview && existing.isPreview) {
        set(s => ({
          tabs: s.tabs.map(t => t.id === existing.id ? { ...t, isPreview: false } : t),
          activeTabId: existing.id,
        }))
      } else {
        set({ activeTabId: existing.id })
      }
      return
    }

    const id = `tab-${++tabCounter}`
    const newTab: Tab = {
      id, filePath, fileName, fileType, content,
      isDirty: false, isEditMode: false, isPreview,
      scrollPos: 0, fileChangedOnDisk: false,
    }

    if (isPreview) {
      // 기존 preview 탭을 새 파일로 교체
      const previewIdx = tabs.findIndex(t => t.isPreview)
      if (previewIdx !== -1) {
        const newTabs = [...tabs]
        newTabs[previewIdx] = { ...newTab, id: tabs[previewIdx].id }
        set({ tabs: newTabs, activeTabId: tabs[previewIdx].id })
        return
      }
    }

    set(s => ({ tabs: [...s.tabs, newTab], activeTabId: id }))
  },

  pinTab: (tabId) => {
    set(s => ({
      tabs: s.tabs.map(t => t.id === tabId ? { ...t, isPreview: false } : t),
    }))
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId } = get()
    const idx = tabs.findIndex(t => t.id === tabId)
    if (idx === -1) return
    const newTabs = tabs.filter(t => t.id !== tabId)
    let newActive = activeTabId
    if (activeTabId === tabId) {
      if (newTabs.length === 0) newActive = null
      else if (idx > 0) newActive = newTabs[idx - 1].id
      else newActive = newTabs[0].id
    }
    set({ tabs: newTabs, activeTabId: newActive })
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTabContent: (tabId, content) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: true } : t) }))
  },

  markTabDirty: (tabId, dirty) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, isDirty: dirty } : t) }))
  },

  setTabEditMode: (tabId, editMode) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, isEditMode: editMode } : t) }))
  },

  setTabScrollPos: (tabId, pos) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, scrollPos: pos } : t) }))
  },

  setTabFileChanged: (filePath, changed) => {
    set(s => ({ tabs: s.tabs.map(t => t.filePath === filePath ? { ...t, fileChangedOnDisk: changed } : t) }))
  },

  markTabSaved: (tabId, content) => {
    set(s => ({ tabs: s.tabs.map(t => t.id === tabId ? { ...t, content, isDirty: false, fileChangedOnDisk: false } : t) }))
  },

  // ── Projects ───────────────────────────────────────────────────────────────
  projects: [],

  addProject: (folderPath) => {
    const { projects } = get()
    if (projects.some(p => p.path === folderPath)) return
    const name = folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || folderPath
    const project: Project = {
      id: `proj-${++projectCounter}`,
      path: folderPath,
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

  showTOC: true,
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
