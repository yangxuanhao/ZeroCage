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
function mount(): Fixture {
  const terminal = new VirtualTerminal({ columns: 90, rows: 30 })
  const submitted: string[] = []
  const interrupts: number[] = []
  const exits: number[] = []
  let state = stateOf([])
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
      state = stateOf(blocks)
      kit.refresh()
    },
  }
}

describe('createTuiKit', () => {
  it('draws the status bar and footer on a fullscreen screen', async () => {
    const fixture = mount()
    await fixture.terminal.waitForRender()
    const screen = fixture.terminal.viewport().join('\n')
    expect(screen).toContain('zerocage')
    expect(screen).toContain('deepseek-official/deepseek-flash')
    expect(screen).toContain('working')
    expect(screen).toContain('ctx 1%')
    expect(screen).toContain('[enter] send')
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
})
