import { shell } from 'electron'
import { google } from 'googleapis'
import http from 'http'
import Store from 'electron-store'

import { CLIENT_ID, CLIENT_SECRET } from './googleCredentials'

// Google OAuth2 설정
const SCOPES = ['https://www.googleapis.com/auth/calendar']

const store = new Store()

interface GoogleTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
}

function createOAuth2Client(redirectUri?: string) {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, redirectUri)
}

/** 저장된 토큰으로 인증된 OAuth2 클라이언트 반환 */
export function getAuthClient() {
  const tokens = store.get('googleTokens') as GoogleTokens | undefined
  if (!tokens) return null

  const client = createOAuth2Client()
  client.setCredentials(tokens)

  // 토큰 갱신 시 자동 저장
  client.on('tokens', (newTokens) => {
    const current = store.get('googleTokens') as GoogleTokens | undefined
    store.set('googleTokens', {
      ...current,
      ...newTokens,
    })
  })

  return client
}

/** Google 로그인 상태 확인 */
export function isSignedIn(): boolean {
  const tokens = store.get('googleTokens') as GoogleTokens | undefined
  return !!tokens?.refresh_token
}

/** Google OAuth2 로그인 (시스템 브라우저 + 로컬 서버 콜백) */
export function signIn(): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const server = http.createServer()
    let resolved = false
    // 2분 타임아웃 — 사용자가 브라우저에서 응답하지 않을 경우
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        server.close()
        resolve({ success: false, error: '로그인 시간이 초과되었습니다.' })
      }
    }, 120000)

    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        clearTimeout(timeout)
        server.close()
        resolve({ success: false, error: '로컬 서버를 시작할 수 없습니다.' })
        return
      }

      const port = address.port
      const redirectUri = `http://127.0.0.1:${port}/callback`
      const oauth2Client = createOAuth2Client(redirectUri)

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
      })

      // 시스템 기본 브라우저에서 Google 로그인 페이지 열기
      shell.openExternal(authUrl)

      // 콜백 핸들러
      server.on('request', async (req, res) => {
        if (!req.url?.startsWith('/callback')) return

        const url = new URL(req.url, `http://127.0.0.1:${port}`)
        const code = url.searchParams.get('code')
        const error = url.searchParams.get('error')

        if (error || !code) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>로그인이 취소되었습니다</h2><p style="color:#888">Docuflow로 돌아가주세요.</p></body></html>')
          if (!resolved) { resolved = true; clearTimeout(timeout); server.close() }
          resolve({ success: false, error: error || '인증 코드를 받지 못했습니다.' })
          return
        }

        try {
          const { tokens } = await oauth2Client.getToken(code)
          store.set('googleTokens', tokens)

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>✓ 로그인 성공!</h2><p style="color:#888">이 탭을 닫고 Docuflow로 돌아가주세요.</p></body></html>')
          if (!resolved) { resolved = true; clearTimeout(timeout); server.close() }
          resolve({ success: true })
        } catch (err) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end('<html><body style="font-family:sans-serif;text-align:center;padding:60px"><h2>로그인 실패</h2><p style="color:#888">다시 시도해주세요.</p></body></html>')
          if (!resolved) { resolved = true; clearTimeout(timeout); server.close() }
          resolve({ success: false, error: String(err) })
        }
      })
    })
  })
}

/** Google 로그아웃 (토큰 삭제) */
export function signOut() {
  store.delete('googleTokens' as any)
  store.delete('selectedCalendarIds' as any)
}

/** 선택된 캘린더 ID 목록 저장/조회 */
export function getSelectedCalendarIds(): string[] {
  return (store.get('selectedCalendarIds') as string[]) || []
}

export function setSelectedCalendarIds(ids: string[]) {
  store.set('selectedCalendarIds', ids)
}
