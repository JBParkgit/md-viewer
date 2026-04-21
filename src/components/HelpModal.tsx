import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

type Section = 'overview' | 'shortcuts' | 'editor' | 'workflow' | 'git' | 'about'

interface Shortcut { keys: string; desc: string }

const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: '파일 / 창',
    items: [
      { keys: 'Ctrl+O', desc: '파일 열기' },
      { keys: 'Ctrl+Shift+O', desc: '프로젝트 폴더 추가' },
      { keys: 'Ctrl+S', desc: '저장' },
      { keys: 'Ctrl+Q', desc: '종료' },
      { keys: 'Ctrl+Shift+T', desc: '목차 패널 토글' },
      { keys: 'Ctrl+= / Ctrl+-', desc: '글자 크기 조절' },
    ],
  },
  {
    group: '편집 — 서식',
    items: [
      { keys: 'Ctrl+B', desc: '굵게 **텍스트**' },
      { keys: 'Ctrl+I', desc: '기울임 *텍스트*' },
      { keys: 'Ctrl+1 / 2 / 3', desc: '헤딩 1 / 2 / 3단계 토글' },
      { keys: 'Ctrl+Shift+8', desc: '글머리 기호 목록' },
      { keys: 'Ctrl+Shift+7', desc: '번호 매긴 목록' },
      { keys: 'Ctrl+Shift+9', desc: '체크박스 목록' },
    ],
  },
  {
    group: '편집 — 기타',
    items: [
      { keys: 'Ctrl+Enter', desc: 'Git 커밋 메시지 전송 (Git 패널)' },
      { keys: 'Tab / Shift+Tab', desc: '들여쓰기 / 내어쓰기' },
      { keys: '[[', desc: '위키링크 자동완성 열기' },
    ],
  },
]

export default function HelpModal({ open, onClose }: Props) {
  const [section, setSection] = useState<Section>('overview')

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  if (!open) return null

  const nav: { id: Section; label: string; icon: string }[] = [
    { id: 'overview', label: '소개', icon: '📖' },
    { id: 'shortcuts', label: '단축키', icon: '⌨️' },
    { id: 'editor', label: '편집기', icon: '✏️' },
    { id: 'workflow', label: '워크플로우', icon: '✅' },
    { id: 'git', label: 'Git', icon: '🌿' },
    { id: 'about', label: '정보', icon: 'ℹ️' },
  ]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div
        className="w-[720px] max-w-[92vw] h-[560px] max-h-[86vh] flex bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700"
        onMouseDown={e => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="w-40 flex-shrink-0 bg-gray-50 dark:bg-gray-900/60 border-r border-gray-200 dark:border-gray-700 py-3">
          <div className="px-3 pb-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">도움말</div>
          {nav.map(n => (
            <button
              key={n.id}
              onClick={() => setSection(n.id)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                section === n.id
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
              {nav.find(n => n.id === section)?.label}
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500"
              title="닫기 (Esc)"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4 text-xs text-gray-700 dark:text-gray-200 leading-relaxed">
            {section === 'overview' && <OverviewSection />}
            {section === 'shortcuts' && <ShortcutsSection />}
            {section === 'editor' && <EditorSection />}
            {section === 'workflow' && <WorkflowSection />}
            {section === 'git' && <GitSection />}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  )
}

function H({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 mt-3 mb-1.5 first:mt-0">{children}</div>
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-gray-600 dark:text-gray-300">{children}</p>
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="mb-0.5 text-gray-600 dark:text-gray-300">{children}</li>
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-[10px] font-mono text-gray-700 dark:text-gray-200">
      {children}
    </kbd>
  )
}

function OverviewSection() {
  return (
    <>
      <H>Docuflow란?</H>
      <P>
        Docuflow는 마크다운 문서 작성과 팀 협업(리뷰/승인 워크플로우, Git 연동)을
        하나로 결합한 데스크톱 워크스페이스입니다.
      </P>
      <H>핵심 기능</H>
      <ul className="list-disc pl-5">
        <Li>실시간 마크다운 편집기 + 미리보기 분할 화면</Li>
        <Li>문서 단위의 리뷰/승인 워크플로우 (frontmatter 기반)</Li>
        <Li>프로젝트별 Git 저장소 연동 (Clone/Commit/Push/Pull)</Li>
        <Li>위키링크 <Key>[[문서명]]</Key> 자동완성</Li>
        <Li>이미지/PDF/Office 파일 뷰어 내장</Li>
        <Li>캘린더 · 태그 · 파일 히스토리</Li>
      </ul>
      <H>시작하기</H>
      <ol className="list-decimal pl-5">
        <Li>상단 메뉴 → <b>파일 → 프로젝트 폴더 추가</b>로 작업할 폴더를 엽니다.</Li>
        <Li>좌측 트리에서 <code>.md</code> 파일을 클릭해 편집을 시작합니다.</Li>
        <Li>워크플로우가 필요하면 편집기 상단 바에서 <b>워크플로우 시작</b>을 누릅니다.</Li>
      </ol>
    </>
  )
}

function ShortcutsSection() {
  return (
    <>
      {SHORTCUTS.map(g => (
        <div key={g.group} className="mb-3">
          <H>{g.group}</H>
          <div className="space-y-1">
            {g.items.map(s => (
              <div key={s.keys} className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-gray-600 dark:text-gray-300">{s.desc}</span>
                <Key>{s.keys}</Key>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function EditorSection() {
  return (
    <>
      <H>편집기 레이아웃</H>
      <P>상단 우측의 분할 버튼으로 편집 전용 / 미리보기 / 분할 뷰를 전환할 수 있습니다.</P>
      <H>스크롤 동기화</H>
      <P>
        분할 뷰에서 편집기 또는 미리보기를 스크롤하면 반대편이 자동으로 따라갑니다.
        편집기의 커서 위치는 미리보기에서 파란 좌측 바로 하이라이트됩니다.
      </P>
      <H>위키링크</H>
      <P>
        <Key>[[</Key> 를 입력하면 프로젝트 내의 다른 마크다운 파일 목록이 뜨고, 선택 시
        <Key>[[문서명]]</Key> 형태로 삽입됩니다. 미리보기에서 클릭하면 해당 문서가 열립니다.
      </P>
      <H>이미지 붙여넣기 · 드래그</H>
      <P>
        클립보드 이미지를 붙여넣거나 파일 탐색기에서 이미지를 드래그하면 프로젝트의
        <code> assets/</code> 폴더에 저장되고 상대경로로 삽입됩니다.
      </P>
      <H>맞춤법 검사</H>
      <P>보기 메뉴에서 맞춤법 검사를 켜고 끌 수 있습니다.</P>
    </>
  )
}

function WorkflowSection() {
  return (
    <>
      <H>워크플로우란?</H>
      <P>
        문서 상단의 YAML frontmatter에 상태·작성자·승인자를 기록해 리뷰/승인 과정을
        문서 자체로 관리하는 기능입니다. 모든 정보는 파일에 저장되어 Git으로도 추적됩니다.
      </P>
      <H>상태</H>
      <ul className="list-disc pl-5">
        <Li>📝 <b>초안(draft)</b> — 작성 중. 리뷰 요청 전</Li>
        <Li>👀 <b>리뷰 중(review)</b> — 승인자의 검토 대기</Li>
        <Li>✅ <b>승인됨(approved)</b> — 모든 승인자가 승인 완료</Li>
        <Li>❌ <b>반려됨(rejected)</b> — 한 명 이상이 반려</Li>
      </ul>
      <H>사용 흐름</H>
      <ol className="list-decimal pl-5">
        <Li>문서 상단 바에서 <b>✨ 워크플로우 시작</b>을 누릅니다.</Li>
        <Li>승인자 이름을 입력해 목록에 추가합니다.</Li>
        <Li><b>🚀 리뷰 요청</b>으로 상태를 <code>review</code>로 전환합니다.</Li>
        <Li>승인자는 <b>✅ 승인</b> 또는 <b>❌ 반려</b>를 선택하고 의견을 남깁니다.</Li>
        <Li>모든 이력은 자동으로 <code>history</code>에 기록됩니다.</Li>
      </ol>
      <H>현재 사용자 설정</H>
      <P>좌측 사이드바 하단에서 본인 이름을 설정해야 승인/반려가 가능합니다.</P>
    </>
  )
}

function GitSection() {
  return (
    <>
      <H>Git 패널</H>
      <P>
        좌측 사이드바의 Git 탭에서 프로젝트별로 변경사항을 스테이지·커밋하고,
        원격 저장소에 Push/Pull 할 수 있습니다.
      </P>
      <H>기본 흐름</H>
      <ol className="list-decimal pl-5">
        <Li>변경된 파일을 + 버튼으로 스테이지합니다. (또는 "모두 스테이지")</Li>
        <Li>커밋 메시지를 입력하고 <Key>Ctrl+Enter</Key> 또는 저장 버튼을 누릅니다.</Li>
        <Li>원격이 설정돼 있으면 <b>올리기(Push)</b>로 업로드합니다.</Li>
      </ol>
      <H>원격 저장소</H>
      <ul className="list-disc pl-5">
        <Li><b>Clone</b> 버튼으로 새 저장소를 받아올 수 있습니다.</Li>
        <Li>기존 프로젝트는 "+ 원격 저장소 설정"으로 URL을 등록합니다.</Li>
        <Li>브랜치 옆 숫자 뱃지는 아직 Push되지 않은 커밋 수입니다.</Li>
      </ul>
      <H>되돌리기</H>
      <P>
        변경사항은 파일 우측의 되돌리기 버튼으로 취소할 수 있고, 과거 커밋은
        최근 이력에서 되돌리기(새 revert 커밋 생성)로 복구할 수 있습니다.
      </P>
    </>
  )
}

function AboutSection() {
  return (
    <>
      <H>Docuflow v{__APP_VERSION__}</H>
      <P>Document Workspace & Editor</P>
      <div className="mt-2 p-3 rounded-md bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
        <div>Electron · React · TypeScript · CodeMirror 6 · Tailwind</div>
        <div>마크다운: remark / rehype · 코드 하이라이트: highlight.js</div>
      </div>
      <H>문제 신고 / 피드백</H>
      <P>사용 중 불편한 점이나 개선 아이디어가 있다면 프로젝트 관리자에게 공유해 주세요.</P>
    </>
  )
}
