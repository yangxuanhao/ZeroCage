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
    expandedIds: [],
  }
}

/** Render a state to plain lines at the given width. */
function render(blocks: readonly ViewBlock[], width = 80, settleOnly = false, expandedIds: readonly string[] = []): string[] {
  const state = { ...stateOf(blocks), expandedIds }
  return createTranscript({ getState: () => state, theme: createTheme('none'), settleOnly }).render(width)
}

describe('createTranscript', () => {
  it('renders a user turn and a settled answer', () => {
    const lines = render([
      { kind: 'user', id: 'u1', turn: 1, text: 'hello there' },
      { kind: 'assistant', id: 'a1', turn: 1, text: 'hi', reasoning: '', streaming: false },
    ])
    expect(lines.join('\n')).toContain('❯ hello there')
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

  it('drops the blank padding a command leaves at the end of its output', () => {
    const blocks: ViewBlock[] = [{
      kind: 'tool',
      id: 't11',
      turn: 1,
      name: 'pwsh',
      args: '{}',
      status: 'ok',
      output: 'a. zip  1024\r\nb. zip  2048\r\n\r\n\r\n\r\n\r\n',
      diff: [],
    }]
    const lines = render(blocks, 80, false, ['t11'])
    expect(lines.filter(line => line.trim() === '│').length).toBe(0)
    expect(lines[lines.length - 1]).toContain('b. zip')
  })

  it('collapses a settled tool card to its header and reopens on request', () => {
    const blocks: ViewBlock[] = [{
      kind: 'tool',
      id: 't9',
      turn: 1,
      name: 'pwsh',
      args: '{"command":"ls"}',
      status: 'ok',
      output: 'a\nb\nc',
      diff: [],
    }]
    const collapsed = render(blocks).join('\n')
    expect(collapsed).toContain('pwsh')
    expect(collapsed).toContain('▸')
    expect(collapsed).not.toContain('a\nb')
    const opened = render(blocks, 80, false, ['t9']).join('\n')
    expect(opened).toContain('▾')
    expect(opened).toContain('│ a')
  })

  it('keeps a running tool card open regardless of click state', () => {
    const blocks: ViewBlock[] = [{
      kind: 'tool',
      id: 't10',
      turn: 1,
      name: 'pwsh',
      args: '{"command":"sleep 1"}',
      status: 'running',
      output: '',
      diff: [],
    }]
    expect(render(blocks).join('\n')).toContain('sleep 1')
  })

  it('shows one line for a settled reasoning trace', () => {
    const blocks: ViewBlock[] = [{
      kind: 'assistant',
      id: 'a9',
      turn: 1,
      text: 'done',
      reasoning: 'first think\nsecond think',
      streaming: false,
    }]
    const collapsed = render(blocks).join('\n')
    expect(collapsed).toContain('thinking')
    expect(collapsed).not.toContain('first think')
    const opened = render(blocks, 80, false, ['a9']).join('\n')
    expect(opened).toContain('first think')
    expect(opened).toContain('second think')
  })

  it('renders a tool card with its diff and result tail', () => {
    const output = Array.from({ length: 16 }, (_value, index) => `line${String(index + 1)}`).join('\n')
    const tool: ViewBlock[] = [{
      kind: 'tool',
      id: 't1',
      turn: 1,
      name: 'edit',
      args: '{"file_path":"a.ts"}',
      status: 'ok',
      output,
      diff: [{ kind: 'add', text: 'new line' }, { kind: 'del', text: 'old line' }],
    }]
    const text = render(tool, 200, false, ['t1']).join('\n')
    expect(text).toContain('edit')
    expect(text).toContain('+ new line')
    expect(text).toContain('- old line')
    expect(text).toContain('6 earlier lines')
    expect(text).toContain('line16')
    expect(text).not.toContain('line1\n')
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
    const text = render(tool, 200, false, ['t1']).join('\n')
    expect(text).toContain('pwsh')
    expect(text).toContain('command not found')
  })

  it('wraps and clips to the given width', () => {
    const long: ViewBlock[] = [{ kind: 'user', id: 'u1', turn: 1, text: 'x'.repeat(200) }]
    for (const line of render(long, 40)) expect(line.length).toBeLessThanOrEqual(40)
  })

  it('counts CJK text by display columns, not code units', () => {
    const cjk: ViewBlock[] = [{ kind: 'user', id: 'u1', turn: 1, text: '涓枃娴嬭瘯'.repeat(30) }]
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
