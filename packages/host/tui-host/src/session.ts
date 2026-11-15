/**
 * Session runtime: creates (or resumes) the single Agent this process drives,
 * folds its events into the view model, and exposes the three operations the
 * terminal needs — submit, interrupt, and settle.
 * @module @deepseek-ai/dsh-tui-host/session
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { installModelSelection } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-fs'
import { createUserMessage, type ToolResultMessage } from '@deepseek-ai/dsh-llm'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-token-meter'
import type { DiffLine } from '@deepseek-ai/dsh-tui-kit'
import { resolveDiff } from './diff.ts'
import type { ViewInput } from './view-model.ts'

/** Longest tool result the transcript keeps before it is summarized. */
const MAX_TOOL_OUTPUT_CHARS = 8 * 1024

/** How the host reaches the runtime. */
export interface SessionRuntimeOptions {
  readonly ctx: Context
  /** Publish one view input; the host repaints after folding it. */
  readonly publish: (input: ViewInput) => void
  /** Explicit `provider/model` or bare model id from the command line. */
  readonly model: string | undefined
  /** Working directory recorded on the session. */
  readonly cwd: string
  /** Resume this session instead of creating one. */
  readonly resumeSessionId: string | undefined
}

/** The host's handle on the live conversation. */
export interface SessionRuntime {
  readonly sessionId: SessionId
  readonly agent: Agent
  /** Queue a user message; a running turn takes it at the next step. */
  submit(text: string): void
  /** Cancel the running turn; the session stays usable. */
  interrupt(): void
  /** Resolve the provider/model pair in use, for the status bar. */
  describeModel(): string
  /** Re-read measured context pressure into the view model. */
  refreshUsage(): void
  /** Flush durable state and release the agent. */
  dispose(): Promise<void>
}

/** A tool call's recorded shape, so a result can be rendered with its arguments. */
interface CallRecord {
  readonly name: string
  readonly args: string
}

/** Join the text blocks of a persisted message. */
function textOf(message: { readonly content: readonly { readonly type: string }[] }): string {
  const parts: string[] = []
  for (const block of message.content) {
    if (block.type === 'text') {
      const text: unknown = Reflect.get(block, 'text')
      if (typeof text === 'string') parts.push(text)
    }
  }
  return parts.join('')
}

/** Bound one tool result so a huge listing cannot flood the transcript. */
function boundOutput(text: string): string {
  if (text.length <= MAX_TOOL_OUTPUT_CHARS) return text
  const kept = text.slice(text.length - MAX_TOOL_OUTPUT_CHARS)
  return `… ${String(text.length - MAX_TOOL_OUTPUT_CHARS)} characters omitted\n${kept}`
}

/** Read the tool-call id of a result message. */
function callIdOf(message: ToolResultMessage): string {
  return String(message.toolCallId)
}

/**
 * Start or resume the conversation this process owns.
 * @param options - plugin context, view model, model override, cwd, and resume id.
 * @returns the runtime handle; every subscription is released by {@link SessionRuntime.dispose}.
 */
export async function startSession(options: SessionRuntimeOptions): Promise<SessionRuntime> {
  const { ctx } = options
  // Sibling rows mount concurrently; creating an Agent before the tree settles
  // would hand it a half-composed tool catalog.
  await ctx.get('loader')?.await()
  const agents = ctx.get('agents')
  const sessions = ctx.get('sessions')
  const defaultModel = ctx.get('agentDefaultModel')
  if (agents === undefined || sessions === undefined || defaultModel === undefined) {
    throw new Error('tui-host: the composition must mount agents, sessions, and agentDefaultModel')
  }
  const selection = { ...defaultModel.currentSelection() }
  if (options.model !== undefined && options.model !== '') {
    const [first, second] = options.model.includes('/')
      ? options.model.split('/', 2)
      : [selection.provider, options.model]
    if (first !== undefined && first !== '') selection.provider = first
    if (second !== undefined && second !== '') selection.model = second
  }
  const setup = (agentCtx: Context): void => {
    installModelSelection(agentCtx)
  }
  const sessionId = options.resumeSessionId ?? `session-${randomUUID()}`
  const handle = options.resumeSessionId === undefined
    ? await agents.create({
      sessionId: sessionId as SessionId,
      meta: { cwd: options.cwd },
      agentOptions: selection,
      setup,
    })
    : await agents.resume({ resumeSessionId: sessionId as SessionId, agentOptions: selection, setup })
  const agent = handle.agent
  const session = agent.session
  const calls = new Map<string, CallRecord>()
  const disposers: (() => void)[] = []
  let disposed = false
  /** Context window last reported by the token meter, reused for message usage. */
  let sessionWindow = 0
  /** Whether the current step already emitted text through stream frames. */
  let streamedText = false

  const dispatch = options.publish

  const onEvent = (subject: Session, event: SessionEvent): void => {
    if (subject !== session) return
    switch (event.type) {
      case 'user/message':
        // Only what the operator typed; instruction injections are model
        // context, not conversation turns.
        if (event.data.source.kind !== 'user') return
        dispatch({ type: 'user', text: textOf(event.data), turn: 0 })
        return
      case 'turn/start':
        dispatch({ type: 'status', status: 'running' })
        return
      case 'turn/end': {
        const reason = event.data.reason
        if (reason.kind === 'error') {
          dispatch({ type: 'error', text: `${reason.error.code}: ${reason.error.message}` })
        } else if (reason.kind === 'completed' || reason.kind === 'aborted' || reason.kind === 'interrupted') {
          dispatch({ type: 'status', status: 'idle' })
        } else {
          dispatch({ type: 'status', status: 'idle' })
        }
        refreshUsage()
        return
      }
      case 'tool/call': {
        const record: CallRecord = { name: event.data.name, args: event.data.arguments }
        calls.set(String(event.data.callId), record)
        dispatch({ type: 'tool-call', callId: String(event.data.callId), name: record.name, args: record.args, turn: event.data.turn })
        return
      }
      case 'tool/result': {
        const callId = callIdOf(event.data.message)
        const record = calls.get(callId)
        const output = boundOutput(textOf(event.data.message))
        const diff: readonly DiffLine[] = record === undefined ? [] : resolveDiff(record.name, record.args, output)
        const failed = event.data.error !== undefined || event.data.message.isError === true
        dispatch({ type: 'tool-result', callId, ok: !failed, output, diff })
        return
      }
      case 'assistant/message': {
        // A replayed or adopted session arrives without stream frames; keep its
        // text. A live step already streamed it, so appending again would double it.
        const text = textOf(event.data.message)
        if (!streamedText && text !== '') {
          dispatch({ type: 'stream-start', turn: event.data.turn, step: event.data.step })
          dispatch({ type: 'text-delta', text })
        }
        streamedText = false
        const usage = event.data.usage
        if (usage !== undefined) {
          dispatch({
            type: 'usage',
            input: usage.inputTokens,
            output: usage.outputTokens,
            contextUsed: usage.inputTokens + usage.outputTokens,
            contextWindow: sessionWindow,
          })
        }
        dispatch({ type: 'stream-end' })
        return
      }
      default:
        return
    }
  }

  const onStream = (payload: { agent: Agent; frame: import('@deepseek-ai/dsh-agent').AssistantStreamFrame }): void => {
    if (payload.agent !== agent) return
    const { frame } = payload
    switch (frame.type) {
      case 'start':
        streamedText = false
        dispatch({ type: 'stream-start', turn: frame.turn, step: frame.step })
        return
      case 'end':
        dispatch({ type: 'stream-end' })
        return
      case 'chunk': {
        const chunk = frame.chunk
        switch (chunk.type) {
          case 'text-delta':
            streamedText = true
            dispatch({ type: 'text-delta', text: chunk.text })
            return
          case 'reasoning-delta':
            dispatch({ type: 'reasoning-delta', text: chunk.text })
            return
          case 'tool-call-delta':
          case 'block-start':
          case 'block-end':
          case 'usage':
          case 'finish':
            return
        }
      }
    }
  }

  const onError = (payload: { agent: Agent; error: unknown }): void => {
    if (payload.agent !== agent) return
    const message = payload.error instanceof Error ? payload.error.message : String(payload.error)
    dispatch({ type: 'notice', level: 'error', text: `error: ${message}` })
    dispatch({ type: 'error', text: message })
  }

  disposers.push(ctx.on('session/event', onEvent))
  disposers.push(ctx.on('agent/assistant-stream', onStream))
  disposers.push(ctx.on('agent/error', onError))

  const meter = ctx.get('tokenMeter')
  function refreshUsage(): void {
    if (meter === undefined) return
    try {
      const pressure = meter.contextPressure(session)
      const used = pressure.pressureTokens ?? 0
      sessionWindow = pressure.contextWindow ?? sessionWindow
      dispatch({
        type: 'usage',
        input: used,
        output: 0,
        contextUsed: used,
        contextWindow: sessionWindow,
      })
    } catch (error) {
      // Measurement replays the log; a partial log (compaction in flight) can
      // reject. The status bar keeps its last numbers rather than showing zero.
      void (error instanceof Error ? error.message : String(error))
    }
  }

  const modelDescription = (): string => {
    const current = agent.model.current() ?? selection
    return `${current.provider}/${current.model}`
  }

  return {
    sessionId: session.id,
    agent,
    submit(text: string): void {
      agent.followup(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }))
    },
    interrupt(): void {
      agent.cancel({ kind: 'user' })
    },
    describeModel: modelDescription,
    refreshUsage,
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      for (const dispose of disposers.splice(0)) dispose()
      try {
        await sessions.flush(session)
      } catch (error) {
        // A failed flush leaves the log durable up to the last checkpoint.
        void (error instanceof Error ? error.message : String(error))
      }
      await handle.dispose()
    },
  }
}
