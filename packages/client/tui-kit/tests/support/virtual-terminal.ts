/**
 * A real terminal emulator for tests: pi-tui writes cursor-addressed frames, so
 * asserting on rendered output needs a screen, not a string. `@xterm/headless`
 * provides one without a TTY.
 * @module @deepseek-ai/dsh-tui-kit/tests/support/virtual-terminal
 */

import type { Terminal as XtermTerminalInstance } from '@xterm/headless'
import xterm from '@xterm/headless'
import type { Terminal } from '@deepseek-ai/pi-tui'

const XtermTerminal = xterm.Terminal

/** A `Terminal` backed by xterm's headless buffer. */
export class VirtualTerminal implements Terminal {
  private readonly xterm: XtermTerminalInstance
  private inputHandler: ((data: string) => void) | undefined
  private resizeHandler: (() => void) | undefined

  constructor(private readonly dimensions: { columns: number; rows: number } = { columns: 80, rows: 24 }) {
    this.xterm = new XtermTerminal({ cols: dimensions.columns, rows: dimensions.rows, disableStdin: true, allowProposedApi: true })
  }

  start(onInput: (data: string) => void, onResize: () => void): void {
    this.inputHandler = onInput
    this.resizeHandler = onResize
    this.xterm.write('\x1b[?2004h')
  }

  async drainInput(): Promise<void> {
    // No stdin to drain.
  }

  stop(): void {
    this.xterm.write('\x1b[?2004l')
    this.inputHandler = undefined
    this.resizeHandler = undefined
  }

  write(data: string): void {
    this.xterm.write(data)
  }

  get columns(): number {
    return this.xterm.cols
  }

  get rows(): number {
    return this.xterm.rows
  }

  get kittyProtocolActive(): boolean {
    return true
  }

  moveBy(lines: number): void {
    if (lines > 0) this.xterm.write(`\x1b[${String(lines)}B`)
    else if (lines < 0) this.xterm.write(`\x1b[${String(-lines)}A`)
  }

  hideCursor(): void {
    this.xterm.write('\x1b[?25l')
  }

  showCursor(): void {
    this.xterm.write('\x1b[?25h')
  }

  clearLine(): void {
    this.xterm.write('\x1b[K')
  }

  clearFromCursor(): void {
    this.xterm.write('\x1b[J')
  }

  clearScreen(): void {
    this.xterm.write('\x1b[2J\x1b[H')
  }

  setTitle(title: string): void {
    this.xterm.write(`\x1b]0;${title}\x07`)
  }

  setProgress(): void {
    // Not rendered in tests.
  }

  setProgramStatus(): void {
    // Not rendered in tests.
  }

  /** Feed raw key data as the terminal's input stream would. */
  sendInput(data: string): void {
    this.inputHandler?.(data)
  }

  /** Resize the emulated screen. */
  resize(columns: number, rows: number): void {
    this.xterm.resize(columns, rows)
    this.resizeHandler?.()
  }

  /** Settle both xterm's write queue and pi-tui's throttled render pipeline. */
  async waitForRender(): Promise<void> {
    await new Promise<void>(resolve => { process.nextTick(resolve) })
    await new Promise<void>(resolve => { setTimeout(resolve, 25) })
    await new Promise<void>(resolve => { this.xterm.write('', () => { resolve() }) })
  }

  /** The visible screen, trimmed of trailing blank space per line. */
  viewport(): string[] {
    const buffer = this.xterm.buffer.active
    const lines: string[] = []
    for (let row = 0; row < this.xterm.rows; row++) {
      const line = buffer.getLine(buffer.viewportY + row)
      lines.push(line === undefined ? '' : line.translateToString(true).trimEnd())
    }
    return lines
  }

  /** Everything xterm retained, viewport first. */
  scrollBuffer(): string[] {
    const buffer = this.xterm.buffer.active
    const lines: string[] = []
    for (let row = 0; row < buffer.length; row++) {
      const line = buffer.getLine(row)
      lines.push(line === undefined ? '' : line.translateToString(true).trimEnd())
    }
    return lines
  }
}
