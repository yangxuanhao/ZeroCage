/**
 * The transcript document: turns the host's view state into terminal lines.
 * ZeroCage Cyberpunk Minimalist:
 * - High-contrast splash screen with distinctive block wordmark (Crimson + White)
 * - Clean gutter bar (accent color)
 * - Refined spacing and typography
 * @module @deepseek-ai/dsh-tui-kit/transcript
 */

import type { Component } from '@deepseek-ai/pi-tui'
import { Markdown, truncateToWidth, visibleWidth, wrapTextWithAnsi, type MarkdownTheme } from '@deepseek-ai/pi-tui'
import type { Theme } from './theme.ts'
import type { DiffLine, HittableTranscript, TuiViewState, ViewBlock } from './types.ts'

const BODY_INDENT = 2
const TOOL_OUTPUT_PREVIEW_LINES = 10

export interface TranscriptOptions {
  readonly getState: () => TuiViewState
  readonly theme: Theme
  readonly settleOnly?: boolean
  readonly omitAssistant?: boolean
}

function renderDiffLine(line: DiffLine, width: number, theme: Theme): string {
  switch (line.kind) {
    case 'add':
      return theme.diffAdd(truncateToWidth(`+ ${line.text}`, width))
    case 'del':
      return theme.diffDel(truncateToWidth(`- ${line.text}`, width))
    case 'hunk':
      return theme.diffHunk(truncateToWidth(`@ ${line.text}`, width))
    case 'context':
      return theme.muted(truncateToWidth(`  ${line.text}`, width))
  }
}

/**
 * Clean block shadow wordmark for ZeroCage (66 columns wide):
 * Left half: ZERO (Crimson Red)
 * Right half: CAGE (Bright White)
 */
const ZEROCAGE_LOGO = [
  '███████╗███████╗██████╗  ██████╗  ██████╗ █████╗  ██████╗ ███████╗',
  '╚══███╔╝██╔════╝██╔══██╗██╔═══██╗██╔════╝██╔══██╗██╔════╝ ██╔════╝',
  '  ███╔╝ █████╗  ██████╔╝██║   ██║██║     ███████║██║  ███╗█████╗  ',
  ' ███╔╝  ██╔══╝  ██╔══██╗██║   ██║██║     ██╔══██║██║   ██║██╔══╝  ',
  '███████╗███████╗██║  ██║╚██████╔╝╚██████╗██║  ██║╚██████╔╝███████╗',
  '╚══════╝╚══════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝',
]

function renderWordmark(width: number, theme: Theme): string[] {
  const lines: string[] = []
  const logoWidth = 66
  if (width < logoWidth) {
    // Narrow terminal fallback
    const smallLogo = 'ZERO · CAGE'
    const pad = Math.max(0, Math.floor((width - visibleWidth(smallLogo)) / 2))
    return [' '.repeat(pad) + theme.accent(theme.bold('ZERO')) + theme.faint(' · ') + theme.strong(theme.bold('CAGE'))]
  }
  const leftPad = Math.max(0, Math.floor((width - logoWidth) / 2))
  const padStr = ' '.repeat(leftPad)

  for (const row of ZEROCAGE_LOGO) {
    // Cut row into ZERO (first 32 chars) and CAGE (remaining 34 chars)
    const zeroPart = row.slice(0, 32)
    const cagePart = row.slice(32)
    lines.push(padStr + theme.accent(theme.bold(zeroPart)) + theme.strong(theme.bold(cagePart)))
  }
  return lines
}

function renderSplash(width: number, theme: Theme): string[] {
  const lines: string[] = ['', '', '']
  lines.push(...renderWordmark(width, theme))
  lines.push('', '')

  const center = (text: string, styled: string): string =>
    ' '.repeat(Math.max(0, Math.floor((width - visibleWidth(text)) / 2))) + styled

  const tagline = 'AUTONOMOUS ENGINEERING AGENT'
  lines.push(center(tagline, theme.faint('· ') + theme.muted(theme.bold(tagline)) + theme.faint(' ·')))
  lines.push('')

  const tip = 'Type a task to start  ·  / for commands  ·  @ to reference files'
  const styledTip = `${theme.assistant('Type a task to start')}${theme.faint('  ·  ')}${theme.accent('/')} ${theme.muted('for commands')}${theme.faint('  ·  ')}${theme.accent('@')} ${theme.muted('to reference files')}`
  lines.push(center(tip, styledTip))
  lines.push('')
  return lines
}

function bodyLines(
  text: string,
  width: number,
  style: (text: string) => string,
  prefix?: string,
): string[] {
  const inner = Math.max(8, width - BODY_INDENT)
  const lines: string[] = []
  let first = true
  for (const raw of text.split('\n')) {
    if (raw === '') {
      lines.push('')
      continue
    }
    for (const wrapped of wrapTextWithAnsi(raw, inner)) {
      const lead = first && prefix !== undefined ? prefix : ' '.repeat(BODY_INDENT)
      lines.push(lead + style(wrapped))
      first = false
    }
  }
  return lines
}

function previewOutput(output: string, width: number, theme: Theme): string[] {
  const all = output
    .replaceAll('\r', '')
    .split('\n')
    .map(line => line.trimEnd())
  while (all.length > 0 && all[all.length - 1] === '') all.pop()
  const compact = all.filter((line, index) => line !== '' || all[index - 1] !== '')
  const kept = compact.length <= TOOL_OUTPUT_PREVIEW_LINES ? compact : compact.slice(compact.length - TOOL_OUTPUT_PREVIEW_LINES)
  const lines = bodyLines(kept.join('\n'), width - 2, text => theme.muted(`│ ${text}`))
  if (compact.length > kept.length) {
    const omitted = compact.length - kept.length
    lines.unshift(theme.muted(truncateToWidth(`  │ … ${String(omitted)} earlier ${omitted === 1 ? 'line' : 'lines'}`, width)))
  }
  return lines
}

function markdownTheme(theme: Theme): MarkdownTheme {
  return {
    heading: (text: string) => theme.bold(theme.strong(text)),
    link: (text: string) => theme.underline(theme.accent(text)),
    linkUrl: (text: string) => theme.muted(text),
    code: (text: string) => theme.tool(text),
    codeBlock: (text: string) => text,
    codeBlockBorder: (text: string) => theme.border(text),
    quote: (text: string) => theme.muted(text),
    quoteBorder: (text: string) => theme.accent(text),
    hr: (text: string) => theme.border(text),
    listBullet: (text: string) => theme.accent(text),
    bold: (text: string) => theme.bold(text),
    italic: (text: string) => theme.italic(text),
    strikethrough: (text: string) => theme.dim(text),
    underline: (text: string) => theme.underline(text),
  }
}

function markdownLines(
  text: string,
  width: number,
  cache: Map<string, Markdown>,
  id: string,
  theme: Theme,
): string[] {
  const inner = Math.max(20, width - BODY_INDENT)
  let renderer = cache.get(id)
  if (renderer === undefined) {
    renderer = new Markdown('', 0, 0, markdownTheme(theme))
    cache.set(id, renderer)
  }
  renderer.setText(text)
  return renderer.render(inner).map(line => ' '.repeat(BODY_INDENT) + line)
}

function summarizeArguments(args: string, name: string): string {
  if (args.trim() === '') return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(args)
  } catch {
    void name
    return args
  }
  if (typeof parsed !== 'object' || parsed === null) return args
  const fields = parsed as Record<string, unknown>
  const description = fields['description']
  if (typeof description === 'string' && description.trim() !== '') return description.trim()
  for (const key of ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'prompt']) {
    const value = fields[key]
    if (typeof value === 'string' && value.trim() !== '') return value.trim().replaceAll('\n', ' ⏎ ')
  }
  return args
}

const BAR = '┃'

function renderTool(
  block: Extract<ViewBlock, { kind: 'tool' }>,
  width: number,
  theme: Theme,
  expanded: boolean,
): string[] {
  const glyph = block.status === 'running' ? '◐' : block.status === 'ok' ? '✓' : '✗'
  const coloredGlyph = block.status === 'running'
    ? theme.warn(glyph)
    : block.status === 'ok' ? theme.ok(glyph) : theme.error(glyph)
  const summary = summarizeArguments(block.args, block.name)
  const expandable = block.status !== 'running' && (block.diff.length > 0 || block.output !== '')
  const twisty = expandable ? theme.faint(expanded ? ' ▾' : ' ▸') : ''
  const head = summary === '' ? '' : `  ${theme.faint(truncateToWidth(summary, Math.max(8, width - visibleWidth(block.name) - 8), '…'))}`
  const lines = [`${theme.bar(BAR)} ${theme.tool(theme.bold(block.name))}${head} ${coloredGlyph}${twisty}`.trimEnd()]
  if (expanded && block.args !== '') {
    lines.push(...bodyLines(block.args, width, text => theme.faint(`${BAR} ${text}`)))
  }
  if (expandable && !expanded) return lines
  if (block.diff.length > 0) {
    for (const line of block.diff) lines.push('  ' + renderDiffLine(line, Math.max(8, width - 2), theme))
  }
  if (block.output !== '' && block.status !== 'running') {
    lines.push(...previewOutput(block.output, width, theme))
  }
  return lines
}

function renderBlock(
  block: ViewBlock,
  width: number,
  theme: Theme,
  settleOnly: boolean,
  markdown: Map<string, Markdown>,
  expanded: boolean,
): string[] {
  switch (block.kind) {
    case 'user': {
      return bodyLines(block.text, width, text => theme.user(text), theme.accent('❯ '))
    }
    case 'assistant': {
      const empty = block.text === '' && block.reasoning === ''
      if (empty && !block.streaming) return []
      if (settleOnly && block.streaming) return []
      const lines: string[] = []
      if (block.reasoning !== '') {
        const open = expanded || block.streaming
        if (open) {
          lines.push(...bodyLines(block.reasoning, width, text => theme.reasoning(`${BAR} ${text}`)))
        } else {
          const size = block.reasoning.length
          lines.push(theme.reasoning(truncateToWidth(`${BAR} thinking · ${String(size)} chars`, width)))
        }
      }
      if (block.text !== '') {
        lines.push(...markdownLines(block.text, width, markdown, block.id, theme))
      }
      if (block.streaming) lines.push(theme.accent('▌'))
      return lines
    }
    case 'tool': {
      if (settleOnly && block.status === 'running') return []
      return renderTool(block, width, theme, expanded)
    }
    case 'notice':
      return bodyLines(block.text, width, text => (block.level === 'error'
        ? theme.error(text)
        : block.level === 'warn' ? theme.warn(text) : theme.muted(text)))
  }
}

export function createTranscript(options: TranscriptOptions): Component & HittableTranscript {
  let cachedKey: TuiViewState | undefined
  let cachedWidth = -1
  let cachedLines: string[] = []
  let rowOwners: string[] = []
  const markdown = new Map<string, Markdown>()

  return {
    render(width: number): string[] {
      const state = options.getState()
      if (state === cachedKey && width === cachedWidth) return cachedLines
      if (state.blocks.length === 0) {
        cachedLines = renderSplash(width, options.theme)
        rowOwners = cachedLines.map(() => '')
        cachedKey = state
        cachedWidth = width
        return cachedLines
      }
      const lines: string[] = []
      const owners: string[] = []
      const expanded = new Set(state.expandedIds)
      for (const block of state.blocks) {
        if (options.omitAssistant === true && block.kind === 'assistant') continue
        const rendered = renderBlock(
          block,
          Math.max(20, width),
          options.theme,
          options.settleOnly === true,
          markdown,
          expanded.has(block.id),
        )
        if (rendered.length === 0) continue
        if (lines.length > 0) {
          lines.push('')
          owners.push('')
        }
        lines.push(...rendered)
        for (const _line of rendered) owners.push(block.id)
      }
      cachedLines = lines.map(line => (visibleWidth(line) > width ? truncateToWidth(line, width, '...') : line))
      rowOwners = owners
      cachedKey = state
      cachedWidth = width
      return cachedLines
    },
    blockAtRow(row: number): string | undefined {
      const id = rowOwners[row]
      return id === undefined || id === '' ? undefined : id
    },
    invalidate(): void {
      cachedKey = undefined
      cachedLines = []
      cachedWidth = -1
      rowOwners = []
      for (const renderer of markdown.values()) renderer.invalidate()
    },
  }
}
