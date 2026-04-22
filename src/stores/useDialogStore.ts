import { create } from 'zustand'

export type DialogVariant = 'default' | 'danger'
export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

export interface ConfirmOptions {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: DialogVariant
}

export interface AlertOptions {
  title?: string
  message: string
  variant?: AlertVariant
  okLabel?: string
}

export interface PromptOptions {
  title?: string
  message: string
  defaultValue?: string
  placeholder?: string
  confirmLabel?: string
  cancelLabel?: string
}

export type DialogRequest =
  | { id: number; kind: 'alert'; opts: AlertOptions; resolve: () => void }
  | { id: number; kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { id: number; kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }

interface DialogStore {
  queue: DialogRequest[]
  push: (req: Omit<DialogRequest, 'id'>) => void
  resolveTop: (value: unknown) => void
}

let nextId = 1

export const useDialogStore = create<DialogStore>((set) => ({
  queue: [],
  push: (req) => set((s) => ({ queue: [...s.queue, { ...req, id: nextId++ } as DialogRequest] })),
  resolveTop: (value) => set((s) => {
    if (s.queue.length === 0) return s
    const [top, ...rest] = s.queue
    // Narrow and invoke. The resolver accepts the specific type for each kind,
    // but the caller at the host passes unknown — we trust the host to pass the
    // right shape per kind.
    ;(top.resolve as (v: unknown) => void)(value)
    return { queue: rest }
  }),
}))
