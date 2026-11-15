import { describe, expect, it } from 'vitest'
import { createViewModel, initialViewState, type ViewInput } from '../src/view-model.ts'

/** Apply a sequence of inputs and return the final snapshot. */
function fold(inputs: readonly ViewInput[]) {
  const model = createViewModel()
  for (const input of inputs) model.dispatch(input)
  return model.state
}

describe('createViewModel', () => {
  it('starts from the empty snapshot', () => {
    const model = createViewModel()
    expect(model.state).toBe(initialViewState)
    expect(model.state.status).toBe('starting')
    expect(model.state.blocks).toEqual([])
  })

  it('records the session facts from the start input', () => {
    const state = fold([{
      type: 'start',
      sessionId: 'session-1',
      model: 'deepseek-official/deepseek-flash',
      cwd: 'C:\\work',
      title: 'demo',
    }])
    expect(state.sessionId).toBe('session-1')
    expect(state.model).toBe('deepseek-official/deepseek-flash')
    expect(state.cwd).toBe('C:\\work')
    expect(state.status).toBe('idle')
  })

  it('appends user and assistant blocks in order', () => {
    const state = fold([
      { type: 'user', text: 'hi', turn: 1 },
      { type: 'stream-start', turn: 1, step: 1 },
      { type: 'text-delta', text: 'hel' },
      { type: 'text-delta', text: 'lo' },
      { type: 'stream-end' },
    ])
    expect(state.blocks).toHaveLength(2)
    const assistant = state.blocks[1]
    expect(assistant?.kind).toBe('assistant')
    if (assistant?.kind === 'assistant') {
      expect(assistant.text).toBe('hello')
      expect(assistant.streaming).toBe(false)
    }
  })

  it('keeps reasoning separate from the answer', () => {
    const state = fold([
      { type: 'stream-start', turn: 1, step: 1 },
      { type: 'reasoning-delta', text: 'thinking' },
      { type: 'text-delta', text: 'answer' },
    ])
    const block = state.blocks[0]
    expect(block?.kind).toBe('assistant')
    if (block?.kind === 'assistant') {
      expect(block.reasoning).toBe('thinking')
      expect(block.text).toBe('answer')
    }
  })

  it('ignores deltas that arrive without an open stream', () => {
    const state = fold([{ type: 'text-delta', text: 'orphan' }])
    expect(state.blocks).toEqual([])
  })

  it('marks a tool call running and then settles it with its diff', () => {
    const state = fold([
      { type: 'tool-call', callId: 'call-1', name: 'edit', args: '{"old_string":"a"}', turn: 1 },
      { type: 'tool-result', callId: 'call-1', ok: true, output: 'done', diff: [{ kind: 'add', text: 'b' }] },
    ])
    const block = state.blocks[0]
    expect(block?.kind).toBe('tool')
    if (block?.kind === 'tool') {
      expect(block.status).toBe('ok')
      expect(block.output).toBe('done')
      expect(block.diff).toEqual([{ kind: 'add', text: 'b' }])
    }
    expect(state.currentTool).toBeUndefined()
  })

  it('marks a failed tool result as an error', () => {
    const state = fold([
      { type: 'tool-call', callId: 'c', name: 'pwsh', args: '', turn: 2 },
      { type: 'tool-result', callId: 'c', ok: false, output: 'boom', diff: [] },
    ])
    const block = state.blocks[0]
    expect(block?.kind === 'tool' && block.status).toBe('error')
  })

  it('reports token usage and errors', () => {
    const state = fold([
      { type: 'usage', input: 10, output: 20, contextUsed: 30, contextWindow: 100 },
      { type: 'error', text: 'provider down' },
    ])
    expect(state.tokens).toEqual({ input: 10, output: 20, contextUsed: 30, contextWindow: 100 })
    expect(state.status).toBe('error')
    expect(state.lastError).toBe('provider down')
  })

  it('derives a title from the first prompt and clears the queue', () => {
    const state = fold([
      { type: 'queued', texts: ['second'] },
      { type: 'user', text: 'merge   the duplicate\ntime helpers', turn: 1 },
    ])
    expect(state.title).toBe('merge the duplicate time helpers')
    expect(state.queued).toEqual([])
  })

  it('drops an assistant block that produced nothing', () => {
    const state = fold([
      { type: 'stream-start', turn: 1, step: 1 },
      { type: 'stream-end' },
    ])
    expect(state.blocks).toEqual([])
  })

  it('keeps the transcript bounded', () => {
    const model = createViewModel()
    for (let turn = 0; turn < 2100; turn++) model.dispatch({ type: 'notice', level: 'info', text: `n${String(turn)}` })
    expect(model.state.blocks).toHaveLength(2000)
    const last = model.state.blocks[model.state.blocks.length - 1]
    expect(last?.kind === 'notice' && last.text).toBe('n2099')
  })

  it('returns a new snapshot object only when something changed', () => {
    const model = createViewModel()
    const before = model.state
    const after = model.dispatch({ type: 'status', status: 'running' })
    expect(after).not.toBe(before)
    expect(after.status).toBe('running')
  })
})
