/**
 * Terminal prompts: the overlay the host shows when the model needs an answer
 * (approval, `ask_user`, session picker). Each prompt is a self-contained
 * pi-tui component with its own key handling, so the kit never has to
 * multiplex a single global input mode.
 * @module @deepseek-ai/dsh-tui-kit/prompt
 */

import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@deepseek-ai/pi-tui'
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@deepseek-ai/pi-tui'
import type { Theme } from './theme.ts'

/**
 * Fill a line to the overlay's width. The overlay is composited over the
 * transcript, so a short line would let the text underneath show through.
 * @param line - one rendered line, possibly containing ANSI.
 * @param width - the overlay width.
 * @returns the line padded with spaces to exactly that display width.
 */
function fillLine(line: string, width: number): string {
  const short = width - visibleWidth(line)
  return short > 0 ? line + ' '.repeat(short) : line
}

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
  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined
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
  let filter = ''
  let editing = false
  const selected = new Set<number>()
  let settled = false

  const visibleOptions = (): readonly PromptOption[] => {
    if (options.allowCustom || filter === '') return options.options
    const q = filter.toLowerCase()
    return options.options.filter(
      o => o.label.toLowerCase().includes(q) || (o.description?.toLowerCase().includes(q) ?? false),
    )
  }

  const settle = (values: readonly string[] | undefined): void => {
    if (settled) return
    settled = true
    options.settle(values, custom === '' ? undefined : custom)
  }

  const confirm = (): void => {
    const shown = visibleOptions()
    if (options.multiSelect) {
      const values: string[] = []
      for (const index of [...selected].sort((a, b) => a - b)) {
        const option = options.options[index]
        if (option !== undefined) values.push(option.value)
      }
      settle(values.length > 0 || custom !== '' ? values : undefined)
      return
    }
    const option = shown[cursor]
    settle(option === undefined ? (custom === '' ? undefined : []) : [option.value])
  }

  /** Track the row range for each option during render so mouse events hit accurately. */
  const optionRowRanges: { start: number; end: number }[] = []

  return {
    render(width: number): string[] {
      optionRowRanges.length = 0
      const inner = Math.max(16, width - 4)
      const border = theme.accent('─'.repeat(Math.max(1, inner)))
      const lines: string[] = [border, theme.accent(theme.bold(truncateToWidth(options.title, inner)))]
      if (options.detail !== undefined && options.detail !== '') {
        for (const line of wrapTextWithAnsi(options.detail, inner)) lines.push(theme.muted(line))
      }
      const shown = visibleOptions()
      if (filter !== '') {
        lines.push(theme.accent(truncateToWidth(`search: ${filter}▍`, inner)))
      }
      if (shown.length > 0) lines.push('')
      shown.forEach((option, index) => {
        const startRow = lines.length
        const active = index === cursor
        const marker = options.multiSelect
          ? (selected.has(index) ? '[x]' : '[ ]')
          : (active ? '›' : ' ')
        const label = `${marker} ${option.label}`
        lines.push(active ? theme.inverse(truncateToWidth(label, inner)) : truncateToWidth(label, inner))
        if (option.description !== undefined && option.description !== '') {
          lines.push(theme.muted(truncateToWidth(`    ${option.description}`, inner)))
        }
        optionRowRanges.push({ start: startRow, end: lines.length })
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
      return lines.map(line => fillLine(line, width))
    },
    invalidate(): void {
      // No cached geometry.
    },
    handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
      const shown = visibleOptions()
      if (shown.length === 0) return undefined
      if (event.type === 'wheel' && event.wheelDelta) {
        const delta = event.wheelDelta < 0 ? -1 : 1
        const previous = cursor
        cursor = Math.max(0, Math.min(shown.length - 1, cursor + delta))
        return { handled: true, render: cursor !== previous }
      }
      if (event.button !== 'left') return undefined

      // Find which option was targeted
      const targetIndex = optionRowRanges.findIndex(
        range => event.y >= range.start && event.y < range.end
      )

      if (event.type === 'move') {
        if (targetIndex >= 0 && targetIndex !== cursor) {
          cursor = targetIndex
          return { handled: true, render: true }
        }
        return undefined
      }

      if (event.type === 'press') {
        if (targetIndex >= 0) {
          cursor = targetIndex
          return { handled: true, focus: true, render: true }
        }
        return undefined
      }

      if (event.type === 'click') {
        if (targetIndex >= 0) {
          cursor = targetIndex
          if (options.multiSelect) {
            if (selected.has(targetIndex)) selected.delete(targetIndex)
            else selected.add(targetIndex)
            return { handled: true, render: true }
          }
          confirm()
          return { handled: true, render: true }
        }
        return undefined
      }

      return undefined
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
      if (matchesKey(data, 'up') || (options.allowCustom && data === 'k')) {
        cursor = Math.max(0, cursor - 1)
        return
      }
      if (matchesKey(data, 'down') || (options.allowCustom && data === 'j')) {
        cursor = Math.min(Math.max(0, visibleOptions().length - 1), cursor + 1)
        return
      }
      if (!options.allowCustom) {
        if (matchesKey(data, 'backspace')) {
          if (filter !== '') {
            filter = filter.slice(0, -1)
            cursor = 0
          }
          return
        }
        if (data.length === 1 && data > ' ') {
          filter += data
          cursor = 0
          return
        }
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
    },
  }
}
