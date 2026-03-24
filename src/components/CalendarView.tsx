import { useState, useEffect, useCallback, useMemo } from 'react'
import { useCalendarStore } from '../stores/useCalendarStore'
import { useAppStore } from '../stores/useAppStore'
import type { CalendarEvent } from '../types/calendar'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

// ── Get calendar color from store ────────────────────────────────────────────
function getCalColor(calendarId: string): string {
  return useCalendarStore.getState().getCalendarColor(calendarId)
}

// ── Event Modal ─────────────────────────────────────────────────────────────
interface EventModalProps {
  event: Partial<CalendarEvent> | null
  isNew: boolean
  onSave: (event: Partial<CalendarEvent>) => void
  onDelete: (eventId: string) => void
  onClose: () => void
  onOpenFile: (filePath: string, fileName: string) => void
}

function EventModal({ event, isNew, onSave, onDelete, onClose, onOpenFile }: EventModalProps) {
  const calendars = useCalendarStore(s => s.calendars)
  const selectedCalendarIds = useCalendarStore(s => s.selectedCalendarIds)
  const [calendarId, setCalendarId] = useState(event?.calendarId || selectedCalendarIds[0] || '')
  const [summary, setSummary] = useState(event?.summary || '')
  const [description, setDescription] = useState(event?.description || '')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [isAllDay, setIsAllDay] = useState(false)
  const [linkedFiles, setLinkedFiles] = useState<string[]>(event?.linkedFiles || [])

  // File picker
  const projects = useAppStore(s => s.projects)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [pickerProjectPath, setPickerProjectPath] = useState(projects[0]?.path || '')
  const [pickerFiles, setPickerFiles] = useState<{ name: string; path: string; rel: string }[]>([])
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerLoading, setPickerLoading] = useState(false)

  useEffect(() => {
    if (event) {
      const start = event.start
      if (start?.date) {
        setIsAllDay(true)
        setStartDate(start.date)
        setEndDate(event.end?.date || start.date)
      } else if (start?.dateTime) {
        const d = new Date(start.dateTime)
        setStartDate(d.toISOString().split('T')[0])
        setStartTime(d.toTimeString().slice(0, 5))
        if (event.end?.dateTime) {
          const ed = new Date(event.end.dateTime)
          setEndDate(ed.toISOString().split('T')[0])
          setEndTime(ed.toTimeString().slice(0, 5))
        }
      } else {
        // Default to today
        const now = new Date()
        setStartDate(now.toISOString().split('T')[0])
        setStartTime(now.toTimeString().slice(0, 5))
        const end = new Date(now.getTime() + 60 * 60 * 1000)
        setEndDate(end.toISOString().split('T')[0])
        setEndTime(end.toTimeString().slice(0, 5))
      }
    }
  }, [event])

  // Load files for picker
  useEffect(() => {
    if (!showFilePicker || !pickerProjectPath) return
    let cancelled = false
    const load = async () => {
      setPickerLoading(true)
      const tree = await window.electronAPI.readDir(pickerProjectPath)
      const flat: { name: string; path: string; rel: string }[] = []
      const flatten = (nodes: typeof tree) => {
        for (const node of nodes) {
          if (node.name.startsWith('.')) continue
          if (node.type === 'file') {
            const rel = node.path.replace(/\\/g, '/').replace(pickerProjectPath.replace(/\\/g, '/') + '/', '')
            flat.push({ name: node.name, path: node.path, rel })
          }
          if (node.children) flatten(node.children)
        }
      }
      flatten(tree)
      if (!cancelled) { setPickerFiles(flat); setPickerLoading(false) }
    }
    load()
    return () => { cancelled = true }
  }, [showFilePicker, pickerProjectPath])

  const filteredFiles = pickerSearch
    ? pickerFiles.filter(f => f.rel.toLowerCase().includes(pickerSearch.toLowerCase()))
    : pickerFiles

  const handleSave = () => {
    const data: Partial<CalendarEvent> = {
      id: event?.id,
      calendarId,
      summary,
      description,
      linkedFiles,
    }
    if (isAllDay) {
      data.start = { date: startDate }
      // Google Calendar all-day events: end date is exclusive
      const end = new Date(endDate || startDate)
      end.setDate(end.getDate() + 1)
      data.end = { date: end.toISOString().split('T')[0] }
    } else {
      data.start = { dateTime: new Date(`${startDate}T${startTime || '00:00'}`).toISOString() }
      data.end = { dateTime: new Date(`${endDate || startDate}T${endTime || startTime || '01:00'}`).toISOString() }
    }
    onSave(data)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-[480px] max-h-[80vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            {isNew ? '새 이벤트' : '이벤트 편집'}
          </h3>
          <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {/* Title */}
          <input
            type="text"
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="이벤트 제목"
            className="w-full text-base px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
            autoFocus
          />

          {/* Calendar selector */}
          {selectedCalendarIds.length > 1 && (
            <div>
              <label className="text-[10px] text-gray-400 block mb-0.5">캘린더</label>
              <select
                value={calendarId}
                onChange={e => setCalendarId(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400"
              >
                {calendars.filter(c => selectedCalendarIds.includes(c.id)).map(cal => (
                  <option key={cal.id} value={cal.id}>{cal.summary}</option>
                ))}
              </select>
            </div>
          )}

          {/* All day toggle */}
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={isAllDay} onChange={e => setIsAllDay(e.target.checked)} className="rounded" />
            종일
          </label>

          {/* Date/time */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 block mb-0.5">시작</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400" />
              {!isAllDay && (
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 mt-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400" />
              )}
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 block mb-0.5">종료</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="w-full text-xs px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400" />
              {!isAllDay && (
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full text-xs px-2 py-1.5 mt-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400" />
              )}
            </div>
          </div>

          {/* Description */}
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="설명 (선택)"
            rows={3}
            className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none focus:border-blue-400 resize-none"
          />

          {/* Linked files */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400">연결된 파일</span>
              <button
                onClick={() => setShowFilePicker(!showFilePicker)}
                className="text-[10px] text-blue-500 hover:text-blue-600"
              >
                {showFilePicker ? '닫기' : '+ 파일 연결'}
              </button>
            </div>
            {linkedFiles.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {linkedFiles.map((f, i) => {
                  const name = f.split(/[/\\]/).pop() || f
                  return (
                    <div key={i} className="flex items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300">
                      <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="truncate flex-1">{name}</span>
                      <button onClick={() => setLinkedFiles(linkedFiles.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
            {showFilePicker && (
              <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                {projects.length > 1 && (
                  <select
                    value={pickerProjectPath}
                    onChange={e => setPickerProjectPath(e.target.value)}
                    className="w-full text-[10px] px-2 py-1 border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
                  >
                    {projects.map(p => <option key={p.id} value={p.path}>{p.name}</option>)}
                  </select>
                )}
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={e => setPickerSearch(e.target.value)}
                  placeholder="파일 검색..."
                  className="w-full text-[10px] px-2 py-1 border-b border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
                />
                <div className="max-h-32 overflow-y-auto">
                  {pickerLoading ? (
                    <div className="flex justify-center py-3">
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : filteredFiles.length === 0 ? (
                    <div className="text-[10px] text-gray-400 text-center py-3">파일 없음</div>
                  ) : (
                    filteredFiles.slice(0, 50).map(f => {
                      const isLinked = linkedFiles.includes(f.path)
                      return (
                        <button
                          key={f.path}
                          onClick={() => {
                            if (isLinked) setLinkedFiles(linkedFiles.filter(x => x !== f.path))
                            else setLinkedFiles([...linkedFiles, f.path])
                          }}
                          className={`w-full text-left px-2 py-1 text-[10px] hover:bg-gray-50 dark:hover:bg-gray-600 flex items-center gap-1 ${
                            isLinked ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' : 'text-gray-600 dark:text-gray-300'
                          }`}
                        >
                          {isLinked ? (
                            <svg className="w-3 h-3 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          ) : (
                            <div className="w-3 h-3 flex-shrink-0" />
                          )}
                          <span className="truncate">{f.rel}</span>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            {!isNew && event?.id ? (
              <button
                onClick={() => onDelete(event.id!)}
                className="text-xs text-red-500 hover:text-red-600 transition-colors"
              >
                삭제
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-1.5 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={!summary.trim() || !startDate}
                className="px-4 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-lg transition-colors"
              >
                {isNew ? '만들기' : '저장'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helper: get event date range ────────────────────────────────────────────
function getEventDateRange(e: CalendarEvent): { start: string; end: string } {
  const startStr = e.start.date || e.start.dateTime?.split('T')[0] || ''
  const endStr = e.end.date || e.end.dateTime?.split('T')[0] || startStr
  // For all-day events, Google end date is exclusive
  if (e.start.date && e.end.date && endStr > startStr) {
    const d = new Date(endStr + 'T00:00:00')
    d.setDate(d.getDate() - 1)
    return { start: startStr, end: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
  }
  return { start: startStr, end: endStr }
}

function isMultiDay(e: CalendarEvent): boolean {
  const r = getEventDateRange(e)
  return r.start !== r.end
}

// ── Spanning bar layout for a week row ──────────────────────────────────────
interface SpanBar {
  event: CalendarEvent
  col: number   // 0-based start column in week
  span: number  // number of columns to span
  row: number   // vertical slot index (0, 1, 2, ...)
}

function layoutWeekBars(weekDates: string[], events: CalendarEvent[], maxRows: number): { bars: SpanBar[]; overflow: Record<number, number> } {
  // Find multi-day events that overlap this week
  const multiDay: { event: CalendarEvent; start: string; end: string }[] = []
  const weekStart = weekDates[0]
  const weekEnd = weekDates[6]

  events.forEach(e => {
    if (!isMultiDay(e)) return
    const r = getEventDateRange(e)
    if (r.end < weekStart || r.start > weekEnd) return
    multiDay.push({ event: e, ...r })
  })

  // Sort: longer events first, then by start date
  multiDay.sort((a, b) => {
    const aLen = weekDates.filter(d => d >= a.start && d <= a.end).length
    const bLen = weekDates.filter(d => d >= b.start && d <= b.end).length
    if (bLen !== aLen) return bLen - aLen
    return a.start.localeCompare(b.start)
  })

  // Assign rows (slots) to avoid overlap
  const slots: (string | null)[][] = [] // slots[row][col] = eventId or null
  const bars: SpanBar[] = []

  for (const { event, start, end } of multiDay) {
    const col = Math.max(0, weekDates.indexOf(start) === -1 ? 0 : weekDates.indexOf(start))
    const startCol = start < weekStart ? 0 : weekDates.indexOf(start)
    const endCol = end > weekEnd ? 6 : weekDates.indexOf(end)
    if (startCol === -1 || endCol === -1) continue
    const span = endCol - startCol + 1

    // Find first available row
    let row = -1
    for (let r = 0; r < slots.length; r++) {
      let free = true
      for (let c = startCol; c <= endCol; c++) {
        if (slots[r][c] !== null) { free = false; break }
      }
      if (free) { row = r; break }
    }
    if (row === -1) {
      row = slots.length
      slots.push(Array(7).fill(null))
    }

    if (row < maxRows) {
      for (let c = startCol; c <= endCol; c++) slots[row][c] = event.id
      bars.push({ event, col: startCol, span, row })
    }
  }

  // Count overflow per day column
  const overflow: Record<number, number> = {}
  // Events that didn't fit
  for (const { event, start, end } of multiDay) {
    const startCol = start < weekStart ? 0 : weekDates.indexOf(start)
    const endCol = end > weekEnd ? 6 : weekDates.indexOf(end)
    const placed = bars.some(b => b.event.id === event.id)
    if (!placed) {
      for (let c = startCol; c <= endCol; c++) {
        overflow[c] = (overflow[c] || 0) + 1
      }
    }
  }

  return { bars, overflow }
}

// ── Month View ──────────────────────────────────────────────────────────────
function MonthView({ events, onEventClick, onDateClick, currentMonth }: {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onDateClick: (dateStr: string) => void
  currentMonth: Date
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Build cells
  const prevMonthDays = new Date(year, month, 0).getDate()
  const cells: { day: number; month: number; dateStr: string }[] = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    const m = month - 1 < 0 ? 11 : month - 1
    const y = month - 1 < 0 ? year - 1 : year
    cells.push({ day: d, month: -1, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` })
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, month: 0, dateStr: `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}` })
  }
  const remaining = 42 - cells.length
  for (let i = 1; i <= remaining; i++) {
    const m = month + 1 > 11 ? 0 : month + 1
    const y = month + 1 > 11 ? year + 1 : year
    cells.push({ day: i, month: 1, dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}` })
  }

  const weeks: typeof cells[] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }

  // Single-day events grouped by date
  const singleDayByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach(e => {
      if (isMultiDay(e)) return
      const d = e.start.date || e.start.dateTime?.split('T')[0]
      if (d) {
        if (!map[d]) map[d] = []
        map[d].push(e)
      }
    })
    return map
  }, [events])

  const MAX_SPAN_ROWS = 3
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full">
      {/* Day header */}
      <div className="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        {dayNames.map((d, i) => (
          <div key={d} className={`text-center text-xs py-2 font-medium ${
            i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-500 dark:text-gray-400'
          }`}>{d}</div>
        ))}
      </div>

      {/* Weeks */}
      <div className="flex-1 grid min-h-0" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => {
          const weekDates = week.map(c => c.dateStr)
          const { bars, overflow } = layoutWeekBars(weekDates, events, MAX_SPAN_ROWS)

          return (
            <div key={wi} className="relative border-b border-gray-100 dark:border-gray-800 min-h-0 overflow-hidden">
              {/* Day number grid */}
              <div className="grid grid-cols-7 h-full">
                {week.map((cell, ci) => {
                  const isToday = cell.dateStr === todayStr
                  const isOtherMonth = cell.month !== 0
                  const singleEvents = singleDayByDate[cell.dateStr] || []
                  // Offset single-day events below spanning bars
                  const usedSlots = bars.filter(b => ci >= b.col && ci < b.col + b.span).length
                  const overflowCount = overflow[ci] || 0

                  return (
                    <div
                      key={ci}
                      className={`border-r border-gray-100 dark:border-gray-800 last:border-r-0 px-0.5 pt-0.5 overflow-hidden cursor-pointer hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors flex flex-col ${
                        isOtherMonth ? 'bg-gray-50/50 dark:bg-gray-900/30' : ''
                      }`}
                      onClick={() => onDateClick(cell.dateStr)}
                    >
                      <div className={`text-[11px] mb-0.5 flex-shrink-0 ${
                        isToday
                          ? 'w-5 h-5 flex items-center justify-center rounded-full bg-blue-500 text-white font-semibold mx-auto'
                          : isOtherMonth
                          ? 'text-gray-300 dark:text-gray-600'
                          : ci === 0
                          ? 'text-red-400'
                          : ci === 6
                          ? 'text-blue-400'
                          : 'text-gray-600 dark:text-gray-300'
                      }`}>
                        {cell.day}
                      </div>
                      {/* Spacer for spanning bars */}
                      {usedSlots > 0 && <div style={{ height: usedSlots * 18 }} className="flex-shrink-0" />}
                      {/* Single-day events */}
                      <div className="space-y-px overflow-hidden flex-1 min-h-0">
                        {singleEvents.slice(0, Math.max(1, 3 - usedSlots)).map(ev => {
                          const isAllDay = !!ev.start.date
                          const time = ev.start.dateTime
                            ? new Date(ev.start.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                            : ''
                          const color = getCalColor(ev.calendarId)
                          return isAllDay ? (
                            <div
                              key={ev.id}
                              onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                              className="text-[10px] px-1 py-px rounded truncate cursor-pointer hover:opacity-80 text-white font-medium"
                              style={{ backgroundColor: color }}
                              title={ev.summary}
                            >
                              {ev.summary}
                            </div>
                          ) : (
                            <div
                              key={ev.id}
                              onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                              className="text-[10px] px-0.5 truncate cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded flex items-center gap-1"
                              title={ev.summary}
                            >
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                              <span className="text-gray-400 flex-shrink-0">{time}</span>
                              <span className="text-gray-700 dark:text-gray-200 truncate">{ev.summary}</span>
                            </div>
                          )
                        })}
                        {(singleEvents.length > Math.max(1, 3 - usedSlots) || overflowCount > 0) && (
                          <div className="text-[9px] text-gray-400 px-1">
                            +{singleEvents.length - Math.max(1, 3 - usedSlots) + overflowCount}개 더
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Spanning event bars (absolutely positioned over the grid) */}
              {bars.map(bar => {
                const range = getEventDateRange(bar.event)
                const isStart = range.start >= weekDates[0] && weekDates.indexOf(range.start) === bar.col
                const isEnd = range.end <= weekDates[6] && weekDates.indexOf(range.end) === bar.col + bar.span - 1
                return (
                  <div
                    key={`${bar.event.id}-${wi}`}
                    onClick={(e) => { e.stopPropagation(); onEventClick(bar.event) }}
                    className={`absolute text-[10px] px-1.5 py-px truncate cursor-pointer hover:opacity-80 text-white font-medium ${
                      isStart ? 'rounded-l' : ''
                    } ${isEnd ? 'rounded-r' : ''}`}
                    style={{
                      top: 20 + bar.row * 18,
                      left: `calc(${(bar.col / 7) * 100}% + 2px)`,
                      width: `calc(${(bar.span / 7) * 100}% - 4px)`,
                      height: 16,
                      zIndex: 10,
                      backgroundColor: getCalColor(bar.event.calendarId),
                    }}
                    title={bar.event.summary}
                  >
                    {bar.event.summary}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ───────────────────────────────────────────────────────────────
function WeekView({ events, onEventClick, onDateClick, currentMonth }: {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
  onDateClick: (dateStr: string) => void
  currentMonth: Date
}) {
  const startOfWeek = new Date(currentMonth)
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const days: { date: Date; dateStr: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(d.getDate() + i)
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.push({ date: d, dateStr })
  }

  // Group events by date (multi-day events appear on every day they span)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    events.forEach(e => {
      const startStr = e.start.date || e.start.dateTime?.split('T')[0]
      const endStr = e.end.date || e.end.dateTime?.split('T')[0]
      if (!startStr) return
      const start = new Date(startStr + 'T00:00:00')
      const end = endStr ? new Date(endStr + 'T00:00:00') : start
      const lastDay = e.start.date && e.end.date ? new Date(end.getTime() - 86400000) : end
      const cur = new Date(start)
      while (cur <= lastDay) {
        const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
        if (!map[key]) map[key] = []
        map[key].push(e)
        cur.setDate(cur.getDate() + 1)
      }
    })
    return map
  }, [events])

  const hours = Array.from({ length: 24 }, (_, i) => i)
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day header */}
      <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-gray-200 dark:border-gray-700">
        <div className="text-[10px] text-gray-400 p-1" />
        {days.map((d, i) => {
          const isToday = d.dateStr === todayStr
          return (
            <div key={i} className={`text-center py-2 border-l border-gray-100 dark:border-gray-800 ${
              isToday ? 'bg-blue-50 dark:bg-blue-900/20' : ''
            }`}>
              <div className={`text-[10px] ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'}`}>
                {dayNames[i]}
              </div>
              <div className={`text-sm font-medium ${
                isToday ? 'text-blue-500' : 'text-gray-700 dark:text-gray-200'
              }`}>
                {d.date.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-[48px_repeat(7,1fr)]">
          {hours.map(h => (
            <div key={h} className="contents">
              <div className="text-[10px] text-gray-400 text-right pr-2 pt-1 h-12 border-b border-gray-100 dark:border-gray-800">
                {String(h).padStart(2, '0')}:00
              </div>
              {days.map((d, di) => {
                const dayEventsAtHour = (eventsByDate[d.dateStr] || []).filter(e => {
                  if (e.start.date) return h === 0 // all-day at top
                  if (e.start.dateTime) {
                    const eh = new Date(e.start.dateTime).getHours()
                    return eh === h
                  }
                  return false
                })
                return (
                  <div
                    key={di}
                    className="h-12 border-b border-l border-gray-100 dark:border-gray-800 px-0.5 py-0.5 overflow-hidden cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    onClick={() => onDateClick(d.dateStr)}
                  >
                    {dayEventsAtHour.map(ev => {
                      const isAllDay = !!ev.start.date
                      const time = ev.start.dateTime
                        ? new Date(ev.start.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                        : '종일'
                      const color = getCalColor(ev.calendarId)
                      return isAllDay ? (
                        <div
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                          className="text-[9px] px-1 py-0.5 rounded truncate cursor-pointer hover:opacity-80 mb-px text-white font-medium"
                          style={{ backgroundColor: color }}
                        >
                          {ev.summary}
                        </div>
                      ) : (
                        <div
                          key={ev.id}
                          onClick={(e) => { e.stopPropagation(); onEventClick(ev) }}
                          className="text-[9px] px-0.5 py-0.5 truncate cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 rounded mb-px flex items-center gap-0.5"
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-gray-400">{time}</span>
                          <span className="text-gray-700 dark:text-gray-200 truncate">{ev.summary}</span>
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main CalendarView ───────────────────────────────────────────────────────
export default function CalendarView({ onOpenFile }: Props) {
  const {
    isSignedIn, isLoading, calendars, selectedCalendarIds, events,
    currentMonth, viewMode,
    checkAuth, signIn, loadCalendars, toggleCalendar,
    setCurrentMonth, setViewMode,
    loadEvents, createEvent, updateEvent, deleteEvent,
    startPolling, stopPolling,
  } = useCalendarStore()

  const [modalEvent, setModalEvent] = useState<Partial<CalendarEvent> | null>(null)
  const [isNewEvent, setIsNewEvent] = useState(false)
  const [actionMsg, setActionMsg] = useState<string | null>(null)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (isSignedIn && calendars.length === 0) loadCalendars()
  }, [isSignedIn, calendars.length, loadCalendars])

  useEffect(() => {
    if (isSignedIn && selectedCalendarIds.length > 0) {
      startPolling()
      return () => stopPolling()
    }
  }, [isSignedIn, selectedCalendarIds.length, startPolling, stopPolling])

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']

  const handlePrev = useCallback(() => {
    const d = new Date(currentMonth)
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1)
    else d.setDate(d.getDate() - 7)
    setCurrentMonth(d)
  }, [currentMonth, viewMode, setCurrentMonth])

  const handleNext = useCallback(() => {
    const d = new Date(currentMonth)
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1)
    else d.setDate(d.getDate() + 7)
    setCurrentMonth(d)
  }, [currentMonth, viewMode, setCurrentMonth])

  const handleToday = useCallback(() => {
    setCurrentMonth(new Date())
  }, [setCurrentMonth])

  const handleEventClick = (event: CalendarEvent) => {
    setModalEvent(event)
    setIsNewEvent(false)
  }

  const handleDateClick = (dateStr: string) => {
    setModalEvent({
      summary: '',
      description: '',
      start: { date: dateStr },
      end: { date: dateStr },
      linkedFiles: [],
    })
    setIsNewEvent(true)
  }

  const handleSave = async (event: Partial<CalendarEvent>) => {
    let res
    const calId = event.calendarId || defaultCalendarId
    if (isNewEvent) {
      res = await createEvent(calId, event)
    } else if (event.id) {
      res = await updateEvent(calId, event.id, event)
    }
    if (res?.success) {
      setModalEvent(null)
      setActionMsg(isNewEvent ? '이벤트가 생성되었습니다' : '이벤트가 수정되었습니다')
    } else {
      setActionMsg(res?.error || '오류가 발생했습니다')
    }
    setTimeout(() => setActionMsg(null), 3000)
  }

  const handleDelete = async (eventId: string) => {
    // 삭제할 이벤트의 캘린더 ID 찾기
    const ev = events.find(e => e.id === eventId)
    const calId = ev?.calendarId || defaultCalendarId
    const res = await deleteEvent(calId, eventId)
    if (res.success) {
      setModalEvent(null)
      setActionMsg('이벤트가 삭제되었습니다')
    } else {
      setActionMsg(res.error || '삭제 실패')
    }
    setTimeout(() => setActionMsg(null), 3000)
  }

  // ── Not signed in ─────────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400">
        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">사이드바에서 Google 캘린더에 로그인하세요</p>
      </div>
    )
  }

  if (selectedCalendarIds.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400">
        <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm">사이드바에서 캘린더를 선택하세요</p>
      </div>
    )
  }

  // 이벤트 생성 시 사용할 기본 캘린더 (첫 번째 선택된 캘린더)
  const defaultCalendarId = selectedCalendarIds[0]

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-full bg-white dark:bg-gray-900">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={handleToday} className="px-3 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            오늘
          </button>
          <div className="flex items-center gap-1">
            <button onClick={handlePrev} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button onClick={handleNext} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <h2 className="text-base font-semibold text-gray-800 dark:text-gray-100">
            {currentMonth.getFullYear()}년 {monthNames[currentMonth.getMonth()]}
          </h2>
          {isLoading && (
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Calendar names */}
          {selectedCalendarIds.length > 0 && (
            <span className="text-[10px] text-gray-400 mr-2">
              {calendars.filter(c => selectedCalendarIds.includes(c.id)).map(c => c.summary).join(', ')}
            </span>
          )}

          {/* Action message */}
          {actionMsg && (
            <span className="text-[10px] text-green-500 mr-2">{actionMsg}</span>
          )}

          {/* Add event button */}
          <button
            onClick={() => {
              const today = new Date()
              const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
              handleDateClick(dateStr)
            }}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            새 이벤트
          </button>

          {/* View mode toggle */}
          <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
            <button
              onClick={() => setViewMode('month')}
              className={`px-3 py-1 text-xs transition-colors ${
                viewMode === 'month'
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              월
            </button>
            <button
              onClick={() => setViewMode('week')}
              className={`px-3 py-1 text-xs transition-colors ${
                viewMode === 'week'
                  ? 'bg-blue-500 text-white'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              주
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      {viewMode === 'month' ? (
        <MonthView events={events} onEventClick={handleEventClick} onDateClick={handleDateClick} currentMonth={currentMonth} />
      ) : (
        <WeekView events={events} onEventClick={handleEventClick} onDateClick={handleDateClick} currentMonth={currentMonth} />
      )}

      {/* Event modal */}
      {modalEvent && (
        <EventModal
          event={modalEvent}
          isNew={isNewEvent}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalEvent(null)}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  )
}
