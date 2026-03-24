import { useState, useEffect, useCallback } from 'react'
import { useCalendarStore } from '../stores/useCalendarStore'
import type { CalendarEvent } from '../types/calendar'

interface Props {
  onOpenFile: (filePath: string, fileName: string) => void
}

// ── Mini month grid ─────────────────────────────────────────────────────────
function MiniCalendar({ currentMonth, selectedDate, events, onSelectDate, onPrevMonth, onNextMonth, onToday }: {
  currentMonth: Date
  selectedDate: string | null
  events: CalendarEvent[]
  onSelectDate: (date: string) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onToday: () => void
}) {
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  // Build event date set for dot indicators (multi-day events span all days)
  const eventDates = new Set<string>()
  events.forEach(e => {
    const startStr = e.start.date || e.start.dateTime?.split('T')[0]
    const endStr = e.end.date || e.end.dateTime?.split('T')[0]
    if (!startStr) return
    const start = new Date(startStr + 'T00:00:00')
    const end = endStr ? new Date(endStr + 'T00:00:00') : start
    const lastDay = e.start.date && e.end.date ? new Date(end.getTime() - 86400000) : end
    const cur = new Date(start)
    while (cur <= lastDay) {
      eventDates.add(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
      cur.setDate(cur.getDate() + 1)
    }
  })

  const days: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let i = 1; i <= daysInMonth; i++) days.push(i)

  const weeks: (number | null)[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7))
  }
  // Pad last week
  while (weeks.length > 0 && weeks[weeks.length - 1].length < 7) {
    weeks[weeks.length - 1].push(null)
  }

  const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월']
  const dayNames = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="px-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={onPrevMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={onToday} className="text-xs font-semibold text-gray-700 dark:text-gray-200 hover:text-blue-500 transition-colors">
          {year}년 {monthNames[month]}
        </button>
        <button onClick={onNextMonth} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-0 mb-0.5">
        {dayNames.map(d => (
          <div key={d} className="text-center text-[10px] text-gray-400 font-medium py-0.5">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-0">
          {week.map((day, di) => {
            if (day === null) return <div key={di} className="h-7" />
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const hasEvents = eventDates.has(dateStr)
            return (
              <button
                key={di}
                onClick={() => onSelectDate(dateStr)}
                className={`h-7 flex flex-col items-center justify-center rounded text-[11px] transition-colors relative ${
                  isSelected
                    ? 'bg-blue-500 text-white'
                    : isToday
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 font-semibold'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'
                } ${di === 0 ? 'text-red-400' : di === 6 ? 'text-blue-400' : ''} ${isSelected ? '!text-white' : ''}`}
              >
                {day}
                {hasEvents && (
                  <div className={`absolute bottom-0.5 w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Event list item ─────────────────────────────────────────────────────────
function EventItem({ event, onOpenFile, onEdit }: {
  event: CalendarEvent
  onOpenFile: (filePath: string, fileName: string) => void
  onEdit: (event: CalendarEvent) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const startTime = event.start.dateTime
    ? new Date(event.start.dateTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : '종일'

  return (
    <div
      className="px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${event.colorId ? `bg-blue-${Math.min(parseInt(event.colorId) * 100, 500)}` : 'bg-blue-500'}`} />
        <span className="text-[10px] text-gray-400 flex-shrink-0 w-10">{startTime}</span>
        <span className="text-xs text-gray-700 dark:text-gray-200 truncate flex-1">{event.summary}</span>
        {event.linkedFiles.length > 0 && (
          <span className="text-[9px] bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-300 px-1 rounded flex-shrink-0">
            {event.linkedFiles.length}
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-1.5 ml-4 space-y-1">
          {event.description && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 whitespace-pre-wrap line-clamp-3">{event.description}</p>
          )}
          {event.linkedFiles.length > 0 && (
            <div className="space-y-0.5">
              {event.linkedFiles.map((f, i) => {
                const fileName = f.split(/[/\\]/).pop() || f
                return (
                  <button
                    key={i}
                    onClick={(e) => { e.stopPropagation(); onOpenFile(f, fileName) }}
                    className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-600 hover:underline"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {fileName}
                  </button>
                )
              })}
            </div>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(event) }}
            className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
          >
            편집
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main CalendarPanel ──────────────────────────────────────────────────────
export default function CalendarPanel({ onOpenFile }: Props) {
  const {
    isSignedIn, isLoading, calendars, selectedCalendarIds, calendarColors, events,
    currentMonth, selectedDate,
    checkAuth, signIn, signOut, loadCalendars, toggleCalendar,
    setCalendarColor, getCalendarColor,
    setCurrentMonth, setSelectedDate,
    startPolling, stopPolling,
  } = useCalendarStore()

  const [error, setError] = useState<string | null>(null)
  const [showCalendarList, setShowCalendarList] = useState(true)

  // Auto-show calendar list when none selected
  useEffect(() => {
    if (isSignedIn && selectedCalendarIds.length === 0) {
      setShowCalendarList(true)
    }
  }, [isSignedIn, selectedCalendarIds.length])

  // Check auth on mount
  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  // Load calendars when signed in
  useEffect(() => {
    if (isSignedIn && calendars.length === 0) {
      loadCalendars()
    }
  }, [isSignedIn, calendars.length, loadCalendars])

  // Start/stop polling
  useEffect(() => {
    if (isSignedIn && selectedCalendarIds.length > 0) {
      startPolling()
      return () => stopPolling()
    }
  }, [isSignedIn, selectedCalendarIds.length, startPolling, stopPolling])

  const handleSignIn = async () => {
    setError(null)
    const res = await signIn()
    if (!res.success) {
      setError(res.error || '로그인 실패')
    }
  }

  const handlePrevMonth = useCallback(() => {
    const d = new Date(currentMonth)
    d.setMonth(d.getMonth() - 1)
    setCurrentMonth(d)
  }, [currentMonth, setCurrentMonth])

  const handleNextMonth = useCallback(() => {
    const d = new Date(currentMonth)
    d.setMonth(d.getMonth() + 1)
    setCurrentMonth(d)
  }, [currentMonth, setCurrentMonth])

  const handleToday = useCallback(() => {
    const today = new Date()
    setCurrentMonth(today)
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    setSelectedDate(todayStr)
  }, [setCurrentMonth, setSelectedDate])

  // Filter events for selected date (include multi-day events)
  const filteredEvents = selectedDate
    ? events.filter(e => {
        const startStr = e.start.date || e.start.dateTime?.split('T')[0]
        const endStr = e.end.date || e.end.dateTime?.split('T')[0]
        if (!startStr) return false
        const start = startStr
        const end = endStr || startStr
        // For all-day events, Google end is exclusive
        if (e.start.date && e.end.date) {
          const endExcl = new Date(end + 'T00:00:00')
          endExcl.setDate(endExcl.getDate() - 1)
          const lastDay = `${endExcl.getFullYear()}-${String(endExcl.getMonth() + 1).padStart(2, '0')}-${String(endExcl.getDate()).padStart(2, '0')}`
          return selectedDate >= start && selectedDate <= lastDay
        }
        return selectedDate >= start && selectedDate <= end
      })
    : events

  // ── Not signed in ─────────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-4">
        <svg className="w-12 h-12 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-xs text-gray-400 text-center">Google 캘린더를 연결하여<br/>팀 일정을 공유하세요</p>
        <button
          onClick={handleSignIn}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white text-xs rounded-lg transition-colors"
        >
          {isLoading ? (
            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
          )}
          Google 캘린더 연결
        </button>
        {error && <p className="text-[10px] text-red-500">{error}</p>}
      </div>
    )
  }

  // ── Signed in ──────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Calendar multi-selector */}
      <div className="px-2 pt-2 pb-1">
        <button
          onClick={() => setShowCalendarList(!showCalendarList)}
          className="w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-blue-400 transition-colors"
        >
          <span className="truncate">
            {selectedCalendarIds.length === 0
              ? '캘린더를 선택하세요'
              : `${selectedCalendarIds.length}개 캘린더 선택됨`}
          </span>
          <svg className={`w-3 h-3 transition-transform ${showCalendarList ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showCalendarList && (
          <div className="mt-1 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            {calendars.length === 0 && isLoading ? (
              <div className="flex justify-center py-4">
                <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto">
                {calendars.map(cal => {
                  const isChecked = selectedCalendarIds.includes(cal.id)
                  const color = getCalendarColor(cal.id)
                  return (
                    <div
                      key={cal.id}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        isChecked ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      <button
                        onClick={() => toggleCalendar(cal.id)}
                        className={`w-3.5 h-3.5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          isChecked
                            ? ''
                            : 'border-gray-300 dark:border-gray-500'
                        }`}
                        style={isChecked ? { backgroundColor: color, borderColor: color } : {}}
                      >
                        {isChecked && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => toggleCalendar(cal.id)}
                        className="truncate text-gray-700 dark:text-gray-200 text-left flex-1"
                      >
                        {cal.summary}
                      </button>
                      {cal.primary && (
                        <span className="text-[9px] text-gray-400 flex-shrink-0">기본</span>
                      )}
                      <label className="relative flex-shrink-0 w-4 h-4 rounded-full overflow-hidden cursor-pointer border border-gray-200 dark:border-gray-600" style={{ backgroundColor: color }}>
                        <input
                          type="color"
                          value={color}
                          onChange={e => setCalendarColor(cal.id, e.target.value)}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                      </label>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mini calendar */}
      <div className="py-1">
        <MiniCalendar
          currentMonth={currentMonth}
          selectedDate={selectedDate}
          events={events}
          onSelectDate={setSelectedDate}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onToday={handleToday}
        />
      </div>

      {/* Divider */}
      <div className="border-t border-gray-200 dark:border-gray-700 mx-2" />

      {/* Event list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {isLoading && events.length === 0 ? (
          <div className="flex justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-[11px]">{selectedDate ? '이 날의 일정이 없습니다' : '이벤트 없음'}</span>
          </div>
        ) : (
          <div className="space-y-0.5">
            {selectedDate && (
              <div className="px-2 py-1 text-[10px] font-medium text-gray-400">
                {new Date(selectedDate + 'T00:00:00').toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
                <span className="ml-1 text-gray-300">({filteredEvents.length})</span>
              </div>
            )}
            {filteredEvents.map(event => (
              <EventItem
                key={event.id}
                event={event}
                onOpenFile={onOpenFile}
                onEdit={() => {/* TODO: edit modal in CalendarView */}}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-1.5 flex items-center justify-between">
        <button
          onClick={signOut}
          className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
        >
          로그아웃
        </button>
        {isLoading && (
          <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    </div>
  )
}
