// JSX typing for Electron's <webview> tag (not part of React's default
// IntrinsicElements). Kept in its own module-scoped global augmentation so it
// doesn't disturb other ambient declarations.
import type * as React from 'react'

declare global {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string
        disablewebsecurity?: string
        allowpopups?: string
        partition?: string
        webpreferences?: string
      }
    }
  }
}

export {}
