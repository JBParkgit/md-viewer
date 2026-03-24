import { google } from 'googleapis'
import { getAuthClient } from './googleAuth'

export interface CalendarInfo {
  id: string
  summary: string
  primary: boolean
  accessRole: string
  backgroundColor?: string
}

export interface CalendarEventData {
  id?: string
  calendarId?: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  linkedFiles?: string[]
  linkedProjectPath?: string
  colorId?: string
}

function getCalendarApi() {
  const auth = getAuthClient()
  if (!auth) throw new Error('Google 로그인이 필요합니다.')
  return google.calendar({ version: 'v3', auth })
}

/** 사용 가능한 캘린더 목록 조회 (쓰기 권한이 있는 것만) */
export async function listCalendars(): Promise<CalendarInfo[]> {
  const api = getCalendarApi()
  const res = await api.calendarList.list()
  const items = res.data.items || []
  return items
    .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map(c => ({
      id: c.id || '',
      summary: c.summary || '',
      primary: c.primary || false,
      accessRole: c.accessRole || 'reader',
      backgroundColor: c.backgroundColor || undefined,
    }))
}

/** 이벤트 목록 조회 */
export async function listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<CalendarEventData[]> {
  const api = getCalendarApi()
  const res = await api.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  })
  const items = res.data.items || []
  return items.map(e => {
    let linkedFiles: string[] = []
    let linkedProjectPath: string | undefined
    try {
      const ext = e.extendedProperties?.private
      if (ext?.linkedFiles) linkedFiles = JSON.parse(ext.linkedFiles)
      if (ext?.linkedProjectPath) linkedProjectPath = ext.linkedProjectPath
    } catch {}
    return {
      id: e.id || '',
      calendarId,
      summary: e.summary || '',
      description: e.description || '',
      start: { dateTime: e.start?.dateTime || undefined, date: e.start?.date || undefined },
      end: { dateTime: e.end?.dateTime || undefined, date: e.end?.date || undefined },
      linkedFiles,
      linkedProjectPath,
      colorId: e.colorId || undefined,
    }
  })
}

/** 이벤트 생성 */
export async function createEvent(calendarId: string, event: CalendarEventData): Promise<CalendarEventData> {
  const api = getCalendarApi()
  const extendedProperties: Record<string, string> = {}
  if (event.linkedFiles?.length) {
    extendedProperties.linkedFiles = JSON.stringify(event.linkedFiles)
  }
  if (event.linkedProjectPath) {
    extendedProperties.linkedProjectPath = event.linkedProjectPath
  }

  const res = await api.events.insert({
    calendarId,
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      colorId: event.colorId,
      extendedProperties: Object.keys(extendedProperties).length > 0
        ? { private: extendedProperties }
        : undefined,
    },
  })
  const e = res.data
  return {
    id: e.id || '',
    summary: e.summary || '',
    description: e.description || '',
    start: { dateTime: e.start?.dateTime || undefined, date: e.start?.date || undefined },
    end: { dateTime: e.end?.dateTime || undefined, date: e.end?.date || undefined },
    linkedFiles: event.linkedFiles || [],
    linkedProjectPath: event.linkedProjectPath,
    colorId: e.colorId || undefined,
  }
}

/** 이벤트 수정 */
export async function updateEvent(calendarId: string, eventId: string, updates: Partial<CalendarEventData>): Promise<CalendarEventData> {
  const api = getCalendarApi()
  const extendedProperties: Record<string, string> = {}
  if (updates.linkedFiles !== undefined) {
    extendedProperties.linkedFiles = JSON.stringify(updates.linkedFiles)
  }
  if (updates.linkedProjectPath !== undefined) {
    extendedProperties.linkedProjectPath = updates.linkedProjectPath
  }

  const body: Record<string, unknown> = {}
  if (updates.summary !== undefined) body.summary = updates.summary
  if (updates.description !== undefined) body.description = updates.description
  if (updates.start !== undefined) body.start = updates.start
  if (updates.end !== undefined) body.end = updates.end
  if (updates.colorId !== undefined) body.colorId = updates.colorId
  if (Object.keys(extendedProperties).length > 0) {
    body.extendedProperties = { private: extendedProperties }
  }

  const res = await api.events.patch({
    calendarId,
    eventId,
    requestBody: body,
  })
  const e = res.data
  let linkedFiles: string[] = []
  let linkedProjectPath: string | undefined
  try {
    const ext = e.extendedProperties?.private
    if (ext?.linkedFiles) linkedFiles = JSON.parse(ext.linkedFiles)
    if (ext?.linkedProjectPath) linkedProjectPath = ext.linkedProjectPath
  } catch {}
  return {
    id: e.id || '',
    summary: e.summary || '',
    description: e.description || '',
    start: { dateTime: e.start?.dateTime || undefined, date: e.start?.date || undefined },
    end: { dateTime: e.end?.dateTime || undefined, date: e.end?.date || undefined },
    linkedFiles,
    linkedProjectPath,
    colorId: e.colorId || undefined,
  }
}

/** 이벤트 삭제 */
export async function deleteEvent(calendarId: string, eventId: string): Promise<void> {
  const api = getCalendarApi()
  await api.events.delete({ calendarId, eventId })
}
