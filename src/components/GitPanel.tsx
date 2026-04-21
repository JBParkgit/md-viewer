import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '../stores/useAppStore'

interface GitFileEntry {
  status: string      // M, A, D, ?, etc.
  staged: boolean
  file: string
}

interface GitLogEntry {
  hash: string
  message: string
}

function decodeGitPath(raw: string): string {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    const inner = raw.slice(1, -1)
    return inner.replace(/((?:\\[0-7]{3})+)/g, (match) => {
      const bytes = new Uint8Array(match.split('\\').filter(Boolean).map(o => parseInt(o, 8)))
      return new TextDecoder('utf-8').decode(bytes)
    }).replace(/\\/g, '/')
  }
  return raw.replace(/\\/g, '/')
}

function parseStatus(output: string): GitFileEntry[] {
  if (!output.trim()) return []
  return output.split('\n').filter(Boolean).map(line => {
    const index = line[0]    // staged status
    const worktree = line[1] // unstaged status
    const file = decodeGitPath(line.slice(3))
    if (index === '?' && worktree === '?') {
      return { status: '?', staged: false, file }
    }
    const entries: GitFileEntry[] = []
    if (index !== ' ' && index !== '?') {
      entries.push({ status: index, staged: true, file })
    }
    if (worktree !== ' ' && worktree !== '?') {
      entries.push({ status: worktree, staged: false, file })
    }
    if (entries.length === 0) {
      return { status: index === '?' ? '?' : index, staged: index !== ' ', file }
    }
    return entries
  }).flat()
}

function parseLog(output: string): GitLogEntry[] {
  if (!output.trim()) return []
  return output.split('\n').filter(Boolean).map(line => {
    const spaceIdx = line.indexOf(' ')
    return {
      hash: line.slice(0, spaceIdx),
      message: line.slice(spaceIdx + 1),
    }
  })
}

function statusColor(status: string): string {
  switch (status) {
    case 'M': return 'text-orange-500'
    case 'A': return 'text-green-500'
    case 'D': return 'text-red-500'
    case '?': return 'text-green-500'
    case 'R': return 'text-blue-500'
    default: return 'text-gray-500'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'M': return '수정'
    case 'A': return '추가'
    case 'D': return '삭제'
    case '?': return '새 파일'
    case 'R': return '이름변경'
    default: return status
  }
}

export default function GitPanel() {
  const projects = useAppStore(s => s.projects)
  const [selectedProjectPath, setSelectedProjectPath] = useState<string | null>(null)
  const [isRepo, setIsRepo] = useState(false)
  const [branch, setBranch] = useState('')
  const [files, setFiles] = useState<GitFileEntry[]>([])
  const [logs, setLogs] = useState<GitLogEntry[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [aheadCount, setAheadCount] = useState(0)
  const [remoteUrl, setRemoteUrl] = useState('')
  const [showRemoteInput, setShowRemoteInput] = useState(false)
  const [remoteInputValue, setRemoteInputValue] = useState('')
  const [showCloneInput, setShowCloneInput] = useState(false)
  const [cloneUrl, setCloneUrl] = useState('')
  const [cloning, setCloning] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [gitConfigData, setGitConfigData] = useState<{
    userName: string; userEmail: string; remoteFetch: string; remotePush: string; defaultBranch: string
  } | null>(null)
  const setPullResult = useAppStore(s => s.setPullResult)

  // Auto-select first project (only if none selected or current selection is invalid)
  useEffect(() => {
    if (projects.length === 0) {
      setSelectedProjectPath(null)
    } else if (!selectedProjectPath || !projects.some(p => p.path === selectedProjectPath)) {
      setSelectedProjectPath(projects[0].path)
    }
  }, [projects])

  // Pick up project selection from branch badge click
  const gitSelectedProject = useAppStore(s => s.gitSelectedProject)
  const setGitSelectedProject = useAppStore(s => s.setGitSelectedProject)
  useEffect(() => {
    if (gitSelectedProject) {
      setSelectedProjectPath(gitSelectedProject)
      setGitSelectedProject(null)
    }
  }, [gitSelectedProject, setGitSelectedProject])

  const refresh = useCallback(async () => {
    if (!selectedProjectPath) return
    setLoading(true)
    try {
      const repoCheck = await window.electronAPI.gitIsRepo(selectedProjectPath)
      setIsRepo(repoCheck)
      if (!repoCheck) { setLoading(false); return }

      const [branchRes, statusRes, logRes, remoteRes] = await Promise.all([
        window.electronAPI.gitBranch(selectedProjectPath),
        window.electronAPI.gitStatus(selectedProjectPath),
        window.electronAPI.gitLog(selectedProjectPath),
        window.electronAPI.gitRemoteGet(selectedProjectPath),
      ])
      const currentBranch = branchRes.success ? branchRes.output || '' : ''
      setBranch(currentBranch)
      setFiles(statusRes.success ? parseStatus(statusRes.output || '') : [])
      setLogs(logRes.success ? parseLog(logRes.output || '') : [])
      setRemoteUrl(remoteRes.success ? remoteRes.output || '' : '')
      // Count commits ahead of upstream (not yet pushed)
      const aheadRes = await window.electronAPI.gitAhead(selectedProjectPath)
      setAheadCount(aheadRes.success ? parseInt(aheadRes.output?.trim() || '0', 10) : 0)
    } catch {}
    setLoading(false)
  }, [selectedProjectPath])

  useEffect(() => { refresh() }, [refresh])

  // Reset commit message when switching projects to avoid cross-project bleed
  useEffect(() => { setCommitMsg('') }, [selectedProjectPath])

  // Auto-refresh when directory changes
  useEffect(() => {
    if (!selectedProjectPath) return
    const unsub = window.electronAPI.onDirChanged((changedPath) => {
      if (changedPath === selectedProjectPath) refresh()
    })
    return unsub
  }, [selectedProjectPath, refresh])

  const showAction = (text: string, type: 'success' | 'error') => {
    setActionMsg({ text, type })
    setTimeout(() => setActionMsg(null), type === 'error' ? 10000 : 3000)
  }

  const notifyGitChanged = () => {
    if (selectedProjectPath) {
      window.dispatchEvent(new CustomEvent('git-status-changed', { detail: selectedProjectPath }))
    }
  }

  const handleInit = async () => {
    if (!selectedProjectPath) return
    const res = await window.electronAPI.gitInit(selectedProjectPath)
    if (res.success) {
      showAction('Git 저장소가 초기화되었습니다.', 'success')
      refresh()
      notifyGitChanged()
    } else {
      showAction(res.error || '초기화 실패', 'error')
    }
  }

  const handleClone = async () => {
    if (!cloneUrl.trim()) return
    const destParent = await window.electronAPI.cloneFolder()
    if (!destParent) return
    // Extract repo name from URL
    const repoName = cloneUrl.trim().replace(/\.git$/, '').split('/').pop() || 'repo'
    const sep = destParent.includes('/') ? '/' : '\\'
    const destDir = destParent + sep + repoName
    setCloning(true)
    const res = await window.electronAPI.gitClone(cloneUrl.trim(), destDir)
    setCloning(false)
    if (res.success) {
      showAction('Clone 완료!', 'success')
      useAppStore.getState().addProject(destDir)
      setShowCloneInput(false)
      setCloneUrl('')
      setSelectedProjectPath(destDir)
    } else {
      showAction(res.error || 'Clone 실패', 'error')
    }
  }

  const handleStage = async (file: string) => {
    if (!selectedProjectPath) return
    await window.electronAPI.gitStage(selectedProjectPath, file)
    refresh()
    notifyGitChanged()
  }

  const handleUnstage = async (file: string) => {
    if (!selectedProjectPath) return
    await window.electronAPI.gitUnstage(selectedProjectPath, file)
    refresh()
    notifyGitChanged()
  }

  const handleStageAll = async () => {
    if (!selectedProjectPath) return
    await window.electronAPI.gitStageAll(selectedProjectPath)
    refresh()
    notifyGitChanged()
  }

  const handleDiscard = async (file: string) => {
    if (!selectedProjectPath) return
    if (!window.confirm(`"${file}" 파일의 변경사항을 취소하시겠습니까?`)) return
    await window.electronAPI.gitDiscard(selectedProjectPath, file)
    refresh()
    notifyGitChanged()
  }

  const handleCommit = async () => {
    if (!selectedProjectPath || !commitMsg.trim()) return
    const res = await window.electronAPI.gitCommit(selectedProjectPath, commitMsg.trim())
    if (res.success) {
      showAction('커밋 완료!', 'success')
      setCommitMsg('')
      refresh()
      notifyGitChanged()
    } else {
      showAction(res.error || '커밋 실패', 'error')
    }
  }

  const handlePull = async () => {
    if (!selectedProjectPath) return
    setLoading(true)
    const res = await window.electronAPI.gitPull(selectedProjectPath)
    if (res.success) {
      if (res.alreadyUpToDate) {
        showAction('이미 최신 상태입니다.', 'success')
      } else {
        const commitCount = res.commits?.length || 0
        const fileCount = res.files?.length || 0
        const projectName = projects.find(p => p.path === selectedProjectPath)?.name || selectedProjectPath
        setPullResult({
          projectPath: selectedProjectPath,
          projectName,
          commits: res.commits || [],
          files: res.files || [],
        })
        showAction(`받기 완료: 커밋 ${commitCount}개 · 파일 ${fileCount}개 변경`, 'success')
      }
      refresh()
      notifyGitChanged()
    } else {
      showAction(res.error || 'Pull 실패', 'error')
      setLoading(false)
    }
  }

  const handlePush = async () => {
    if (!selectedProjectPath) return
    setLoading(true)
    const res = await window.electronAPI.gitPush(selectedProjectPath)
    // Always refresh — a silent-success push (timeout after the server
    // already received the pack) would otherwise leave the ahead badge
    // stuck, luring the user into pushing again and creating a divergence
    // on the next Pull. refresh() also resets the loading spinner.
    refresh()
    notifyGitChanged()
    if (res.success) {
      const msg = res.output?.startsWith('업로드') ? res.output : 'Push 완료!'
      showAction(msg, 'success')
    } else {
      const err = res.error || ''
      const needsPull = err.includes('fetch first') || err.includes('non-fast-forward') || err.includes('rejected')
      showAction(needsPull ? 'Push 실패: 원격에 새 커밋이 있습니다. Pull 먼저 하세요.' : (err || 'Push 실패'), 'error')
    }
  }

  const handleRemoteAdd = async () => {
    if (!selectedProjectPath || !remoteInputValue.trim()) return
    const res = await window.electronAPI.gitRemoteAdd(selectedProjectPath, remoteInputValue.trim())
    if (res.success) {
      showAction('원격 저장소가 설정되었습니다.', 'success')
      setShowRemoteInput(false)
      setRemoteInputValue('')
      refresh()
    } else {
      showAction(res.error || '원격 설정 실패', 'error')
    }
  }

  const stagedFiles = files.filter(f => f.staged)
  const unstagedFiles = files.filter(f => !f.staged)

  const cloneInputUI = showCloneInput && (
    <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
      <div className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1.5">원격 저장소 Clone</div>
      <input
        value={cloneUrl}
        onChange={e => setCloneUrl(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleClone(); if (e.key === 'Escape') { setShowCloneInput(false); setCloneUrl('') } }}
        placeholder="https://github.com/user/repo.git"
        className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 mb-1.5"
        autoFocus
      />
      <div className="flex gap-1.5">
        <button
          onClick={handleClone}
          disabled={!cloneUrl.trim() || cloning}
          className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs transition-colors"
        >
          {cloning ? (
            <>
              <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Clone 중...
            </>
          ) : (
            'Clone'
          )}
        </button>
        <button
          onClick={() => { setShowCloneInput(false); setCloneUrl('') }}
          className="px-2 py-1.5 rounded text-xs text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
        >
          취소
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Project selector + Clone button */}
      <div className="px-2 py-1.5 border-b border-gray-200 dark:border-gray-700 flex items-center gap-1.5">
        {projects.length > 0 ? (
          <select
            value={selectedProjectPath || ''}
            onChange={e => setSelectedProjectPath(e.target.value)}
            className="flex-1 min-w-0 text-xs px-1.5 py-1 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 focus:outline-none"
          >
            {projects.map(p => (
              <option key={p.path} value={p.path}>{p.name}</option>
            ))}
          </select>
        ) : (
          <span className="flex-1 text-xs text-gray-400">프로젝트 없음</span>
        )}
        <button
          onClick={() => setShowCloneInput(v => !v)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0 ${
            showCloneInput
              ? 'bg-green-600 text-white'
              : 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/50 border border-green-200 dark:border-green-800'
          }`}
          title="원격 저장소 Clone"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Clone
        </button>
      </div>

      {/* Action message */}
      {actionMsg && (
        <div className={`px-3 py-1.5 text-xs ${actionMsg.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
          {actionMsg.text}
        </div>
      )}

      {/* Clone input (shared) */}
      {cloneInputUI}

      {/* No projects */}
      {projects.length === 0 && !showCloneInput && (
        <div className="flex flex-col items-center justify-center gap-2 py-8 px-4">
          <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-xs text-gray-400 text-center">프로젝트를 추가하거나<br/>Clone으로 저장소를 받아오세요</p>
        </div>
      )}

      {/* Not a repo */}
      {!isRepo && selectedProjectPath && !showCloneInput && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 px-4">
          <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <p className="text-xs text-gray-400 text-center">Git 저장소가 아닙니다</p>
          <button
            onClick={handleInit}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            Git 저장소 초기화
          </button>
        </div>
      )}

      {/* Repo content */}
      {isRepo && selectedProjectPath && (
        <div className="flex-1 overflow-y-auto">
          {/* Branch + Push/Pull */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-1.5">
              <svg className="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
              </svg>
              <span className="font-medium text-purple-600 dark:text-purple-400">{branch || '(no branch)'}</span>
              {aheadCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold leading-none" title={`${aheadCount}개의 커밋이 아직 푸시되지 않았습니다`}>
                  {aheadCount}
                </span>
              )}
              {loading && <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />}
              <div className="flex-1" />
              <button onClick={refresh} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600" title="새로고침">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handlePull}
                disabled={loading || !remoteUrl}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white transition-colors"
                title={remoteUrl ? '원격에서 받기' : '원격 저장소가 설정되지 않았습니다'}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                받기 (Pull)
              </button>
              <button
                onClick={handlePush}
                disabled={loading || !remoteUrl}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-colors"
                title={remoteUrl ? '원격에 올리기' : '원격 저장소가 설정되지 않았습니다'}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
                올리기 (Push)
                {aheadCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-white/30 text-white text-[10px] font-bold leading-none">
                    {aheadCount}
                  </span>
                )}
              </button>
            </div>
            {/* Remote URL */}
            <div className="mt-1.5">
              {remoteUrl ? (
                <div className="text-[10px] text-gray-400 truncate" title={remoteUrl}>
                  origin: {remoteUrl}
                </div>
              ) : (
                <>
                  {!showRemoteInput ? (
                    <button
                      onClick={() => setShowRemoteInput(true)}
                      className="text-[10px] text-blue-500 hover:text-blue-600"
                    >
                      + 원격 저장소 설정
                    </button>
                  ) : (
                    <div className="flex gap-1 mt-1">
                      <input
                        value={remoteInputValue}
                        onChange={e => setRemoteInputValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRemoteAdd(); if (e.key === 'Escape') setShowRemoteInput(false) }}
                        placeholder="https://github.com/user/repo.git"
                        className="flex-1 px-1.5 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 min-w-0"
                        autoFocus
                      />
                      <button
                        onClick={handleRemoteAdd}
                        className="px-2 py-1 rounded bg-blue-500 hover:bg-blue-600 text-white flex-shrink-0"
                      >
                        확인
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Staged files */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 font-medium">
                스테이지됨 ({stagedFiles.length})
              </span>
            </div>
            {stagedFiles.length > 0 && (
              <div className="pb-1">
                {stagedFiles.map((f, i) => (
                  <div key={`s-${i}`} className="group flex items-center gap-1.5 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span className={`font-mono font-bold w-4 text-center ${statusColor(f.status)}`}>{f.status}</span>
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.file}</span>
                    <button
                      onClick={() => handleUnstage(f.file)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Unstage"
                    >
                      <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unstaged / untracked files */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <div className="px-3 py-1.5 flex items-center justify-between">
              <span className="text-gray-500 dark:text-gray-400 font-medium">
                변경됨 ({unstagedFiles.length})
              </span>
              {unstagedFiles.length > 0 && (
                <button
                  onClick={handleStageAll}
                  className="text-[10px] text-blue-500 hover:text-blue-600"
                >
                  모두 스테이지
                </button>
              )}
            </div>
            {unstagedFiles.length > 0 && (
              <div className="pb-1">
                {unstagedFiles.map((f, i) => (
                  <div key={`u-${i}`} className="group flex items-center gap-1.5 px-3 py-1 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <span className={`font-mono font-bold w-4 text-center ${statusColor(f.status)}`}>{f.status}</span>
                    <span className="flex-1 truncate text-gray-700 dark:text-gray-300">{f.file}</span>
                    <button
                      onClick={() => handleStage(f.file)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      title="Stage"
                    >
                      <svg className="w-3 h-3 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </button>
                    {f.status !== '?' && (
                      <button
                        onClick={() => handleDiscard(f.file)}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                        title="변경 취소"
                      >
                        <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commit area */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <textarea
              value={commitMsg}
              onChange={e => setCommitMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleCommit() }}
              placeholder="커밋 메시지 입력... (Ctrl+Enter로 커밋)"
              className="w-full px-2 py-1.5 rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-blue-400"
              rows={2}
            />
            <button
              onClick={handleCommit}
              disabled={!commitMsg.trim() || stagedFiles.length === 0}
              className="mt-1.5 w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              저장 (커밋) {stagedFiles.length > 0 && `(${stagedFiles.length}개 파일)`}
            </button>
          </div>

          {/* Recent log */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <div className="text-gray-500 dark:text-gray-400 font-medium mb-1.5">최근 이력</div>
            {logs.length === 0 ? (
              <div className="text-gray-400 py-2">커밋 이력이 없습니다</div>
            ) : (
              <div className="space-y-1">
                {logs.map((log, i) => (
                  <div key={i} className="group flex items-start gap-1.5 py-0.5">
                    <span className="font-mono text-[10px] text-blue-500 flex-shrink-0 mt-0.5">{log.hash}</span>
                    <span className="flex-1 text-gray-600 dark:text-gray-400 leading-tight">{log.message}</span>
                    <button
                      onClick={async () => {
                        if (!selectedProjectPath) return
                        if (!window.confirm(`"${log.hash}" 커밋을 되돌리시겠습니까?\n(되돌리는 새 커밋이 생성됩니다)`)) return
                        const res = await window.electronAPI.gitRevert(selectedProjectPath, log.hash)
                        if (res.success) {
                          showAction('커밋이 되돌려졌습니다.', 'success')
                          refresh()
                        } else {
                          showAction(res.error || 'Revert 실패', 'error')
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 flex-shrink-0 mt-0.5"
                      title="이 커밋 되돌리기"
                    >
                      <svg className="w-3 h-3 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Git config */}
          <div className="px-3 py-2">
            <button
              onClick={async () => {
                if (!showConfig && selectedProjectPath) {
                  const res = await window.electronAPI.gitConfig(selectedProjectPath)
                  if (res.success && res.output) {
                    setGitConfigData(JSON.parse(res.output))
                  }
                }
                setShowConfig(v => !v)
              }}
              className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-300"
            >
              <svg className={`w-3 h-3 transition-transform ${showConfig ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              저장소 설정
            </button>
            {showConfig && gitConfigData && (
              <div className="mt-2 space-y-1.5 text-[11px]">
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">사용자</span>
                  <span className="text-gray-700 dark:text-gray-300 truncate">
                    {gitConfigData.userName || <span className="text-gray-400 italic">미설정</span>}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">이메일</span>
                  <span className="text-gray-700 dark:text-gray-300 truncate">
                    {gitConfigData.userEmail || <span className="text-gray-400 italic">미설정</span>}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">원격 (fetch)</span>
                  <span className="text-gray-700 dark:text-gray-300 truncate font-mono text-[10px]">
                    {gitConfigData.remoteFetch || <span className="text-gray-400 italic">미설정</span>}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">원격 (push)</span>
                  <span className="text-gray-700 dark:text-gray-300 truncate font-mono text-[10px]">
                    {gitConfigData.remotePush || <span className="text-gray-400 italic">미설정</span>}
                  </span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">브랜치</span>
                  <span className="text-purple-600 dark:text-purple-400 font-mono">{branch || 'HEAD'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-400 w-16 flex-shrink-0">기본 브랜치</span>
                  <span className="text-gray-700 dark:text-gray-300 font-mono">
                    {gitConfigData.defaultBranch || <span className="text-gray-400 italic">미설정</span>}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
