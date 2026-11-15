/**
 * The host's state fold: a pure reducer from conversation events to the view
 * state the terminal kit renders. Keeping it a pure function is what makes the
 * transcript testable without a terminal or a model.
 * @module @deepseek-ai/dsh-tui-host/view-model
 */

import type { DiffLine, TokenStats, TuiStatus, TuiViewState, ViewBlock } from '@deepseek-ai/dsh-tui-kit'

/** One input the host feeds the reducer. */
export type ViewInput =
  | {
    readonly type: 'start'
    readonly sessionId: string
    readonly model: string
    readonly cwd: string
    readonly title: string
  }
  | { readonly type: 'status'; readonly status: TuiStatus }
  | { readonly type: 'hint'; readonly hint: string | undefined }
  | { readonly type: 'title'; readonly title: string }
  | { readonly type: 'user'; readonly text: string; readonly turn: number }
  | { readonly type: 'queued'; readonly texts: readonly string[] }
  | { readonly type: 'stream-start'; readonly turn: number; readonly step: number }
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'reasoning-delta'; readonly text: string }
  | { readonly type: 'stream-end' }
  | {
    readonly type: 'tool-call'
    readonly callId: string
    readonly name: string
    readonly args: string
    readonly turn: number
  }
  | {
    readonly type: 'tool-result'
    readonly callId: string
    readonly ok: boolean
    readonly output: string
    readonly diff: readonly DiffLine[]
  }
  | { readonly type: 'notice'; readonly level: 'info' | 'warn' | 'error'; readonly text: string }
  | {
    readonly type: 'usage'
    readonly input: number
    readonly output: number
    readonly contextUsed: number
    readonly contextWindow: number
  }
  | { readonly type: 'error'; readonly text: string }

/** The state before the first session exists. */
export const initialViewState: TuiViewState = {
  sessionId: '',
  title: '',
  model: '',
  cwd: '',
  status: 'starting',
  blocks: [],
  queued: [],
  tokens: { input: 0, output: 0, contextUsed: 0, contextWindow: 0 },
  currentTool: undefined,
  lastError: undefined,
  hint: undefined,
  expandedIds: [],
}

/** Transcript growth cap; older blocks are dropped from the head. */
const MAX_BLOCKS = 2000

/** Longest session title the status bar shows, derived from the first prompt. */
const MAX_TITLE_CHARS = 48

/** Id of the assistant block currently streaming. */
interface StreamCursor {
  readonly id: string
}

/** Mutable fold state: the reducer owns it, callers only see snapshots. */
interface FoldState {
  view: TuiViewState
  cursor: StreamCursor | undefined
  blockSeq: number
}

/** The reducer's resumable state, created once per session. */
export interface ViewModel {
  /** Current snapshot; stable between inputs so renderers can cache on identity. */
  readonly state: TuiViewState
  /** Apply one input and return the new snapshot. */
  dispatch(input: ViewInput): TuiViewState
  /** Open or close one collapsed block, returning the new snapshot. */
  toggleExpanded(id: string): TuiViewState
}

/** Trim the head of the transcript once it exceeds the cap. */
function trim(blocks: readonly ViewBlock[]): readonly ViewBlock[] {
  return blocks.length <= MAX_BLOCKS ? blocks : blocks.slice(blocks.length - MAX_BLOCKS)
}

/** Replace the last occurrence of `id`, leaving the rest of the list untouched. */
function updateBlock(blocks: readonly ViewBlock[], id: string, next: (block: ViewBlock) => ViewBlock): readonly ViewBlock[] {
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index]
    if (block === undefined || block.id !== id) continue
    const updated = blocks.slice()
    updated[index] = next(block)
    return updated
  }
  return blocks
}

/** The assistant block a stream delta belongs to, or undefined when none is open. */
function openAssistant(state: FoldState): Extract<ViewBlock, { kind: 'assistant' }> | undefined {
  const id = state.cursor?.id
  if (id === undefined) return undefined
  for (let index = state.view.blocks.length - 1; index >= 0; index--) {
    const block = state.view.blocks[index]
    if (block !== undefined && block.id === id && block.kind === 'assistant') return block
  }
  return undefined
}

/**
 * Create a reducer state.
 * @returns a view model with the initial snapshot.
 */
export function createViewModel(): ViewModel {
  const fold: FoldState = { view: initialViewState, cursor: undefined, blockSeq: 0 }
  return {
    get state(): TuiViewState {
      return fold.view
    },
    dispatch(input: ViewInput): TuiViewState {
      fold.view = reduce(fold, input)
      return fold.view
    },
    toggleExpanded(id: string): TuiViewState {
      const open = fold.view.expandedIds.includes(id)
      fold.view = {
        ...fold.view,
        expandedIds: open ? fold.view.expandedIds.filter(value => value !== id) : [...fold.view.expandedIds, id],
      }
      return fold.view
    },
  }
}

/** Fold one input into the state; the only place view fields change. */
function reduce(state: FoldState, input: ViewInput): TuiViewState {
  const view = state.view
  switch (input.type) {
    case 'start':
      return {
        ...view,
        sessionId: input.sessionId,
        model: input.model,
        cwd: input.cwd,
        title: input.title,
        status: 'idle',
        lastError: undefined,
      }
    case 'status':
      return { ...view, status: input.status }
    case 'hint':
      return { ...view, hint: input.hint }
    case 'title':
      return { ...view, title: input.title }
    case 'user': {
      const title = view.title === '' ? input.text.replace(/\s+/gu, ' ').slice(0, MAX_TITLE_CHARS) : view.title
      return {
        ...view,
        title,
        blocks: trim([...view.blocks, { kind: 'user', id: `u${String(input.turn)}-${String(state.blockSeq++)}`, turn: input.turn, text: input.text }]),
        // The message reached the log, so it is no longer queued.
        queued: [],
      }
    }
    case 'queued':
      return { ...view, queued: input.texts }
    case 'stream-start': {
      const id = `a${String(input.turn)}-${String(input.step)}`
      state.cursor = { id }
      const existing = view.blocks.some(block => block.id === id)
      if (existing) return view
      const block: ViewBlock = {
        kind: 'assistant',
        id,
        turn: input.turn,
        text: '',
        reasoning: '',
        streaming: true,
      }
      return { ...view, blocks: trim([...view.blocks, block]) }
    }
    case 'text-delta': {
      const open = openAssistant(state)
      if (open === undefined) return view
      const blocks = updateBlock(view.blocks, open.id, block => (block.kind === 'assistant'
        ? { ...block, text: block.text + input.text, streaming: true }
        : block))
      return { ...view, blocks }
    }
    case 'reasoning-delta': {
      const open = openAssistant(state)
      if (open === undefined) return view
      const blocks = updateBlock(view.blocks, open.id, block => (block.kind === 'assistant'
        ? { ...block, reasoning: block.reasoning + input.text }
        : block))
      return { ...view, blocks }
    }
    case 'stream-end': {
      const open = openAssistant(state)
      state.cursor = undefined
      if (open === undefined) return view
      // An attempt that produced no text leaves nothing to show; keeping the
      // block would leave a bare header and a blinking cursor on screen.
      if (open.text === '' && open.reasoning === '') {
        return {
          ...view,
          blocks: view.blocks.filter(block => block.id !== open.id),
          currentTool: undefined,
        }
      }
      const blocks = updateBlock(view.blocks, open.id, block => (block.kind === 'assistant' ? { ...block, streaming: false } : block))
      return { ...view, blocks, currentTool: undefined }
    }
    case 'tool-call': {
      const block: ViewBlock = {
        kind: 'tool',
        id: `t${input.callId}`,
        turn: input.turn,
        name: input.name,
        args: input.args,
        status: 'running',
        output: '',
        diff: [],
      }
      return {
        ...view,
        blocks: trim([...view.blocks, block]),
        currentTool: input.name,
        status: 'running',
      }
    }
    case 'tool-result': {
      const blocks = updateBlock(view.blocks, `t${input.callId}`, block => (block.kind === 'tool'
        ? { ...block, status: input.ok ? 'ok' : 'error', output: input.output, diff: input.diff }
        : block))
      return { ...view, blocks, currentTool: undefined }
    }
    case 'notice':
      return {
        ...view,
        blocks: trim([...view.blocks, { kind: 'notice', id: `n${String(state.blockSeq++)}`, turn: 0, level: input.level, text: input.text }]),
      }
    case 'usage': {
      const tokens: TokenStats = {
        input: input.input,
        output: input.output,
        contextUsed: input.contextUsed,
        contextWindow: input.contextWindow,
      }
      return { ...view, tokens }
    }
    case 'error':
      return { ...view, status: 'error', lastError: input.text, currentTool: undefined }
  }
}
