// Shared launchers for the Export/Import flows so FileTree, Toolbar, and any
// future entry point share identical UX (save-as dialog, error surfacing,
// auto-open of the imported result). Keeps duplication out of components.

function replaceExt(filePath: string, newExt: string): string {
  const withoutExt = filePath.replace(/\.[^./\\]+$/, '')
  return `${withoutExt}.${newExt}`
}

function dispatchOpenFile(path: string, name: string) {
  window.dispatchEvent(new CustomEvent('menu:openFile', { detail: { path, name } }))
}

// Catches IPC errors too (e.g. handler not registered because main was built
// from an older revision) so we never silently swallow failures — without
// this wrapper an uncaught rejection in the background leaves the user
// thinking "I clicked and nothing happened."
async function surface<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    alert(`${label} 실패: ${msg}\n\n(앱을 방금 업데이트했다면 재시작이 필요할 수 있습니다.)`)
    return null
  }
}

export async function exportMdToPdf(mdFilePath: string, _fileName: string): Promise<void> {
  const defaultPath = replaceExt(mdFilePath, 'pdf')
  const destPath = await surface('저장 위치 선택', () =>
    window.electronAPI.saveAs(defaultPath, [{ name: 'PDF', extensions: ['pdf'] }])
  )
  if (!destPath) return
  const res = await surface('PDF 내보내기', () => window.electronAPI.exportPdf(mdFilePath, destPath))
  if (!res) return
  if (!res.success) { alert(`PDF 내보내기 실패: ${res.error || '알 수 없는 오류'}`); return }
  const open = window.confirm(`PDF로 저장되었습니다:\n${destPath}\n\n탐색기에서 열까요?`)
  if (open) window.electronAPI.showItemInFolder(destPath)
}

export async function exportMdToDocx(mdFilePath: string, _fileName: string): Promise<void> {
  const defaultPath = replaceExt(mdFilePath, 'docx')
  const destPath = await surface('저장 위치 선택', () =>
    window.electronAPI.saveAs(defaultPath, [{ name: 'Word', extensions: ['docx'] }])
  )
  if (!destPath) return
  const res = await surface('Word 내보내기', () => window.electronAPI.exportDocx(mdFilePath, destPath))
  if (!res) return
  if (!res.success) { alert(`Word 내보내기 실패: ${res.error || '알 수 없는 오류'}`); return }
  const open = window.confirm(`Word 문서로 저장되었습니다:\n${destPath}\n\n탐색기에서 열까요?`)
  if (open) window.electronAPI.showItemInFolder(destPath)
}

export async function importDocxAsMd(docxFilePath: string): Promise<void> {
  const defaultPath = replaceExt(docxFilePath, 'md')
  const destPath = await surface('저장 위치 선택', () =>
    window.electronAPI.saveAs(defaultPath, [{ name: 'Markdown', extensions: ['md'] }])
  )
  if (!destPath) return
  const res = await surface('Word → Markdown 변환', () => window.electronAPI.importDocxToMd(docxFilePath, destPath))
  if (!res) return
  if (!res.success) { alert(`Word → Markdown 변환 실패: ${res.error || '알 수 없는 오류'}`); return }
  const warnings = res.messages && res.messages.length > 0
    ? `\n\n변환 중 알림:\n- ${res.messages.slice(0, 5).join('\n- ')}${res.messages.length > 5 ? `\n- … 외 ${res.messages.length - 5}개` : ''}`
    : ''
  const open = window.confirm(`Markdown으로 변환되었습니다:\n${destPath}${warnings}\n\n지금 열까요?`)
  if (open) {
    const name = destPath.split(/[/\\]/).pop() || destPath
    dispatchOpenFile(destPath, name)
  }
}
