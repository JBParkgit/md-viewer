import { useEffect, useRef, useState } from 'react'
import { useDialogStore, type DialogRequest } from '../stores/useDialogStore'

// Renders the top of the dialog queue as an in-app modal. Mounted once at the
// app root. See utils/dialog.ts for the imperative API.

export default function DialogHost() {
  const queue = useDialogStore(s => s.queue)
  const resolveTop = useDialogStore(s => s.resolveTop)
  const top = queue[0]

  if (!top) return null
  return <DialogModal key={top.id} req={top} onResolve={resolveTop} />
}

function DialogModal({ req, onResolve }: { req: DialogRequest; onResolve: (v: unknown) => void }) {
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [inputValue, setInputValue] = useState(
    req.kind === 'prompt' ? (req.opts.defaultValue ?? '') : ''
  )

  // Autofocus: input for prompt, confirm button otherwise. Must fire after
  // the element mounts; a microtask via setTimeout(0) is enough.
  useEffect(() => {
    const t = setTimeout(() => {
      if (req.kind === 'prompt') {
        inputRef.current?.focus()
        inputRef.current?.select()
      } else {
        confirmBtnRef.current?.focus()
      }
    }, 0)
    return () => clearTimeout(t)
  }, [req.kind])

  const cancel = () => {
    if (req.kind === 'alert') onResolve(undefined)
    else if (req.kind === 'confirm') onResolve(false)
    else onResolve(null)
  }
  const confirmOk = () => {
    if (req.kind === 'alert') onResolve(undefined)
    else if (req.kind === 'confirm') onResolve(true)
    else onResolve(inputValue)
  }

  // Global key handler while this modal is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
      else if (e.key === 'Enter') {
        // For prompt, Enter commits only when the input itself is focused
        // (avoid accidental submit while focus is elsewhere).
        if (req.kind === 'prompt' && document.activeElement !== inputRef.current) return
        e.preventDefault()
        confirmOk()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.id, inputValue])

  const iconNode = iconFor(req)
  const title = req.opts.title ?? defaultTitle(req)
  const confirmLabel = confirmLabelFor(req)
  const cancelLabel = cancelLabelFor(req)
  const danger = req.kind === 'confirm' && req.opts.variant === 'danger'

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30 backdrop-blur-[1px]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) cancel() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-[min(440px,92vw)] rounded-lg bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div className="px-5 pt-5 pb-3">
          <div className="flex items-start gap-3">
            {iconNode}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
              <div className="mt-1 text-xs text-gray-600 dark:text-gray-300 whitespace-pre-wrap break-words">
                {req.opts.message}
              </div>
              {req.kind === 'prompt' && (
                <input
                  ref={inputRef}
                  value={inputValue}
                  placeholder={req.opts.placeholder}
                  onChange={(e) => setInputValue(e.target.value)}
                  className="mt-3 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100"
                />
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-200 dark:border-gray-700">
          {req.kind !== 'alert' && (
            <button
              onClick={cancel}
              className="px-3 py-1.5 text-xs rounded-md bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmBtnRef}
            onClick={confirmOk}
            className={`px-3 py-1.5 text-xs font-medium rounded-md text-white transition-colors ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function defaultTitle(req: DialogRequest): string {
  if (req.kind === 'alert') {
    switch (req.opts.variant) {
      case 'success': return '완료'
      case 'warning': return '주의'
      case 'error':   return '오류'
      default:        return '알림'
    }
  }
  if (req.kind === 'confirm') return req.opts.variant === 'danger' ? '삭제 확인' : '확인'
  return '입력'
}

function confirmLabelFor(req: DialogRequest): string {
  if (req.kind === 'alert') return req.opts.okLabel ?? '확인'
  if (req.kind === 'confirm') return req.opts.confirmLabel ?? (req.opts.variant === 'danger' ? '삭제' : '확인')
  return req.opts.confirmLabel ?? '확인'
}

function cancelLabelFor(req: DialogRequest): string {
  if (req.kind === 'confirm') return req.opts.cancelLabel ?? '취소'
  if (req.kind === 'prompt') return req.opts.cancelLabel ?? '취소'
  return '취소'
}

function iconFor(req: DialogRequest): JSX.Element {
  if (req.kind === 'alert') {
    const v = req.opts.variant ?? 'info'
    const color = {
      info: 'text-blue-500',
      success: 'text-green-500',
      warning: 'text-amber-500',
      error: 'text-red-500',
    }[v]
    return (
      <svg className={`w-5 h-5 flex-shrink-0 ${color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={
          v === 'error' || v === 'warning'
            ? 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
            : v === 'success'
            ? 'M5 13l4 4L19 7'
            : 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
        } />
      </svg>
    )
  }
  if (req.kind === 'confirm' && req.opts.variant === 'danger') {
    return (
      <svg className="w-5 h-5 flex-shrink-0 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    )
  }
  return (
    <svg className="w-5 h-5 flex-shrink-0 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}
