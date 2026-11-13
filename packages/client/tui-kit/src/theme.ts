/**
 * ANSI styling with an explicit degradation ladder: truecolor → 256 colors →
 * 16 colors → no escapes. The kit never emits a color the terminal cannot show,
 * so a monochrome or `TERM=dumb` terminal stays readable instead of printing
 * escape noise.
 * @module @deepseek-ai/dsh-tui-kit/theme
 */

import type { ColorDepth } from './types.ts'

/** RGB triple in 0-255 range. */
export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

/**
 * Decide the color depth from the environment the process was launched in.
 * @param env - process environment (`NO_COLOR`, `FORCE_COLOR`, `TERM`, `COLORTERM`).
 * @param isTty - whether stdout is a terminal.
 * @returns the richest tier the terminal advertises.
 */
export function detectColorDepth(env: NodeJS.ProcessEnv, isTty: boolean): ColorDepth {
  if (!isTty) return 'none'
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none'
  const forced = env.FORCE_COLOR
  if (forced === '0' || forced === 'false') return 'none'
  const term = env.TERM ?? ''
  if (term === 'dumb') return 'none'
  if (forced === '3' || env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit') return 'truecolor'
  if (forced === '2' || term.includes('256')) return 'ansi256'
  return 'ansi16'
}

const RESET = '\x1b[0m'

/** Style functions the renderer applies to already-plain text. */
export interface Theme {
  readonly depth: ColorDepth
  readonly bold: (text: string) => string
  readonly dim: (text: string) => string
  readonly italic: (text: string) => string
  readonly underline: (text: string) => string
  readonly inverse: (text: string) => string
  readonly fg: (color: Rgb, text: string) => string
  readonly bg: (color: Rgb, text: string) => string
  /** Palette roles, so views name intent rather than a hex value. */
  readonly accent: (text: string) => string
  readonly user: (text: string) => string
  readonly assistant: (text: string) => string
  readonly reasoning: (text: string) => string
  readonly tool: (text: string) => string
  readonly ok: (text: string) => string
  readonly warn: (text: string) => string
  readonly error: (text: string) => string
  readonly diffAdd: (text: string) => string
  readonly diffDel: (text: string) => string
  readonly diffHunk: (text: string) => string
  readonly muted: (text: string) => string
}

/** The 16-color approximation used by `ansi16` and as the 256-color fallback. */
function style16(code: number, text: string, depth: ColorDepth): string {
  if (depth === 'none' || text === '') return text
  return `\x1b[${String(code)}m${text}${RESET}`
}

/** Map an RGB triple onto the closest xterm-256 cube entry. */
function toAnsi256(color: Rgb): number {
  const level = (value: number): number => {
    if (value < 48) return 0
    if (value < 115) return 1
    return Math.min(5, Math.round((value - 35) / 40))
  }
  return 16 + 36 * level(color.r) + 6 * level(color.g) + level(color.b)
}

/**
 * Build the theme for one depth.
 * @param depth - capability tier from {@link detectColorDepth} or configuration.
 * @returns style functions that all degrade to identity at `none`.
 */
export function createTheme(depth: ColorDepth): Theme {
  const wrap = (open: string, text: string): string => (depth === 'none' || text === '' ? text : `${open}${text}${RESET}`)
  const fg = (color: Rgb, text: string): string => {
    switch (depth) {
      case 'truecolor':
        return wrap(`\x1b[38;2;${String(color.r)};${String(color.g)};${String(color.b)}m`, text)
      case 'ansi256':
        return wrap(`\x1b[38;5;${String(toAnsi256(color))}m`, text)
      case 'ansi16': {
        // Bright shades keep the palette's intent visible on 16-color terminals.
        const bright = (color.r + color.g + color.b) / 3 > 127 ? 97 : 37
        return style16(bright, text, depth)
      }
      case 'none':
        return text
    }
  }
  const bg = (color: Rgb, text: string): string => {
    switch (depth) {
      case 'truecolor':
        return wrap(`\x1b[48;2;${String(color.r)};${String(color.g)};${String(color.b)}m`, text)
      case 'ansi256':
        return wrap(`\x1b[48;5;${String(toAnsi256(color))}m`, text)
      case 'ansi16':
        return style16(40, text, depth)
      case 'none':
        return text
    }
  }
  const named = (code: number) => (text: string): string => style16(code, text, depth)
  return {
    depth,
    bold: named(1),
    dim: named(2),
    italic: named(3),
    underline: named(4),
    inverse: named(7),
    fg,
    bg,
    accent: (text: string) => fg({ r: 0, g: 175, b: 255 }, text),
    user: named(36),
    assistant: named(37),
    reasoning: named(90),
    tool: named(35),
    ok: named(32),
    warn: named(33),
    error: named(31),
    diffAdd: named(32),
    diffDel: named(31),
    diffHunk: named(36),
    muted: named(90),
  }
}
