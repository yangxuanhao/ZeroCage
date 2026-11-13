/**
 * ZeroCage terminal host: the Cordis plugin that mounts the fullscreen
 * conversation. It owns the fold from session events to view state, answers
 * approval and `ask_user` requests in the terminal, and drives the single
 * Agent this process runs. It starts no HTTP server, spawns no child process,
 * and speaks no protocol: it is the sibling of the Web host, in-process.
 * @module @deepseek-ai/dsh-tui-host
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-cmdline'
import type {} from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-session-query'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
import {
  createTheme,
  createTranscript,
  createTuiKit,
  stripTerminalSequences,
  type QuestionAnswerItem,
  type SessionChoice,
  type TuiKit,
  type TuiViewState,
} from '@deepseek-ai/dsh-tui-kit'
import { HELP_TEXT, parseCommand } from './commands.ts'
import { startSession, type SessionRuntime } from './session.ts'
import { createViewModel, type ViewInput, type ViewModel } from './view-model.ts'

/** Stable Cordis plugin name. */
export const name = 'tui-host'

/** Services this host drives; the Loader waits for each before the terminal opens. */
export const inject = ['agents', 'sessions', 'agentDefaultModel']

/** Plugin configuration, changeable from the profile's cordis.patch.yml. */
export interface Config {
  /** Resume this session instead of creating one. */
  resume?: string
  /** `provider/model` or a bare model id. */
  model?: string
  /** Print one plain-text line per transcript block instead of taking over the terminal. */
  plain?: boolean
}

export const Config: z<Config> = z.object({
  resume: z.string(),
  model: z.string(),
  plain: z.boolean(),
})

/** Resolve once the loader finished mounting every sibling row. */
async function settleTree(ctx: Context): Promise<void> {
  await ctx.get('loader')?.await()
}

/**
 * The live host: one view model, one runtime, one terminal kit, replaceable
 * session by `/new` and `/resume`.
 */
interface TerminalHost {
  readonly ctx: Context
  readonly view: ViewModel
  /** Set immediately after construction; absent only while the kit is being built. */
  kit: TuiKit | undefined
  readonly plain: boolean
  /** Printed line count, so the plain sink only emits new transcript lines. */
  printedLines: number
  runtime: SessionRuntime | undefined
}

/** Publish one view input and repaint. */
function publish(host: TerminalHost, input: ViewInput): void {
  host.view.dispatch(input)
  if (host.plain) {
    printDelta(host)
    return
  }
  host.kit?.refresh()
}

/** Render the plain sink's transcript delta at a fixed width, without escape codes. */
function printDelta(host: TerminalHost): void {
  const state = host.view.state
  const lines = createTranscript({ getState: () => state, theme: createTheme('none'), settleOnly: true })
    .render(100)
    .map(line => stripTerminalSequences(line))
  const fresh = lines.slice(host.printedLines)
  host.printedLines = lines.length
  for (const line of fresh) process.stdout.write(`${line}\n`)
}

/** Append a notice to the transcript. */
function notice(host: TerminalHost, level: 'info' | 'warn' | 'error', text: string): void {
  publish(host, { type: 'notice', level, text })
}

/** Start or replace the conversation. */
async function openSession(host: TerminalHost, resume: string | undefined, model: string | undefined): Promise<void> {
  const previous = host.runtime
  host.runtime = undefined
  if (previous !== undefined) await previous.dispose()
  const fs = host.ctx.get('fs')
  const cwd = fs === undefined ? process.cwd() : fs.processPath(await fs.resolve('.'))
  const runtime = await startSession({
    ctx: host.ctx,
    publish: input => publish(host, input),
    model,
    cwd,
    resumeSessionId: resume,
  })
  host.runtime = runtime
  publish(host, {
    type: 'start',
    sessionId: String(runtime.sessionId),
    model: runtime.describeModel(),
    cwd,
    title: '',
  })
  publish(host, { type: 'status', status: 'idle' })
  runtime.refreshUsage()
}

/** List recorded sessions into the transcript. */
async function listSessions(host: TerminalHost): Promise<void> {
  const query = host.ctx.get('sessionQuery')
  if (query === undefined) {
    notice(host, 'warn', 'session listing needs the sessionQuery service; this profile has none')
    return
  }
  const records = await query.listSessions()
  if (records.length === 0) {
    notice(host, 'info', 'no recorded sessions')
    return
  }
  const lines = records.slice(0, 10).map(record => `${String(record.header.id)}  ${record.header.title ?? ''}  ${record.header.cwd ?? ''}`)
  notice(host, 'info', ['recorded sessions (newest first):', ...lines].join('\n'))
}

/** Answer one submitted line. */
async function submit(host: TerminalHost, text: string): Promise<void> {
  const command = parseCommand(text)
  const runtime = host.runtime
  switch (command.kind) {
    case 'prompt': {
      if (runtime === undefined) {
        notice(host, 'error', 'no session is open')
        return
      }
      const running = runtime.agent.status === 'running'
      if (running) {
        publish(host, { type: 'queued', texts: [...host.view.state.queued, command.text] })
      }
      runtime.submit(command.text)
      if (running) publish(host, { type: 'status', status: 'running' })
      return
    }
    case 'help':
      notice(host, 'info', HELP_TEXT)
      return
    case 'status': {
      const state: TuiViewState = host.view.state
      notice(host, 'info', [
        `session ${state.sessionId}`,
        `model   ${state.model}`,
        `cwd     ${state.cwd}`,
        `status  ${state.status}`,
        `context ${String(state.tokens.contextUsed)}/${String(state.tokens.contextWindow)}`,
      ].join('\n'))
      return
    }
    case 'stop':
      runtime?.interrupt()
      notice(host, 'info', 'turn cancelled')
      return
    case 'new':
      await openSession(host, undefined, host.view.state.model.includes('/')
        ? host.view.state.model
        : undefined)
      notice(host, 'info', 'started a new session')
      return
    case 'sessions':
      await listSessions(host)
      return
    case 'resume':
      if (command.sessionId === 'last') {
        const query = host.ctx.get('sessionQuery')
        const records = query === undefined ? [] : await query.listSessions()
        const first = records[0]
        if (first === undefined) {
          notice(host, 'warn', 'no recorded session to resume')
          return
        }
        await openSession(host, String(first.header.id), undefined)
        return
      }
      await openSession(host, command.sessionId, undefined)
      return
    case 'model': {
      if (runtime === undefined) {
        notice(host, 'error', 'no session is open')
        return
      }
      const current = runtime.agent.model.current()
      const provider = command.model.includes('/') ? command.model.split('/', 2)[0] : current?.provider
      const model = command.model.includes('/') ? command.model.split('/', 2)[1] : command.model
      if (provider === undefined || model === undefined) {
        notice(host, 'error', 'no model selected yet; pass provider/model')
        return
      }
      runtime.agent.model.select({ provider, model })
      publish(host, { type: 'hint', hint: `model ${provider}/${model}` })
      notice(host, 'info', `model switched to ${provider}/${model}`)
      return
    }
    case 'error':
      notice(host, 'warn', command.text)
      return
    case 'exit':
      return
  }
}

/** Build the session picker's rows from recorded sessions. */
async function sessionChoices(ctx: Context): Promise<readonly SessionChoice[]> {
  const query = ctx.get('sessionQuery')
  if (query === undefined) return []
  const records = await query.listSessions()
  return records.slice(0, 20).map(record => ({
    value: String(record.header.id),
    label: record.header.title ?? String(record.header.id),
    description: record.header.cwd,
  }))
}

/**
 * Mount the terminal host.
 * @param ctx - plugin context carrying the core services and the launcher's exit request.
 * @param config - resume id, model override, and the plain-output switch.
 */
export function apply(ctx: Context, config: Config): void {
  void run(ctx, config).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`zerocage: ${message}\n`)
    ctx.get('appExit')?.(1)
  })
}

/** Start the host and leave process lifetime to the mounted tree. */
async function run(ctx: Context, config: Config): Promise<void> {
  await settleTree(ctx)
  const view = createViewModel()
  const plain = config.plain === true || process.stdin.isTTY !== true
  const host: TerminalHost = { ctx, view, kit: undefined, plain, printedLines: 0, runtime: undefined }
  const kit = createTuiKit({
    getState: () => host.view.state,
    onSubmit: (text: string) => {
      if (text === '/exit' || text === '/quit') {
        void shutdown(host, 0)
        return
      }
      void submit(host, text).catch((error: unknown) => {
        notice(host, 'error', error instanceof Error ? error.message : String(error))
      })
    },
    onInterrupt: () => {
      host.runtime?.interrupt()
      publish(host, { type: 'status', status: 'idle' })
    },
    onExit: () => {
      void shutdown(host, 0)
    },
  })
  host.kit = kit

  // Approval and question answerers are waterfalls: returning an outcome claims
  // the request, so one terminal answers every prompt in this process.
  ctx.on('approval/request', async (request) => {
    if (plain) {
      notice(host, 'warn', `approval requested for ${request.toolName}; this session has no interactive answerer`)
      return 'rejected'
    }
    return kit.askApproval({ toolName: request.toolName, reason: request.reason })
  })
  ctx.on('user-questions/request', async (request) => {
    if (plain) return { answers: request.questions.map(question => ({ id: question.id, selected: [] })) }
    const answers: readonly QuestionAnswerItem[] = await kit.askQuestions({
      questions: request.questions.map(question => ({
        id: question.id,
        header: question.header,
        question: question.question,
        detail: question.detail,
        multiSelect: question.multiSelect === true,
        options: (question.options ?? []).map(option => ({ label: option.label, description: option.description })),
      })),
    })
    return { answers: answers.map(answer => ({ id: answer.id, selected: [...answer.selected], ...answer.custom === undefined ? {} : { custom: answer.custom } })) }
  })

  if (!plain) kit.start()
  await openSession(host, config.resume, config.model)
  if (!plain) {
    // A first-run hint keeps the empty screen from looking broken.
    publish(host, { type: 'hint', hint: 'type a task; /help lists commands' })
  }
  if (host.runtime === undefined) throw new Error('tui-host: no session was opened')
  if (plain) await readPlainInput(host)
}

/**
 * Drive the plain sink from stdin, one line per submission. The terminal kit
 * needs a TTY; a pipe, a CI job, or `--plain` uses this path instead, and end
 * of input is the natural exit.
 * @param host - the mounted host.
 * @returns a promise that settles after the last line was answered and the session was disposed.
 */
async function readPlainInput(host: TerminalHost): Promise<void> {
  const readline = await import('node:readline')
  const lines = readline.createInterface({ input: process.stdin, terminal: false })
  for await (const line of lines) {
    const text = line.trim()
    if (text === '') continue
    if (text === '/exit' || text === '/quit') break
    await submit(host, text)
    await host.runtime?.agent.whenIdle()
    host.runtime?.refreshUsage()
  }
  await host.runtime?.dispose()
  host.ctx.get('appExit')?.(0)
}

/** Leave: flush the session, restore the terminal, and request the bounded exit. */
async function shutdown(host: TerminalHost, code: number): Promise<void> {
  try {
    await host.runtime?.dispose()
  } finally {
    await host.kit?.stop()
    host.ctx.get('appExit')?.(code)
  }
}
