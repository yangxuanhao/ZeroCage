import { describe, expect, it } from 'vitest'
import { createTranscript } from '../src/transcript.ts'
import { createTheme } from '../src/theme.ts'
import type { TuiViewState, ViewBlock } from '../src/types.ts'

/** Build a state around the given blocks. */
function stateOf(blocks: readonly ViewBlock[]): TuiViewState {
  return {
    sessionId: 's',
    title: '',
    model: 'deepseek-official/deepseek-flash',
    cwd: 'C:\\work',
    status: 'idle',
    blocks,
    queued: [],
    tokens: { input: 0, output: 0, contextUsed: 0, contextWindow: 0 },
    currentTool: undefined,
    lastError: undefined,
    hint: undefined,
  }
}

/** Render a state to plain lines at the given width. */
function render(blocks: readonly ViewBlock[], width = 80, settleOnly = false): string[] {
  const state = stateOf(blocks)
  return createTranscript({ getState: () => state, theme: createTheme('none'), settleOnly }).render(width)
}

describe('createTranscript', () => {
  it('renders a user turn and a settled answer', () => {
    const lines = render([
      { kind: 'user', id: 'u1', turn: 1, text: 'hello there' },
      { kind: 'assistant', id: 'a1', turn: 1, text: 'hi', reasoning: '', streaming: false },
    ])
    expect(lines.join('\n')).toContain('> you')
    expect(lines.join('\n')).toContain('hello there')
    expect(lines.join('\n')).toContain('● zero')
    expect(lines.join('\n')).toContain('hi')
  })

  it('keeps a streaming answer out of an append-only sink', () => {
    const streaming: ViewBlock[] = [{ kind: 'assistant', id: 'a1', turn: 1, text: 'half', reasoning: '', streaming: true }]
    expect(render(streaming, 80, true)).toEqual([])
    expect(render(streaming).join('\n')).toContain('half')
  })

  it('hides an empty settled answer instead of printing a bare header', () => {
    const empty: ViewBlock[] = [{ kind: 'assistant', id: 'a1', turn: 1, text: '', reasoning: '', streaming: false }]
    expect(render(empty)).toEqual([])
  })

  it('renders a tool card with its diff and result tail', () => {
    const tool: ViewBlock[] = [{
      kind: 'tool',
      id: 't1',
      turn: 1,
      name: 'edit',
      args: '{"file_path":"a.ts"}',
      status: 'ok',
      output: 'line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8',
      diff: [{ kind: 'add', text: 'new line' }, { kind: 'del', text: 'old line' }],
    }]
    const text = render(tool).join('\n')
    expect(text).toContain('● edit')
    expect(text).toContain('+ new line')
    expect(text).toContain('- old line')
    expect(text).toContain('2 earlier lines')
    expect(text).toContain('line8')
    expect(text).not.toContain('line1')
  })

  it('marks a failed tool call and keeps its output', () => {
    const tool: ViewBlock[] = [{
      kind: 'tool',
      id: 't1',
      turn: 1,
      name: 'pwsh',
      args: '',
      status: 'error',
      output: 'command not found',
      diff: [],
    }]
    const text = render(tool).join('\n')
    expect(text).toContain('✕ pwsh')
    expect(text).toContain('command not found')
  })

  it('wraps and clips to the given width', () => {
    const long: ViewBlock[] = [{ kind: 'user', id: 'u1', turn: 1, text: 'x'.repeat(200) }]
    for (const line of render(long, 40)) expect(line.length).toBeLessThanOrEqual(40)
  })

  it('counts CJK text by display columns, not code units', () => {
    const cjk: ViewBlock[] = [{ kind: 'user', id: 'u1', turn: 1, text: '中文测试'.repeat(30) }]
    for (const line of render(cjk, 40)) expect([...line].length).toBeLessThanOrEqual(40)
  })

  it('separates blocks with a blank line and marks notices by level', () => {
    const lines = render([
      { kind: 'notice', id: 'n1', turn: 0, level: 'info', text: 'note one' },
      { kind: 'notice', id: 'n2', turn: 0, level: 'error', text: 'note two' },
    ])
    expect(lines).toEqual(['  note one', '', '  note two'])
  })

  it('caches by snapshot identity', () => {
    const state = stateOf([{ kind: 'user', id: 'u1', turn: 1, text: 'a' }])
    const transcript = createTranscript({ getState: () => state, theme: createTheme('none') })
    const first = transcript.render(80)
    expect(transcript.render(80)).toBe(first)
    expect(transcript.render(40)).not.toBe(first)
    transcript.invalidate()
    expect(transcript.render(80)).not.toBe(first)
  })
})
