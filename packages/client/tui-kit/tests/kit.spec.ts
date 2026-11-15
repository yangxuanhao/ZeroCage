import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createTuiKit } from '../src/kit.ts'
import type { TuiKit, TuiViewState, ViewBlock } from '../src/types.ts'
import { VirtualTerminal } from './support/virtual-terminal.ts'

/** A view state with the given blocks. */
function stateOf(blocks: readonly ViewBlock[]): TuiViewState {
  return {
    sessionId: 'session-test',
    title: '',
    model: 'deepseek-official/deepseek-flash',
    cwd: 'C:\\work',
    status: 'running',
    blocks,
    queued: [],
    tokens: { input: 1200, output: 340, contextUsed: 12_000, contextWindow: 1_048_576 },
    currentTool: 'read',
    lastError: undefined,
    hint: 'type a task',
    expandedIds: [],
  }
}

/** Mounted kit plus the terminal it draws to. */
interface Fixture {
  readonly terminal: VirtualTerminal
  readonly kit: TuiKit
  readonly submitted: string[]
  readonly interrupts: number[]
  readonly exits: number[]
  setState(blocks: readonly ViewBlock[]): void
}

/** Mount a kit over a virtual terminal in an isolated log directory. */
function mount(status: TuiViewState['status'] = 'running', columns = 90): Fixture {
  const terminal = new VirtualTerminal({ columns, rows: 30 })
  const submitted: string[] = []
  const interrupts: number[] = []
  const exits: number[] = []
  let state = { ...stateOf([]), status }
  const kit = createTuiKit({
    getState: () => state,
    onSubmit: text => submitted.push(text),
    onInterrupt: () => interrupts.push(1),
    onExit: () => exits.push(1),
    terminal,
    colorDepth: 'none',
    logDirectory: mkdtempSync(join(tmpdir(), 'tui-kit-')),
  })
  kit.start()
  return {
    terminal,
    kit,
    submitted,
    interrupts,
    exits,
    setState(blocks: readonly ViewBlock[]): void {
      state = { ...stateOf(blocks), status }
      kit.refresh()
    },
  }
}

describe('createTuiKit', () => {
  it('draws the status bar and footer on a fullscreen screen', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const screen = fixture.terminal.viewport().join('\n')
    expect(screen.toLowerCase()).toContain('autonomous engineering agent')
    expect(screen).toContain('deepseek-flash deepseek-official')
    expect(screen).toContain('working')
    expect(screen).toContain('(1%)')
    expect(screen).toContain('ctrl+p commands')
    await fixture.kit.stop()
  })

  it('renders transcript blocks after a state change', async () => {
    const fixture = mount()
    fixture.setState([
      { kind: 'user', id: 'u1', turn: 1, text: 'read the file' },
      { kind: 'assistant', id: 'a1', turn: 1, text: 'done', reasoning: '', streaming: false },
    ])
    await fixture.terminal.waitForRender()
    const screen = fixture.terminal.viewport().join('\n')
    expect(screen).toContain('read the file')
    expect(screen).toContain('done')
    await fixture.kit.stop()
  })

  it('submits what the operator typed', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('hello world')
    await fixture.terminal.waitForRender()
    expect(fixture.terminal.viewport().join('\n')).toContain('hello world')
    fixture.terminal.sendInput('\r')
    await fixture.terminal.waitForRender()
    expect(fixture.submitted).toEqual(['hello world'])
    await fixture.kit.stop()
  })

  it('ignores an empty submission', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('\r')
    await fixture.terminal.waitForRender()
    expect(fixture.submitted).toEqual([])
    await fixture.kit.stop()
  })

  it('reports an interrupt and an exit on their keys', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('\x03')
    await fixture.terminal.waitForRender()
    expect(fixture.interrupts).toHaveLength(1)
    fixture.terminal.sendInput('\x04')
    await fixture.terminal.waitForRender()
    expect(fixture.exits).toHaveLength(1)
    await fixture.kit.stop()
  })

  it('answers an approval overlay from the keyboard', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const answer = fixture.kit.askApproval({ toolName: 'pwsh', reason: 'runs a command' })
    await fixture.terminal.waitForRender()
    const screen = fixture.terminal.viewport().join('\n')
    expect(screen).toContain('allow pwsh?')
    expect(screen).toContain('runs a command')
    fixture.terminal.sendInput('\r')
    await expect(answer).resolves.toBe('allowed-once')
    await fixture.kit.stop()
  })

  it('treats a cancelled approval as rejected', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const answer = fixture.kit.askApproval({ toolName: 'pwsh', reason: undefined })
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('\x1b')
    await expect(answer).resolves.toBe('rejected')
    await fixture.kit.stop()
  })

  it('collects answers to the model questions', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const answer = fixture.kit.askQuestions({
      questions: [
        {
          id: 'q1',
          header: 'Color',
          question: 'which color?',
          detail: undefined,
          multiSelect: false,
          options: [{ label: 'red', description: undefined }, { label: 'blue', description: undefined }],
        },
      ],
    })
    await fixture.terminal.waitForRender()
    expect(fixture.terminal.viewport().join('\n')).toContain('which color?')
    fixture.terminal.sendInput('\r')
    await expect(answer).resolves.toEqual([{ id: 'q1', selected: ['red'], custom: undefined }])
    await fixture.kit.stop()
  })

  it('picks a session from the picker', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const picked = fixture.kit.pickSession('resume', [
      { value: 's1', label: 'first', description: 'C:\\a' },
      { value: 's2', label: 'second', description: 'C:\\b' },
    ])
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('\u001b[B')
    fixture.terminal.sendInput('\r')
    await expect(picked).resolves.toBe('s2')
    await fixture.kit.stop()
  })

  it('stops twice without error and ignores input afterwards', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    await fixture.kit.stop()
    await fixture.kit.stop()
    fixture.terminal.sendInput('typed after stop')
    await fixture.terminal.waitForRender()
    expect(fixture.submitted).toEqual([])
  })

  it('treats a bare LF as Enter so automated input can send', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('automated line')
    fixture.terminal.sendInput('\n')
    await fixture.terminal.waitForRender()
    expect(fixture.submitted).toEqual(['automated line'])
    await fixture.kit.stop()
  })

  it('lets an interrupt cancel an open prompt instead of swallowing it', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const answer = fixture.kit.askApproval({ toolName: 'pwsh', reason: undefined })
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('\x03')
    await expect(answer).resolves.toBe('rejected')
    expect(fixture.interrupts).toHaveLength(0)
    await fixture.kit.stop()
  })

  it('exits on Ctrl+D with an empty editor only', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('draft')
    fixture.terminal.sendInput('\x04')
    await fixture.terminal.waitForRender()
    expect(fixture.exits).toHaveLength(0)
    fixture.terminal.sendInput('\x15')
    fixture.terminal.sendInput('\x04')
    await fixture.terminal.waitForRender()
    expect(fixture.exits).toHaveLength(1)
    await fixture.kit.stop()
  })

  it('requires a second Ctrl+C to leave while idle', async () => {
    const fixture = mount('idle')
    await fixture.terminal.waitForRender()
    fixture.terminal.sendInput('\x03')
    await fixture.terminal.waitForRender()
    expect(fixture.exits).toHaveLength(0)
    fixture.terminal.sendInput('\x03')
    await fixture.terminal.waitForRender()
    expect(fixture.exits).toHaveLength(1)
    await fixture.kit.stop()
  })

  it('shows a running indicator and elapsed time while working', async () => {
    const fixture = mount()
    fixture.setState([{ kind: 'user', id: 'u1', turn: 1, text: 'go' }])
    await fixture.terminal.waitForRender()
    await new Promise<void>(resolve => { setTimeout(resolve, 260) })
    await fixture.terminal.waitForRender()
    const screen = fixture.terminal.viewport().join('\n')
    expect(screen).toMatch(/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/u)
    await fixture.kit.stop()
  })

  it('names the missing model instead of leaving the cell blank', async () => {
    const terminal = new VirtualTerminal({ columns: 100, rows: 20 })
    const state: TuiViewState = { ...stateOf([]), model: '', status: 'starting' }
    const kit = createTuiKit({
      getState: () => state,
      onSubmit: () => {},
      onInterrupt: () => {},
      onExit: () => {},
      terminal,
      colorDepth: 'none',
      logDirectory: mkdtempSync(join(tmpdir(), 'tui-kit-')),
    })
    kit.start()
    await terminal.waitForRender()
    expect(terminal.viewport().join('\n')).toContain('(connecting)')
    await kit.stop()
  })

  it('keeps the state word visible on a narrow terminal', async () => {
    const fixture = mount('running', 40)
    await fixture.terminal.waitForRender()
    const screen = fixture.terminal.viewport().join('\n')
    expect(screen.toLowerCase()).toContain('zero · cage')
    expect(screen).toContain('working')
    expect(screen).not.toContain('out 340')
    for (const line of fixture.terminal.viewport()) expect(line.length).toBeLessThanOrEqual(40)
    await fixture.kit.stop()
  })

  it('opens a collapsed tool card when it is clicked', async () => {
    const toggled: string[] = []
    const terminal = new VirtualTerminal({ columns: 90, rows: 30 })
    const blocks: ViewBlock[] = [{
      kind: 'tool',
      id: 'tool-1',
      turn: 1,
      name: 'pwsh',
      args: '{"command":"ls"}',
      status: 'ok',
      output: 'a\nb',
      diff: [],
    }]
    const state = { ...stateOf(blocks), status: 'idle' as const }
    const kit = createTuiKit({
      getState: () => state,
      onSubmit: () => {},
      onInterrupt: () => {},
      onExit: () => {},
      onToggleBlock: id => toggled.push(id),
      terminal,
      colorDepth: 'none',
      logDirectory: mkdtempSync(join(tmpdir(), 'tui-kit-')),
    })
    kit.start()
    await terminal.waitForRender()
    // SGR left press at column 5, row 1 — transcript starts at the top row.
    terminal.sendInput('\u001b[<0;5;1M')
    await terminal.waitForRender()
    // The release synthesizes a click for the same gesture; it must not toggle
    // a second time.
    terminal.sendInput('\u001b[<0;5;1m')
    await terminal.waitForRender()
    expect(toggled).toEqual(['tool-1'])
    await kit.stop()
  })
})
