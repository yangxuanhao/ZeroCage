/**
 * Terminal prompts: the overlay the host shows when the model needs an answer
 * (approval, `ask_user`, session picker). Each prompt is a self-contained
 * pi-tui component with its own key handling, so the kit never has to
 * multiplex a single global input mode.
 * @module @deepseek-ai/dsh-tui-kit/prompt
 */

import type { Component } from '@deepseek-ai/pi-tui'
import { matchesKey, truncateToWidth, wrapTextWithAnsi } from '@deepseek-ai/pi-tui'
import type { Theme } from './theme.ts'

/** One selectable row. */
export interface PromptOption {
  readonly value: string
  readonly label: string
  readonly description: string | undefined
}

/** Options for {@link createChoicePrompt}. */
export interface ChoicePromptOptions {
  readonly title: string
  readonly detail: string | undefined
  readonly options: readonly PromptOption[]
  /** Enter toggles a row instead of confirming immediately. */
  readonly multiSelect: boolean
  /** Allow a typed free-form reply in addition to the listed rows. */
  readonly allowCustom: boolean
  readonly theme: Theme
  /** Called exactly once: the chosen values, or `undefined` when the operator cancelled. */
  readonly settle: (values: readonly string[] | undefined, custom: string | undefined) => void
}

/** A prompt component plus the free-form text it collected. */
export interface ChoicePrompt extends Component {
  handleInput(data: string): void
}

/**
 * Build a keyboard-driven choice prompt.
 * @param options - the question, the rows, and the settle callback.
 * @returns a component usable as a pi-tui overlay.
 */
export function createChoicePrompt(options: ChoicePromptOptions): ChoicePrompt {
  const { theme } = options
  let cursor = 0
  let custom = ''
  let editing = false
  const selected = new Set<number>()
  let settled = false

  const settle = (values: readonly string[] | undefined): void => {
    if (settled) return
    settled = true
    options.settle(values, custom === '' ? undefined : custom)
  }

  const confirm = (): void => {
    if (options.multiSelect) {
      const values: string[] = []
      for (const index of [...selected].sort((a, b) => a - b)) {
        const option = options.options[index]
        if (option !== undefined) values.push(option.value)
      }
      settle(values.length > 0 || custom !== '' ? values : undefined)
      return
    }
    const option = options.options[cursor]
    settle(option === undefined ? (custom === '' ? undefined : []) : [option.value])
  }

  return {
    render(width: number): string[] {
      const inner = Math.max(16, width - 4)
      const border = theme.accent('─'.repeat(Math.max(1, inner)))
      const lines: string[] = [border, theme.accent(theme.bold(truncateToWidth(options.title, inner)))]
      if (options.detail !== undefined && options.detail !== '') {
        for (const line of wrapTextWithAnsi(options.detail, inner)) lines.push(theme.muted(line))
      }
      if (options.options.length > 0) lines.push('')
      options.options.forEach((option, index) => {
        const active = index === cursor
        const marker = options.multiSelect
          ? (selected.has(index) ? '[x]' : '[ ]')
          : (active ? '›' : ' ')
        const label = `${marker} ${option.label}`
        lines.push(active ? theme.inverse(truncateToWidth(label, inner)) : truncateToWidth(label, inner))
        if (option.description !== undefined && option.description !== '') {
          lines.push(theme.muted(truncateToWidth(`    ${option.description}`, inner)))
        }
      })
      if (options.allowCustom) {
        lines.push('')
        const label = editing ? `type: ${custom}▍` : `type: ${custom === '' ? '(press / to type a custom answer)' : custom}`
        lines.push(editing ? theme.accent(truncateToWidth(label, inner)) : theme.muted(truncateToWidth(label, inner)))
      }
      lines.push(border)
      const hints = options.multiSelect
        ? '[↑↓] move  [space] toggle  [enter] submit  [esc] cancel'
        : '[↑↓] move  [enter] choose  [esc] cancel'
      lines.push(theme.muted(truncateToWidth(hints, inner)))
      return lines
    },
    invalidate(): void {
      // No cached geometry.
    },
    handleInput(data: string): void {
      if (matchesKey(data, 'escape') || data === '\x1b') {
        if (editing) {
          editing = false
          return
        }
        settle(undefined)
        return
      }
      if (editing) {
        if (matchesKey(data, 'enter')) {
          editing = false
          confirm()
          return
        }
        if (matchesKey(data, 'backspace')) {
          custom = custom.slice(0, -1)
          return
        }
        if (data.length === 1 && data >= ' ') custom += data
        return
      }
      if (options.allowCustom && (data === '/' || data === '\\')) {
        editing = true
        return
      }
      if (matchesKey(data, 'up') || data === 'k') {
        cursor = Math.max(0, cursor - 1)
        return
      }
      if (matchesKey(data, 'down') || data === 'j') {
        cursor = Math.min(Math.max(0, options.options.length - 1), cursor + 1)
        return
      }
      if (data === ' ') {
        if (options.multiSelect) {
          if (selected.has(cursor)) selected.delete(cursor)
          else selected.add(cursor)
          return
        }
        confirm()
        return
      }
      if (matchesKey(data, 'enter')) {
        confirm()
        return
      }
      // Single-letter shortcuts: the first option matching the letter chooses it.
      const letter = data.toLowerCase()
      const shortcut = options.options.findIndex(option => option.label.toLowerCase().startsWith(letter) && letter !== '')
      if (letter.length === 1 && shortcut !== -1 && !options.multiSelect) {
        cursor = shortcut
        confirm()
      }
    },
  }
}
