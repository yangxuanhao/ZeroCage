/**
 * Reconstruct a compact diff for a tool call from what the durable log carries:
 * either the edit arguments (`old_string`/`new_string`) or a unified diff the
 * tool echoed in its result. The kit renders these lines; it never re-reads the
 * filesystem, so a card shows exactly what the log recorded.
 * @module @deepseek-ai/dsh-tui-host/diff
 */

import type { DiffLine } from '@deepseek-ai/dsh-tui-kit'

/** How many diff lines a card keeps before summarizing the rest. */
const MAX_DIFF_LINES = 120

/** A whole-file write is not a reviewable diff; keep a readable prefix. */
const MAX_WRITE_LINES = 40

/** Tool names whose arguments carry an exact old/new text pair. */
const EDIT_TOOL_NAMES = new Set(['edit', 'write', 'str_replace_editor', 'apply_patch'])

/** Read a string field from parsed JSON without asserting its type. */
function stringField(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const field = Reflect.get(value, key)
  return typeof field === 'string' ? field : undefined
}

/** Trim the diff to the card's budget, marking the cut. */
function cap(lines: readonly DiffLine[]): readonly DiffLine[] {
  if (lines.length <= MAX_DIFF_LINES) return lines
  return [...lines.slice(0, MAX_DIFF_LINES), { kind: 'hunk', text: `… ${String(lines.length - MAX_DIFF_LINES)} more diff lines` }]
}

/** Split one text block into lines, dropping a trailing empty line. */
function splitLines(text: string): string[] {
  const lines = text.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

/**
 * Build a diff from an edit tool's arguments.
 * @param toolName - the tool the model called.
 * @param argsJson - the raw JSON argument string from the log.
 * @returns diff lines, or an empty list when this tool carries no text pair.
 */
export function diffFromArguments(toolName: string, argsJson: string): readonly DiffLine[] {
  if (!EDIT_TOOL_NAMES.has(toolName)) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(argsJson)
  } catch (error) {
    // A streamed call can be truncated; the argument text still renders as-is.
    void (error instanceof Error ? error.message : String(error))
    return []
  }
  const replaced = stringField(parsed, 'old_string')
  const inserted = stringField(parsed, 'new_string')
  const whole = stringField(parsed, 'content')
  const lines: DiffLine[] = []
  if (replaced !== undefined && inserted !== undefined) {
    for (const line of splitLines(replaced)) lines.push({ kind: 'del', text: line })
    for (const line of splitLines(inserted)) lines.push({ kind: 'add', text: line })
    return cap(lines)
  }
  if (whole !== undefined) {
    const written = splitLines(whole)
    const kept = written.slice(0, MAX_WRITE_LINES)
    const rendered: DiffLine[] = kept.map(line => ({ kind: 'add' as const, text: line }))
    if (written.length > kept.length) {
      rendered.push({ kind: 'hunk', text: `… ${String(written.length - kept.length)} more lines written` })
    }
    return rendered
  }
  return cap(lines)
}

/**
 * Build a diff from a unified diff echoed in a tool result. Ordinary output that
 * merely mentions `@@` or `+++` (log lines, docs) carries no hunk, so a hunk line
 * plus at least one change line is required before anything is coloured.
 * @param output - the tool result text.
 * @returns diff lines, or an empty list when the text carries no diff hunks.
 */
export function diffFromOutput(output: string): readonly DiffLine[] {
  const lines = output.split('\n')
  if (!lines.some(line => line.startsWith('@@'))) return []
  const parsed: DiffLine[] = []
  let seenHunk = false
  let changes = 0
  for (const line of lines) {
    if (line.startsWith('@@ ')) {
      seenHunk = true
      parsed.push({ kind: 'hunk', text: line })
      continue
    }
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (!seenHunk) continue
    if (line.startsWith('+')) {
      changes++
      parsed.push({ kind: 'add', text: line.slice(1) })
    } else if (line.startsWith('-')) {
      changes++
      parsed.push({ kind: 'del', text: line.slice(1) })
    } else if (line.startsWith(' ') || line === '') {
      parsed.push({ kind: 'context', text: line.slice(1) })
    }
  }
  return changes === 0 ? [] : cap(parsed)
}

/**
 * Pick the richest diff available for one finished tool call.
 * @param toolName - the called tool.
 * @param argsJson - raw arguments from `tool/call`.
 * @param output - rendered result text.
 * @returns diff lines for the card.
 */
export function resolveDiff(toolName: string, argsJson: string, output: string): readonly DiffLine[] {
  const fromArgs = diffFromArguments(toolName, argsJson)
  if (fromArgs.length > 0) return fromArgs
  return diffFromOutput(output)
}
