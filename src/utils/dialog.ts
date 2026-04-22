import {
  useDialogStore,
  type AlertOptions,
  type ConfirmOptions,
  type PromptOptions,
} from '../stores/useDialogStore'

// Imperative in-app dialogs. Replaces window.alert / window.confirm /
// window.prompt — those native dialogs leave the Electron BrowserWindow in a
// "focus-stuck" state on Windows after they close, causing keyboard input to
// become unresponsive until the user Alt+Tabs away and back.

export function alert(message: string): Promise<void>
export function alert(options: AlertOptions): Promise<void>
export function alert(arg: string | AlertOptions): Promise<void> {
  const opts: AlertOptions = typeof arg === 'string' ? { message: arg } : arg
  return new Promise<void>((resolve) => {
    useDialogStore.getState().push({
      kind: 'alert',
      opts,
      resolve,
    })
  })
}

export function confirm(message: string): Promise<boolean>
export function confirm(options: ConfirmOptions): Promise<boolean>
export function confirm(arg: string | ConfirmOptions): Promise<boolean> {
  const opts: ConfirmOptions = typeof arg === 'string' ? { message: arg } : arg
  return new Promise<boolean>((resolve) => {
    useDialogStore.getState().push({
      kind: 'confirm',
      opts,
      resolve,
    })
  })
}

export function prompt(message: string, defaultValue?: string): Promise<string | null>
export function prompt(options: PromptOptions): Promise<string | null>
export function prompt(arg: string | PromptOptions, defaultValue?: string): Promise<string | null> {
  const opts: PromptOptions = typeof arg === 'string' ? { message: arg, defaultValue } : arg
  return new Promise<string | null>((resolve) => {
    useDialogStore.getState().push({
      kind: 'prompt',
      opts,
      resolve,
    })
  })
}
