/**
 * The transcript document: turns the host's view state into terminal lines.
 * It is a plain pi-tui `Component`, so the kit's layout can scroll it without
 * the document knowing anything about sessions, tools, or the agent loop.
 * @module @deepseek-ai/dsh-tui-kit/transcript
 */

import type { Component } from '@deepseek-ai/pi-tui'
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@deepseek-ai/pi-tui'
import type { Theme } from './theme.ts'
import type { DiffLine, TuiViewState, ViewBlock } from './types.ts'

/** Where the transcript indents block bodies, in columns. */
const BODY_INDENT = 2

/** How many lines of a tool result stay visible before the rest is summarized. */
const TOOL_OUTPUT_PREVIEW_LINES = 6

/** How many argument characters stay on the tool header. */
const TOOL_ARGUMENT_PREVIEW_COLUMNS = 96

/** Options for {@link createTranscript}. */
export interface TranscriptOptions {
  /** Snapshot reader, called once per render. */
  readonly getState: () => TuiViewState
  /** Styles for every line. */
  readonly theme: Theme
  /**
   * Render only settled blocks: a streaming answer and a running tool call stay
   * hidden until they finish. An append-only sink (the plain log) cannot rewrite
   * a half sentence, so it waits instead of printing a state it cannot correct.
   */
  readonly settleOnly?: boolean
}

/** Render one diff line with its marker column. */
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

/** Indent and wrap one block body, preserving existing newlines. */
function bodyLines(text: string, width: number, style: (text: string) => string): string[] {
  const inner = Math.max(8, width - BODY_INDENT)
  const lines: string[] = []
  for (const raw of text.split('\n')) {
    if (raw === '') {
      lines.push('')
      continue
    }
    for (const wrapped of wrapTextWithAnsi(raw, inner)) lines.push(' '.repeat(BODY_INDENT) + style(wrapped))
  }
  return lines
}

/** Keep the tail of a long tool result, which is where the verdict usually is. */
function previewOutput(output: string, width: number, theme: Theme): string[] {
  const all = output.split('\n')
  const kept = all.length <= TOOL_OUTPUT_PREVIEW_LINES ? all : all.slice(all.length - TOOL_OUTPUT_PREVIEW_LINES)
  const lines = bodyLines(kept.join('\n'), width, text => text)
  if (all.length > kept.length) {
    const omitted = all.length - kept.length
    lines.unshift(theme.muted(truncateToWidth(`  ... ${String(omitted)} earlier ${omitted === 1 ? 'line' : 'lines'}`, width)))
  }
  return lines
}

/** Render one tool call: header, optional diff, optional result tail. */
function renderTool(block: Extract<ViewBlock, { kind: 'tool' }>, width: number, theme: Theme): string[] {
  const glyph = block.status === 'running' ? '◐' : block.status === 'ok' ? '●' : '✕'
  const coloredGlyph = block.status === 'running'
    ? theme.warn(glyph)
    : block.status === 'ok' ? theme.ok(glyph) : theme.error(glyph)
  const args = block.args === '' ? '' : ` ${theme.muted(truncateToWidth(block.args, TOOL_ARGUMENT_PREVIEW_COLUMNS, '...'))}`
  const lines = [`${coloredGlyph} ${theme.tool(theme.bold(block.name))}${args}`]
  if (block.diff.length > 0) {
    for (const line of block.diff) lines.push('  ' + renderDiffLine(line, Math.max(8, width - 2), theme))
  }
  if (block.output !== '' && block.status !== 'running') {
    lines.push(...previewOutput(block.output, width, theme))
  }
  return lines
}

/** Render one block at a column width. */
function renderBlock(block: ViewBlock, width: number, theme: Theme, settleOnly: boolean): string[] {
  switch (block.kind) {
    case 'user': {
      const header = theme.user(theme.bold('> you'))
      return [header, ...bodyLines(block.text, width, text => theme.user(text))]
    }
    case 'assistant': {
      const empty = block.text === '' && block.reasoning === ''
      if (empty && !block.streaming) return []
      if (settleOnly && block.streaming) return []
      const header = theme.assistant(theme.bold('● zero'))
      const lines = [header, ...bodyLines(block.text, width, text => text)]
      if (block.reasoning !== '') {
        lines.push(theme.muted(truncateToWidth(`  ~ ${block.reasoning.split('\n').join(' ')}`, width)))
      }
      if (block.streaming) lines.push(theme.accent('▍'))
      return lines
    }
    case 'tool': {
      if (settleOnly && block.status === 'running') return []
      return renderTool(block, width, theme)
    }
    case 'notice':
      return bodyLines(block.text, width, text => (block.level === 'error'
        ? theme.error(text)
        : block.level === 'warn' ? theme.warn(text) : theme.muted(text)))
  }
}

/**
 * Build the transcript component.
 * @param options - state reader, theme, and the settled-block switch.
 * @returns the pi-tui component for the scroll region.
 */
export function createTranscript(options: TranscriptOptions): Component {
  let cachedKey: TuiViewState | undefined
  let cachedWidth = -1
  let cachedLines: string[] = []
  return {
    render(width: number): string[] {
      const state = options.getState()
      if (state === cachedKey && width === cachedWidth) return cachedLines
      const lines: string[] = []
      for (const block of state.blocks) {
        const rendered = renderBlock(block, Math.max(20, width), options.theme, options.settleOnly === true)
        if (rendered.length > 0 && lines.length > 0) lines.push('')
        lines.push(...rendered)
      }
      // A stray over-long line would wrap the whole frame; clip it instead.
      cachedLines = lines.map(line => (visibleWidth(line) > width ? truncateToWidth(line, width, '...') : line))
      cachedKey = state
      cachedWidth = width
      return cachedLines
    },
    invalidate(): void {
      cachedKey = undefined
      cachedLines = []
      cachedWidth = -1
    },
  }
}
