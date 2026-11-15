/**
 * ZeroCage Cyberpunk / Minimal Theme:
 * - Accent: Crimson Neon Red (#FF3355)
 * - Text Strong: High-contrast pure/bright white (#FDFDFD)
 * - Text Emphasis: Light silver white (#E0E0E0)
 * - Text Base: Clean silver grey (#B0B0B0)
 * - Text Muted: Neutral steel grey (#787878)
 * - Text Faint: Deep muted steel (#4A4A4A)
 * - Border / Line: Subtle dark charcoal hairline (#2A2A2A)
 * - Border Strong: Distinguishable charcoal (#3F3F3F)
 *
 * Clean terminal surfaces: NO ugly background fills, pure dark terminal native contrast.
 * @module @deepseek-ai/dsh-tui-kit/theme
 */

import { visibleWidth } from '@deepseek-ai/pi-tui'
import type { ColorDepth } from './types.ts'

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

const PALETTE = {
  // Brand Crimson / Coral Red
  accent: { r: 255, g: 51, b: 85 }, // #FF3355
  accentGlow: { r: 255, g: 85, b: 110 }, // #FF556E

  // High-contrast monochromatic scale
  textStrong: { r: 253, g: 253, b: 253 }, // #FDFDFD 皓白 (Step 11)
  textEmphasis: { r: 224, g: 224, b: 224 }, // #E0E0E0 (Step 10)
  textBase: { r: 176, g: 176, b: 176 }, // #B0B0B0 (Step 9)
  textMuted: { r: 120, g: 120, b: 120 }, // #787878 (Step 8)
  textFaint: { r: 74, g: 74, b: 74 }, // #4A4A4A (Step 7)
  border: { r: 42, g: 42, b: 42 }, // #2A2A2A Hairline
  borderStrong: { r: 65, g: 65, b: 65 }, // #414141

  // Status highlights
  ok: { r: 74, g: 222, b: 128 }, // #4ADE80
  warn: { r: 251, g: 191, b: 36 }, // #FBBF24
  error: { r: 248, g: 113, b: 113 }, // #F87171
  link: { r: 255, g: 85, b: 110 }, // Match Crimson theme
} as const

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

export interface Theme {
  readonly depth: ColorDepth
  readonly bold: (text: string) => string
  readonly dim: (text: string) => string
  readonly italic: (text: string) => string
  readonly underline: (text: string) => string
  readonly inverse: (text: string) => string
  readonly fg: (color: Rgb, text: string) => string
  readonly bg: (color: Rgb, text: string) => string
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
  readonly faint: (text: string) => string
  readonly border: (text: string) => string
  readonly bar: (text: string) => string
  readonly link: (text: string) => string
  readonly strong: (text: string) => string
  readonly panel: (text: string, width: number) => string
}

function style16(code: number, text: string, depth: ColorDepth): string {
  if (depth === 'none' || text === '') return text
  return `\x1b[${String(code)}m${text}${RESET}`
}

function toAnsi256(color: Rgb): number {
  const level = (value: number): number => {
    if (value < 48) return 0
    if (value < 115) return 1
    return Math.min(5, Math.round((value - 35) / 40))
  }
  return 16 + 36 * level(color.r) + 6 * level(color.g) + level(color.b)
}

export function createTheme(depth: ColorDepth): Theme {
  const wrap = (open: string, text: string): string => (depth === 'none' || text === '' ? text : `${open}${text}${RESET}`)
  const fg = (color: Rgb, text: string): string => {
    switch (depth) {
      case 'truecolor':
        return wrap(`\x1b[38;2;${String(color.r)};${String(color.g)};${String(color.b)}m`, text)
      case 'ansi256':
        return wrap(`\x1b[38;5;${String(toAnsi256(color))}m`, text)
      case 'ansi16': {
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
  const role = (color: Rgb, brightCode: number) => (text: string): string => (
    depth === 'ansi16' ? style16(brightCode, text, depth) : fg(color, text)
  )

  return {
    depth,
    bold: named(1),
    dim: named(2),
    italic: named(3),
    underline: named(4),
    inverse: named(7),
    fg,
    bg,
    // Accent is ZeroCage Crimson Red (16-color: code 91 bright red)
    accent: (text: string) => (depth === 'ansi16' ? style16(91, text, depth) : fg(PALETTE.accent, text)),
    user: (text: string) => (depth === 'ansi16' ? style16(97, text, depth) : fg(PALETTE.textStrong, text)),
    assistant: (text: string) => (depth === 'ansi16' ? style16(37, text, depth) : fg(PALETTE.textBase, text)),
    reasoning: (text: string) => (depth === 'ansi16' ? style16(90, text, depth) : fg(PALETTE.textFaint, text)),
    tool: (text: string) => (depth === 'ansi16' ? style16(97, text, depth) : fg(PALETTE.textEmphasis, text)),
    ok: role(PALETTE.ok, 92),
    warn: role(PALETTE.warn, 93),
    error: role(PALETTE.error, 91),
    diffAdd: role(PALETTE.ok, 92),
    diffDel: role(PALETTE.error, 91),
    diffHunk: role(PALETTE.link, 95),
    muted: (text: string) => (depth === 'ansi16' ? style16(90, text, depth) : fg(PALETTE.textMuted, text)),
    faint: (text: string) => (depth === 'ansi16' ? style16(90, text, depth) : fg(PALETTE.textFaint, text)),
    border: (text: string) => (depth === 'ansi16' ? style16(90, text, depth) : fg(PALETTE.borderStrong, text)),
    bar: (text: string) => (depth === 'ansi16' ? style16(91, text, depth) : fg(PALETTE.accent, text)),
    link: role(PALETTE.link, 91),
    strong: (text: string) => (depth === 'ansi16' ? style16(97, text, depth) : fg(PALETTE.textStrong, text)),
    // Transparent / clean panel: no background color fill, preserving terminal natural background
    panel: (text: string, width: number) => {
      const used = visibleWidth(text)
      return used < width ? text + ' '.repeat(width - used) : text
    },
  }
}
