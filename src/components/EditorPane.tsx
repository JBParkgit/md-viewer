import { useAppStore, type PaneId, type Tab } from '../stores/useAppStore'
import TabBar from './TabBar'
import MarkdownEditor from './MarkdownEditor'
import ImageViewer from './ImageViewer'
import PdfViewer from './PdfViewer'
import DocxViewer from './DocxViewer'
import VideoPlayer from './VideoPlayer'
import WelcomeScreen from './WelcomeScreen'

interface Props {
  paneId: PaneId
  openFile: (path: string, name: string, isPreview: boolean) => void
}

function PaneContent({ tab, openFile }: { tab: Tab | null; openFile: Props['openFile'] }) {
  if (!tab) return <WelcomeScreen />

  if (tab.fileType === 'image') return <ImageViewer tab={tab} onOpenFile={(p, n) => openFile(p, n, true)} />
  if (tab.fileType === 'video') return <VideoPlayer tab={tab} />
  if (tab.fileType === 'pdf') return <PdfViewer tab={tab} />
  if (tab.fileType === 'docx') return <DocxViewer tab={tab} />
  if (tab.fileType === 'other') return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-gray-400 dark:text-gray-500">
      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <div className="text-center">
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400">{tab.fileName}</p>
        <p className="text-sm mt-1">이 파일 형식은 Docuflow에서 미리볼 수 없습니다.</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">기본 프로그램으로 열려면 아래 버튼을 클릭하세요.</p>
      </div>
      <button
        onClick={() => window.electronAPI.openPath(tab.filePath)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
        기본 앱으로 열기
      </button>
      <button
        onClick={() => window.electronAPI.showItemInFolder(tab.filePath)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
        </svg>
        탐색기에서 보기
      </button>
    </div>
  )

  return <MarkdownEditor tab={tab} />
}

export default function EditorPane({ paneId, openFile }: Props) {
  const tabs = useAppStore(s => paneId === 'right' ? s.rightTabs : s.tabs)
  const activeTabId = useAppStore(s => paneId === 'right' ? s.rightActiveTabId : s.activeTabId)
  const activePaneId = useAppStore(s => s.activePaneId)
  const setActivePane = useAppStore(s => s.setActivePane)
  const splitMode = useAppStore(s => s.splitMode)
  const isActive = activePaneId === paneId

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden min-w-0"
      onClick={() => { if (!isActive) setActivePane(paneId) }}
    >
      {splitMode && (
        <div className={`h-0.5 flex-shrink-0 transition-colors ${
          isActive ? 'bg-blue-500' : 'bg-transparent'
        }`} />
      )}
      <TabBar paneId={paneId} />
      <div className="flex-1 overflow-hidden">
        <PaneContent tab={activeTab} openFile={openFile} />
      </div>
    </div>
  )
}
