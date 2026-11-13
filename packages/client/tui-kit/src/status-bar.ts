/**
 * The status bar and key-hint footer: the two fixed rows above and below the
 * editor. Both read the same snapshot the transcript does, so the numbers an
 * operator sees always come from the state the host just published.
 * @module @deepseek-ai/dsh-tui-kit/status-bar
 */

import type { Component } from '@deepseek-ai/pi-tui'
import { truncateToWidth, visibleWidth } from '@deepseek-ai/pi-tui'
import type { Theme } from './theme.ts'
import type { TuiViewState } from './types.ts'

/** Compact integer formatting: 1234 → 1.2k, 1200000 → 1.2M. */
export function formatCount(value: number): string {
  if (value < 1000) return String(Math.max(0, Math.round(value)))
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/** Percentage of the context window in use, clamped to 0-100. */
export function contextPercent(state: TuiViewState): number {
  if (state.tokens.contextWindow <= 0) return 0
  const ratio = state.tokens.contextUsed / state.tokens.contextWindow
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

/** The word shown for the conversation status. */
function statusWord(state: TuiViewState): string {
  switch (state.status) {
    case 'starting': return 'starting'
    case 'idle': return 'idle'
    case 'running': return 'working'
    case 'waiting': return 'waiting for you'
    case 'error': return 'error'
  }
}

/** The status text color for the current status. */
function statusStyle(state: TuiViewState, theme: Theme): (text: string) => string {
  switch (state.status) {
    case 'running': return theme.accent
    case 'waiting': return theme.warn
    case 'error': return theme.error
    default: return theme.muted
  }
}

/**
 * Build the status bar.
 * @param options - state reader and theme.
 * @returns one-line component, truncated rather than wrapped at narrow widths.
 */
export function createStatusBar(options: { readonly getState: () => TuiViewState; readonly theme: Theme }): Component {
  const { theme } = options
  return {
    render(width: number): string[] {
      const state = options.getState()
      const parts: string[] = [theme.bold('zerocage'), theme.assistant(state.model)]
      parts.push(`${statusStyle(state, theme)(statusWord(state))}`)
      if (state.currentTool !== undefined) parts.push(theme.tool(state.currentTool))
      const used = contextPercent(state)
      const context = state.tokens.contextWindow > 0
        ? `ctx ${String(used)}% · ${formatCount(state.tokens.contextUsed)}/${formatCount(state.tokens.contextWindow)}`
        : `ctx ${formatCount(state.tokens.contextUsed)}`
      parts.push(theme.muted(context))
      parts.push(theme.muted(`in ${formatCount(state.tokens.input)} · out ${formatCount(state.tokens.output)}`))
      const line = parts.join(theme.muted(' · '))
      return [truncateToWidth(line, Math.max(1, width), '…')]
    },
    invalidate(): void {
      // Nothing cached: the line is rebuilt from the snapshot every frame.
    },
  }
}

/**
 * Build the key-hint footer.
 * @param options - state reader, theme, and the hints the host wants shown.
 * @returns one-line component.
 */
export function createFooter(options: {
  readonly getState: () => TuiViewState
  readonly theme: Theme
}): Component {
  const { theme } = options
  return {
    render(width: number): string[] {
      const state = options.getState()
      const hints: string[] = []
      if (state.hint !== undefined) hints.push(state.hint)
      if (state.queued.length > 0) hints.push(`${String(state.queued.length)} queued`)
      hints.push('[enter] send', '[ctrl+j] newline', '[ctrl+c] stop', '[ctrl+d] exit', '[pgup/pgdn] scroll')
      const line = theme.muted(truncateToWidth(hints.join('  '), Math.max(1, width), '…'))
      return [line]
    },
    invalidate(): void {
      // Stateless.
    },
  }
}

/**
 * Truncate the middle of a long working directory so the tail (the project name) survives.
 * @param cwd - absolute working directory.
 * @param width - available columns.
 * @returns the display form.
 */
export function shortenPath(cwd: string, width: number): string {
  if (visibleWidth(cwd) <= width) return cwd
  const tail = cwd.length > width - 1 ? cwd.slice(cwd.length - (width - 1)) : cwd
  return `…${tail}`
}
