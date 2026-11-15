/**
 * ZeroCage Status Bar & Footer:
 * Minimal, proportional, no bulky grey bands.
 * @module @deepseek-ai/dsh-tui-kit/status-bar
 */

import type { Component } from '@deepseek-ai/pi-tui'
import { truncateToWidth, visibleWidth } from '@deepseek-ai/pi-tui'
import type { Theme } from './theme.ts'
import type { TuiViewState } from './types.ts'

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export function formatCount(value: number): string {
  if (value < 1000) return String(Math.max(0, Math.round(value)))
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

export function contextPercent(state: TuiViewState): number {
  if (state.tokens.contextWindow <= 0) return 0
  const ratio = state.tokens.contextUsed / state.tokens.contextWindow
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
}

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes)}m${String(seconds % 60).padStart(2, '0')}s`
}

export interface StatusClock {
  runningSince: number | undefined
}

function splitModel(model: string): { name: string; provider: string } {
  const slash = model.lastIndexOf('/')
  if (slash <= 0) return { name: model, provider: '' }
  return { name: model.slice(slash + 1), provider: model.slice(0, slash) }
}

/**
 * Minimal status line rendered directly above the composer:
 * Status dot + status word + model + tool on left; context usage on right.
 */
export function createStatusBar(options: {
  readonly getState: () => TuiViewState
  readonly theme: Theme
  readonly clock?: StatusClock
}): Component {
  const { theme } = options
  return {
    render(width: number): string[] {
      const state = options.getState()
      const busy = state.status === 'running' || state.status === 'waiting'
      const since = options.clock?.runningSince
      const elapsed = busy && since !== undefined ? ` ${formatElapsed(Date.now() - since)}` : ''

      const leftParts: string[] = []
      if (state.status === 'running') {
        const frame = SPINNER[Math.floor(Date.now() / 110) % SPINNER.length] ?? '⠋'
        leftParts.push(theme.accent(`${frame} working${elapsed}`))
      } else if (state.status === 'waiting') {
        leftParts.push(theme.warn(`● waiting${elapsed}`))
      } else if (state.status === 'error') {
        leftParts.push(theme.error('▲ error'))
      } else {
        leftParts.push(theme.accent('● idle'))
      }

      if (state.model === '') {
        leftParts.push(theme.muted('(connecting)'))
      } else {
        const { name, provider } = splitModel(state.model)
        leftParts.push(`${theme.strong(name)}${provider === '' ? '' : ` ${theme.faint(provider)}`}`)
      }
      if (state.currentTool !== undefined && width >= 70) {
        leftParts.push(theme.muted(state.currentTool))
      }
      const left = leftParts.join(theme.faint('  ·  '))

      const rightParts: string[] = []
      if (state.tokens.contextWindow > 0) {
        rightParts.push(`${formatCount(state.tokens.contextUsed)} (${String(contextPercent(state))}%)`)
      } else if (state.tokens.contextUsed > 0) {
        rightParts.push(formatCount(state.tokens.contextUsed))
      }
      const right = rightParts.length > 0 ? theme.muted(rightParts.join('  ·  ')) : ''

      const leftW = visibleWidth(left)
      const rightW = visibleWidth(right)
      const pad = width - leftW - rightW
      if (pad >= 2) {
        return [truncateToWidth(`${left}${' '.repeat(pad)}${right}`, Math.max(1, width), '…')]
      }
      return [truncateToWidth(left, Math.max(1, width), '…')]
    },
    invalidate(): void {},
  }
}

/**
 * Minimal footer: working directory on left, hotkeys on right.
 */
export function createFooter(options: {
  readonly getState: () => TuiViewState
  readonly theme: Theme
}): Component {
  const { theme } = options
  return {
    render(width: number): string[] {
      const state = options.getState()
      const leftParts: string[] = []
      if (state.cwd !== '') leftParts.push(shortenPath(state.cwd, Math.max(16, Math.floor(width * 0.45))))
      if (state.queued.length > 0) leftParts.push(theme.warn(`${String(state.queued.length)} queued`))
      const left = theme.muted(leftParts.join('  ·  '))

      const rightParts: string[] = []
      rightParts.push(`${theme.strong('ctrl+p')} ${theme.muted('commands')}`, `${theme.faint('ctrl+d exit')}`)
      const right = rightParts.join('   ')

      const leftW = visibleWidth(left)
      const rightW = visibleWidth(right)
      const pad = width - leftW - rightW
      if (pad >= 2) {
        return [truncateToWidth(`${left}${' '.repeat(pad)}${right}`, Math.max(1, width), '…')]
      }
      return [truncateToWidth(left, Math.max(1, width), '…')]
    },
    invalidate(): void {},
  }
}

export function shortenPath(cwd: string, width: number): string {
  if (visibleWidth(cwd) <= width) return cwd
  const tail = cwd.length > width - 1 ? cwd.slice(cwd.length - (width - 1)) : cwd
  return `…${tail}`
}
