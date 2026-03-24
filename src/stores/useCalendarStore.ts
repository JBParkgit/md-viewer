import { create } from 'zustand'
import type { CalendarInfo, CalendarEvent } from '../types/calendar'

interface CalendarStore {
  // Auth
  isSignedIn: boolean
  isLoading: boolean

  // Calendars
  calendars: CalendarInfo[]
  selectedCalendarIds: string[]
  calendarColors: Record<string, string> // calendarId -> hex color

  // Events
  events: CalendarEvent[]
  currentMonth: Date
  viewMode: 'month' | 'week'
  selectedDate: string | null // YYYY-MM-DD

  // Polling
  _pollTimer: ReturnType<typeof setInterval> | null

  // Actions
  checkAuth: () => Promise<void>
  signIn: () => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  loadCalendars: () => Promise<void>
  toggleCalendar: (id: string) => Promise<void>
  loadEvents: () => Promise<void>
  createEvent: (calendarId: string, event: Partial<CalendarEvent>) => Promise<{ success: boolean; error?: string }>
  updateEvent: (calendarId: string, eventId: string, updates: Partial<CalendarEvent>) => Promise<{ success: boolean; error?: string }>
  deleteEvent: (calendarId: string, eventId: string) => Promise<{ success: boolean; error?: string }>
  setCalendarColor: (calendarId: string, color: string) => void
  getCalendarColor: (calendarId: string) => string
  setCurrentMonth: (date: Date) => void
  setViewMode: (mode: 'month' | 'week') => void
  setSelectedDate: (date: string | null) => void
  startPolling: () => void
  stopPolling: () => void
}

function getMonthRange(date: Date): { timeMin: string; timeMax: string } {
  const year = date.getFullYear()
  const month = date.getMonth()
  // Include surrounding weeks for calendar grid display
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  // Start from Sunday of the first week
  const start = new Date(first)
  start.setDate(start.getDate() - start.getDay())
  // End at Saturday of the last week
  const end = new Date(last)
  end.setDate(end.getDate() + (6 - end.getDay()) + 1)
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

function getWeekRange(date: Date): { timeMin: string; timeMax: string } {
  const d = new Date(date)
  const day = d.getDay()
  const start = new Date(d)
  start.setDate(start.getDate() - day)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
  }
}

export const useCalendarStore = create<CalendarStore>((set, get) => ({
  isSignedIn: false,
  isLoading: false,
  calendars: [],
  selectedCalendarIds: [],
  calendarColors: {},
  events: [],
  currentMonth: new Date(),
  viewMode: 'month',
  selectedDate: null,
  _pollTimer: null,

  checkAuth: async () => {
    const signedIn = await window.electronAPI.calendarIsSignedIn()
    const savedColors = await window.electronAPI.storeGet('calendarColors') as Record<string, string> | null
    set({ isSignedIn: signedIn, calendarColors: savedColors || {} })
    if (signedIn) {
      const ids = await window.electronAPI.calendarGetSelectedCalendars()
      set({ selectedCalendarIds: ids || [] })
      if (ids && ids.length > 0) {
        await get().loadEvents()
      }
    }
  },

  signIn: async () => {
    set({ isLoading: true })
    const res = await window.electronAPI.calendarSignIn()
    if (res.success) {
      set({ isSignedIn: true })
      await get().loadCalendars()
      const ids = await window.electronAPI.calendarGetSelectedCalendars()
      if (ids && ids.length > 0) {
        set({ selectedCalendarIds: ids })
        await get().loadEvents()
      }
    }
    set({ isLoading: false })
    return res
  },

  signOut: async () => {
    await window.electronAPI.calendarSignOut()
    get().stopPolling()
    set({ isSignedIn: false, calendars: [], selectedCalendarIds: [], events: [] })
  },

  loadCalendars: async () => {
    const res = await window.electronAPI.calendarListCalendars()
    if (res.success && res.data) {
      set({ calendars: res.data })
    }
  },

  toggleCalendar: async (id: string) => {
    const { selectedCalendarIds } = get()
    const newIds = selectedCalendarIds.includes(id)
      ? selectedCalendarIds.filter(x => x !== id)
      : [...selectedCalendarIds, id]
    await window.electronAPI.calendarSelectCalendars(newIds)
    set({ selectedCalendarIds: newIds })
    if (newIds.length > 0) {
      await get().loadEvents()
    } else {
      set({ events: [] })
    }
  },

  loadEvents: async () => {
    const { selectedCalendarIds, currentMonth, viewMode } = get()
    if (selectedCalendarIds.length === 0) return
    set({ isLoading: true })
    const range = viewMode === 'month'
      ? getMonthRange(currentMonth)
      : getWeekRange(currentMonth)
    const res = await window.electronAPI.calendarListEvents(range.timeMin, range.timeMax)
    if (res.success && res.data) {
      set({
        events: res.data.map(e => ({
          id: e.id || '',
          calendarId: e.calendarId || '',
          summary: e.summary || '',
          description: e.description || '',
          start: e.start,
          end: e.end,
          linkedFiles: e.linkedFiles || [],
          linkedProjectPath: e.linkedProjectPath || null,
          colorId: e.colorId,
        })),
      })
    }
    set({ isLoading: false })
  },

  createEvent: async (calendarId, event) => {
    const res = await window.electronAPI.calendarCreateEvent(calendarId, event as any)
    if (res.success) {
      await get().loadEvents()
    }
    return { success: res.success, error: res.error }
  },

  updateEvent: async (calendarId, eventId, updates) => {
    const res = await window.electronAPI.calendarUpdateEvent(calendarId, eventId, updates as any)
    if (res.success) {
      await get().loadEvents()
    }
    return { success: res.success, error: res.error }
  },

  deleteEvent: async (calendarId, eventId) => {
    const res = await window.electronAPI.calendarDeleteEvent(calendarId, eventId)
    if (res.success) {
      await get().loadEvents()
    }
    return { success: res.success, error: res.error }
  },

  setCalendarColor: (calendarId, color) => {
    const colors = { ...get().calendarColors, [calendarId]: color }
    set({ calendarColors: colors })
    window.electronAPI.storeSet('calendarColors', colors)
  },

  getCalendarColor: (calendarId) => {
    const custom = get().calendarColors[calendarId]
    if (custom) return custom
    const cal = get().calendars.find(c => c.id === calendarId)
    return cal?.backgroundColor || '#4285f4'
  },

  setCurrentMonth: (date) => {
    set({ currentMonth: date })
    get().loadEvents()
  },

  setViewMode: (mode) => {
    set({ viewMode: mode })
    get().loadEvents()
  },

  setSelectedDate: (date) => {
    set({ selectedDate: date })
  },

  startPolling: () => {
    const existing = get()._pollTimer
    if (existing) return
    const timer = setInterval(() => {
      if (get().isSignedIn && get().selectedCalendarIds.length > 0) {
        get().loadEvents()
      }
    }, 60000) // 60초마다 동기화
    set({ _pollTimer: timer })
  },

  stopPolling: () => {
    const timer = get()._pollTimer
    if (timer) {
      clearInterval(timer)
      set({ _pollTimer: null })
    }
  },
}))
