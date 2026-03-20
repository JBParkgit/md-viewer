import { useAppStore } from '../stores/useAppStore'

export default function WelcomeScreen() {
  const { addProject } = useAppStore()

  const handleAddProject = async () => {
    const folder = await window.electronAPI.openFolder()
    if (folder) addProject(folder)
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
      <div className="flex flex-col items-center gap-3">
        <svg className="w-20 h-20 text-blue-200 dark:text-blue-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <h1 className="text-2xl font-bold text-gray-700 dark:text-gray-300">MD Viewer</h1>
        <p className="text-sm text-center max-w-sm">
          마크다운 파일을 쉽게 열람하고 편집할 수 있습니다.<br />
          프로젝트 폴더를 추가하여 시작하세요.
        </p>
      </div>

      <button
        onClick={handleAddProject}
        className="flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors shadow-lg"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        프로젝트 폴더 추가
      </button>

      <div className="flex flex-col gap-2 text-xs text-gray-400 dark:text-gray-600">
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-mono">Ctrl+S</kbd>
          <span>파일 저장</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-mono">Ctrl+Z</kbd>
          <span>실행 취소</span>
        </div>
        <div className="flex items-center gap-2">
          <kbd className="px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 font-mono">ESC</kbd>
          <span>이미지 모달 닫기</span>
        </div>
      </div>
    </div>
  )
}
