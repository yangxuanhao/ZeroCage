import { describe, expect, it } from 'vitest'
import { createTheme, detectColorDepth } from '../src/theme.ts'
import { contextPercent, formatCount } from '../src/status-bar.ts'
import type { TuiViewState } from '../src/types.ts'

/** A state with the fields these helpers read. */
function stateWith(used: number, window: number): TuiViewState {
  return {
    sessionId: 's',
    title: '',
    model: 'm',
    cwd: 'c',
    status: 'idle',
    blocks: [],
    queued: [],
    tokens: { input: 0, output: 0, contextUsed: used, contextWindow: window },
    currentTool: undefined,
    lastError: undefined,
    hint: undefined,
  }
}

describe('detectColorDepth', () => {
  it('turns color off without a terminal, for NO_COLOR, and for dumb terminals', () => {
    expect(detectColorDepth({}, false)).toBe('none')
    expect(detectColorDepth({ NO_COLOR: '1' }, true)).toBe('none')
    expect(detectColorDepth({ TERM: 'dumb' }, true)).toBe('none')
    expect(detectColorDepth({ FORCE_COLOR: '0' }, true)).toBe('none')
  })

  it('selects truecolor, 256-color, and the 16-color fallback', () => {
    expect(detectColorDepth({ COLORTERM: 'truecolor' }, true)).toBe('truecolor')
    expect(detectColorDepth({ FORCE_COLOR: '2' }, true)).toBe('ansi256')
    expect(detectColorDepth({ TERM: 'xterm-256color' }, true)).toBe('ansi256')
    expect(detectColorDepth({ TERM: 'xterm' }, true)).toBe('ansi16')
  })
})

describe('createTheme', () => {
  it('emits no escapes at depth none', () => {
    const theme = createTheme('none')
    expect(theme.bold('x')).toBe('x')
    expect(theme.fg({ r: 1, g: 2, b: 3 }, 'x')).toBe('x')
    expect(theme.diffAdd('+ a')).toBe('+ a')
  })

  it('degrades a truecolor request to the 256-color cube', () => {
    const theme = createTheme('ansi256')
    const painted = theme.fg({ r: 0, g: 175, b: 255 }, 'x')
    expect(painted.startsWith('\x1b[38;5;')).toBe(true)
    expect(painted.endsWith('\x1b[0m')).toBe(true)
  })

  it('keeps the text when there is nothing to color', () => {
    const theme = createTheme('truecolor')
    expect(theme.accent('')).toBe('')
  })
})

describe('status helpers', () => {
  it('formats counts compactly', () => {
    expect(formatCount(999)).toBe('999')
    expect(formatCount(1234)).toBe('1.2k')
    expect(formatCount(1_200_000)).toBe('1.2M')
    expect(formatCount(-5)).toBe('0')
  })

  it('computes a clamped context percentage', () => {
    expect(contextPercent(stateWith(50, 100))).toBe(50)
    expect(contextPercent(stateWith(500, 100))).toBe(100)
    expect(contextPercent(stateWith(5, 0))).toBe(0)
  })
})
