export interface CalendarInfo {
  id: string
  summary: string
  primary: boolean
  accessRole: string
  backgroundColor?: string
}

export interface CalendarEvent {
  id: string
  calendarId: string
  summary: string
  description: string
  start: { dateTime?: string; date?: string }
  end: { dateTime?: string; date?: string }
  linkedFiles: string[]
  linkedProjectPath: string | null
  colorId?: string
}
