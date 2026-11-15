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
import type {} from '@deepseek-ai/dsh-llm'
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
import { APPROVAL_POLICIES, setApprovalPolicy, type ApprovalPolicy } from '@deepseek-ai/dsh-user-approval'
import { COMMANDS, HELP_TEXT, parseCommand } from './commands.ts'
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

/** How many sessions a listing or picker offers. */
const SESSION_LIMIT = 50

/** Longest single-line error the transcript shows. */
const ERROR_CHARS = 180

/** Resolve once the loader finished mounting every sibling row. */
async function settleTree(ctx: Context): Promise<void> {
  await ctx.get('loader')?.await()
}

/**
 * Reduce a provider or tool failure to one line an operator can act on: the
 * first line, without request ids, masked keys, or stack frames.
 * @param message - the raw failure text.
 * @returns a short, single-line summary.
 */
export function shortError(message: string): string {
  const first = message.split('\n').map(line => line.trim()).find(line => line !== '') ?? message
  const cleaned = first
    .replace(/\(request_id[^)]*\)/giu, '')
    .replace(/request_id[=:]\s*\S+/giu, '')
    .replace(/\bsk-[A-Za-z0-9_*-]{4,}/gu, 'sk-***')
    .replace(/\s{2,}/gu, ' ')
    .trim()
  return cleaned.length > ERROR_CHARS ? `${cleaned.slice(0, ERROR_CHARS - 1)}…` : cleaned
}

/** The live host: one view model, one runtime, one terminal kit, replaceable session. */
interface TerminalHost {
  readonly ctx: Context
  readonly view: ViewModel
  /** Set immediately after construction; absent only while the kit is being built. */
  kit: TuiKit | undefined
  readonly plain: boolean
  /** Printed line count, so the plain sink only emits new transcript lines. */
  printedLines: number
  runtime: SessionRuntime | undefined
  /** Model the operator chose, reused by `/new`. */
  preferredModel: string | undefined
  /** Whether the plain sink is mid-assistant-line. */
  plainStreamOpen: boolean
  /** Last turn ended in failure, for the process exit code. */
  failed: boolean
}

/** Publish one view input and repaint. */
function publish(host: TerminalHost, input: ViewInput): void {
  host.view.dispatch(input)
  if (input.type === 'error') host.failed = true
  if (host.plain) {
    printDelta(host, input)
    return
  }
  host.kit?.refresh()
}

/** Render the plain sink's transcript delta, streaming assistant text as it arrives. */
function printDelta(host: TerminalHost, input: ViewInput): void {
  if (input.type === 'stream-start') {
    // The header waits for the first delta: a failed attempt must not leave an
    // empty `zero` block on screen.
    host.plainStreamOpen = false
    return
  }
  if (input.type === 'text-delta') {
    if (!host.plainStreamOpen) process.stdout.write('\n● zero\n')
    process.stdout.write(input.text)
    host.plainStreamOpen = true
    return
  }
  if (input.type === 'stream-end') {
    if (host.plainStreamOpen) process.stdout.write('\n')
    host.plainStreamOpen = false
    return
  }
  const state = host.view.state
  const lines = createTranscript({
    getState: () => state,
    theme: createTheme('none'),
    settleOnly: true,
    omitAssistant: true,
  })
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

/** Enter the waiting state around a prompt, then restore the previous state. */
async function waitingFor<T>(host: TerminalHost, run: () => Promise<T>): Promise<T> {
  const before = host.view.state.status
  publish(host, { type: 'status', status: 'waiting' })
  try {
    return await run()
  } finally {
    publish(host, { type: 'status', status: before === 'waiting' ? 'idle' : before })
  }
}

/** Resolve the model route and, when it resolves, its context window. */
async function modelFacts(ctx: Context, model: string): Promise<{ name: string; window: number } | undefined> {
  const llm = ctx.get('llm')
  if (llm === undefined) return undefined
  const [provider, id] = model.includes('/') ? model.split('/', 2) : [undefined, model]
  if (provider === undefined || id === undefined) return undefined
  try {
    const info = await llm.resolveModelInfo(provider, id)
    const window = info.context?.contextWindow ?? 0
    return { name: `${provider}/${info.id}`, window }
  } catch (error) {
    void (error instanceof Error ? error.message : String(error))
    return undefined
  }
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
  const chosen = runtime.describeModel()
  host.preferredModel = model
  publish(host, {
    type: 'start',
    sessionId: String(runtime.sessionId),
    model: chosen,
    cwd,
    title: '',
  })
  publish(host, { type: 'status', status: 'idle' })
  // The status bar needs the route's real window; without it the bar would show
  // a placeholder total from the bundled catalog.
  const facts = await modelFacts(host.ctx, chosen)
  if (facts !== undefined) {
    publish(host, {
      type: 'usage',
      input: host.view.state.tokens.input,
      output: host.view.state.tokens.output,
      contextUsed: host.view.state.tokens.contextUsed,
      contextWindow: facts.window,
    })
  }
  runtime.refreshUsage()
}

/** One line describing a recorded session: id tail, age, and first prompt. */
function sessionLine(record: { header: { id: string; cwd?: string | undefined; createdAt: number }; }, title: string | undefined): string {
  const age = Math.max(0, Date.now() - record.header.createdAt)
  const hours = Math.floor(age / 3_600_000)
  const stamp = hours < 1 ? `${String(Math.floor(age / 60_000))}m` : hours < 48 ? `${String(hours)}h` : `${String(Math.floor(hours / 24))}d`
  const label = title ?? '(no title)'
  return `${String(record.header.id).slice(0, 20)}  ${stamp.padStart(4)}  ${label}`
}

/** Read each record's title, tolerating a missing query method. */
async function titlesOf(ctx: Context, records: readonly { header: { id: string } }[]): Promise<Map<string, string>> {
  const titles = new Map<string, string>()
  const query = ctx.get('sessionQuery')
  if (query === undefined) return titles
  for (const record of records) {
    try {
      const title = await query.readTitle(record.header.id as never)
      const text = typeof title === 'string' ? title : undefined
      if (text !== undefined && text !== '') titles.set(String(record.header.id), text)
    } catch (error) {
      // A session with no readable title still lists; the id is enough to resume it.
      void (error instanceof Error ? error.message : String(error))
    }
  }
  return titles
}

/** List recorded sessions into the transcript. */
async function listSessions(host: TerminalHost): Promise<void> {
  const query = host.ctx.get('sessionQuery')
  if (query === undefined) {
    notice(host, 'warn', 'session listing needs the sessionQuery service; this profile has none')
    return
  }
  const records = (await query.listSessions()).slice(0, SESSION_LIMIT)
  if (records.length === 0) {
    notice(host, 'info', 'no recorded sessions')
    return
  }
  const titles = await titlesOf(host.ctx, records)
  const lines = records.map(record => sessionLine(record, titles.get(String(record.header.id))))
  notice(host, 'info', ['recorded sessions (newest first):', ...lines].join('\n'))
}

/** Build the session picker's rows from recorded sessions. */
async function sessionChoices(ctx: Context): Promise<readonly SessionChoice[]> {
  const query = ctx.get('sessionQuery')
  if (query === undefined) return []
  const records = (await query.listSessions()).slice(0, SESSION_LIMIT)
  const titles = await titlesOf(ctx, records)
  return records.map(record => ({
    value: String(record.header.id),
    label: `${String(record.header.id).slice(0, 8)} · ${titles.get(String(record.header.id)) ?? '(no title)'}`,
    description: record.header.cwd,
  }))
}

/** Validate and apply a model switch, reporting why it failed. */
async function switchModel(host: TerminalHost, requested: string): Promise<boolean> {
  const runtime = host.runtime
  if (runtime === undefined) {
    notice(host, 'error', 'no session is open')
    return false
  }
  const current = runtime.agent.model.current()
  const provider = requested.includes('/') ? requested.split('/', 2)[0] : current?.provider
  const model = requested.includes('/') ? requested.split('/', 2)[1] : requested
  if (provider === undefined || model === undefined) {
    notice(host, 'error', 'no model selected yet; pass provider/model')
    return false
  }
  const facts = await modelFacts(host.ctx, `${provider}/${model}`)
  if (facts === undefined) {
    notice(host, 'error', `unknown model route ${provider}/${model}; nothing was switched`)
    return false
  }
  runtime.agent.model.select({ provider, model: facts.name.split('/')[1] ?? model })
  host.preferredModel = facts.name
  publish(host, {
    type: 'start',
    sessionId: host.view.state.sessionId,
    model: facts.name,
    cwd: host.view.state.cwd,
    title: host.view.state.title,
  })
  publish(host, {
    type: 'usage',
    input: host.view.state.tokens.input,
    output: host.view.state.tokens.output,
    contextUsed: host.view.state.tokens.contextUsed,
    contextWindow: facts.window,
  })
  notice(host, 'info', `model switched to ${facts.name}`)
  return true
}

/** Answer one submitted line. */
async function submit(host: TerminalHost, text: string): Promise<void> {
  const command = parseCommand(text)
  const runtime = host.runtime
  // The first real submission clears the onboarding hint.
  if (host.view.state.hint !== undefined) publish(host, { type: 'hint', hint: undefined })
  switch (command.kind) {
    case 'prompt': {
      if (runtime === undefined) {
        notice(host, 'error', 'no session is open')
        return
      }
      if (host.view.state.status === 'error') publish(host, { type: 'status', status: 'idle' })
      const running = runtime.agent.status === 'running'
      if (running) publish(host, { type: 'queued', texts: [...host.view.state.queued, command.text] })
      runtime.submit(command.text)
      if (running) publish(host, { type: 'status', status: 'running' })
      return
    }
    case 'help':
      notice(host, 'info', HELP_TEXT)
      return
    case 'status': {
      const state: TuiViewState = host.view.state
      const context = state.tokens.contextWindow > 0
        ? `${String(state.tokens.contextUsed)}/${String(state.tokens.contextWindow)}`
        : 'unknown before the first turn'
      notice(host, 'info', [
        `session ${state.sessionId.slice(0, 24)}`,
        `title   ${state.title === '' ? '(none yet)' : state.title}`,
        `model   ${state.model}`,
        `cwd     ${state.cwd}`,
        `status  ${state.status}`,
        `context ${context}`,
      ].join('\n'))
      return
    }
    case 'budget': {
      const promptService = host.ctx.get('systemPrompt')
      if (promptService === undefined) {
        notice(host, 'warn', 'this profile composes no systemPrompt service')
        return
      }
      const assembly = await promptService.assemble({})
      const chars = assembly.sections.map(section => section.text).join('\n').length
      const state = host.view.state
      const context = state.tokens.contextWindow > 0
        ? `${String(state.tokens.contextUsed)}/${String(state.tokens.contextWindow)}`
        : state.tokens.contextUsed > 0 ? String(state.tokens.contextUsed) : 'unknown before the first turn'
      notice(host, 'info', [
        `system prompt ${String(chars)} chars (~${String(Math.ceil(chars / 4))} tokens at chars/4)`,
        `tool schemas  ${String(assembly.tools.length)}`,
        `context       ${context}`,
      ].join('\n'))
      return
    }
    case 'approve': {
      if (runtime === undefined) {
        notice(host, 'error', 'no session is open')
        return
      }
      let policy: 'ask' | 'never' | undefined = command.policy === 'pick' ? undefined : command.policy
      if (policy === undefined) {
        if (host.plain) {
          notice(host, 'info', 'usage: /approve <ask|never>')
          return
        }
        const picked = await waitingFor(host, async () => host.kit?.pickChoice('审批策略', [
          { value: 'ask', label: 'ask', description: '工具调用前先询问确认' },
          { value: 'never', label: 'never', description: '自主执行工具调用，不弹窗询问' },
        ]))
        if (picked !== 'ask' && picked !== 'never') {
          notice(host, 'info', 'approve cancelled')
          return
        }
        policy = picked
      }
      setApprovalPolicy(runtime.agent.session, policy)
      notice(host, 'info', `approval policy = ${policy}`)
      return
    }
    case 'stop':
      if (runtime === undefined || runtime.agent.status !== 'running') {
        notice(host, 'info', 'nothing is running')
        return
      }
      runtime.interrupt()
      notice(host, 'info', 'turn cancelled')
      return
    case 'new':
      await openSession(host, undefined, host.preferredModel ?? undefined)
      notice(host, 'info', 'started a new session')
      return
    case 'sessions':
      await listSessions(host)
      return
    case 'resume': {
      if (command.sessionId === 'pick') {
        const choices = await sessionChoices(host.ctx)
        if (choices.length === 0) {
          notice(host, 'warn', 'no recorded session to resume')
          return
        }
        if (host.plain) {
          await listSessions(host)
          notice(host, 'info', 'use /resume <session-id> to open one')
          return
        }
        const picked = await waitingFor(host, async () => host.kit?.pickSession('恢复会话', choices))
        if (picked === undefined) {
          notice(host, 'info', 'resume cancelled; the current session is unchanged')
          return
        }
        await openSession(host, picked, host.preferredModel ?? undefined)
        notice(host, 'info', `resumed ${picked.slice(0, 24)}`)
        return
      }
      if (command.sessionId === 'last') {
        const query = host.ctx.get('sessionQuery')
        const records = query === undefined ? [] : await query.listSessions()
        const first = records[0]
        if (first === undefined) {
          notice(host, 'warn', 'no recorded session to resume')
          return
        }
        await openSession(host, String(first.header.id), undefined)
        notice(host, 'info', `resumed ${String(first.header.id).slice(0, 24)}`)
        return
      }
      await openSession(host, command.sessionId, undefined)
      notice(host, 'info', `resumed ${command.sessionId.slice(0, 24)}`)
      return
    }
    case 'model': {
      if (command.model !== 'pick') {
        await switchModel(host, command.model)
        return
      }
      if (host.plain) {
        notice(host, 'info', 'usage: /model <model-id>')
        return
      }
      const current = runtime?.agent.model.current()
      const provider = current?.provider ?? 'deepseek-official'
      const candidates = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-flash']
      if (current?.model && !candidates.includes(current.model)) candidates.unshift(current.model)
      const choices: { value: string; label: string; description: string | undefined }[] = []
      for (const id of candidates) {
        const route = `${provider}/${id}`
        const facts = await modelFacts(host.ctx, route)
        if (facts !== undefined) {
          const active = current?.model === id ? ' (current)' : ''
          choices.push({
            value: facts.name,
            label: `${id}${active}`,
            description: facts.window > 0 ? `${facts.name} · ${String(Math.round(facts.window / 1024))}k context` : facts.name,
          })
        }
      }
      if (choices.length === 0) {
        notice(host, 'warn', 'no available models found; pass /model <provider/model>')
        return
      }
      const picked = await waitingFor(host, async () => host.kit?.pickChoice('切换模型', choices))
      if (picked === undefined) {
        notice(host, 'info', 'model switch cancelled')
        return
      }
      await switchModel(host, picked)
      return
    }
    case 'error':
      notice(host, 'warn', command.text)
      return
    case 'exit':
      return
  }
}

/**
 * Mount the terminal host.
 * @param ctx - plugin context carrying the core services and the launcher's exit request.
 * @param config - resume id, model override, and the plain-output switch.
 */
export function apply(ctx: Context, config: Config): void {
  void run(ctx, config).catch((error: unknown) => {
    process.stderr.write(`zerocage: ${shortError(error instanceof Error ? error.message : String(error))}\n`)
    ctx.get('appExit')?.(1)
  })
}

/** Start the host and leave process lifetime to the mounted tree. */
async function run(ctx: Context, config: Config): Promise<void> {
  await settleTree(ctx)
  const view = createViewModel()
  const plain = config.plain === true || process.stdin.isTTY !== true
  if (config.plain !== true && !plain) {
    // Nothing to say when the fullscreen surface takes over.
  } else if (config.plain !== true) {
    process.stderr.write('zerocage: stdin is not a terminal, falling back to plain output (use --plain to silence this)\n')
  }
  const host: TerminalHost = {
    ctx,
    view,
    kit: undefined,
    plain,
    printedLines: 0,
    runtime: undefined,
    preferredModel: config.model,
    plainStreamOpen: false,
    failed: false,
  }
  const kit = createTuiKit({
    getState: () => host.view.state,
    onSubmit: (text: string) => {
      if (text === '/exit' || text === '/quit' || text === '/q') {
        void shutdown(host, host.failed ? 1 : 0)
        return
      }
      void submit(host, text).catch((error: unknown) => {
        notice(host, 'error', shortError(error instanceof Error ? error.message : String(error)))
      })
      // A submit changes the editor row and often the transcript; a forced
      // repaint also clears anything the console echoed before raw mode applied.
      host.kit?.refresh(true)
    },
    onInterrupt: () => {
      const runtime = host.runtime
      if (runtime === undefined || runtime.agent.status !== 'running') return
      runtime.interrupt()
      publish(host, { type: 'status', status: 'idle' })
    },
    onExit: () => {
      void shutdown(host, host.failed ? 1 : 0)
    },
    onToggleBlock: (id: string) => {
      host.view.toggleExpanded(id)
      host.kit?.refresh(true)
    },
    getCommands: () => COMMANDS,
    completionRoot: process.cwd(),
  })
  host.kit = kit

  // Approval and question answerers are waterfalls: returning an outcome claims
  // the request, so one terminal answers every prompt in this process.
  ctx.on('approval/request', async request => {
    if (plain) {
      notice(host, 'warn', `approval requested for ${request.toolName}; this session has no interactive answerer`)
      return 'rejected'
    }
    return waitingFor(host, async () => kit.askApproval({ toolName: request.toolName, reason: request.reason }, request.signal))
  })
  ctx.on('user-questions/request', async request => {
    if (plain) return { answers: request.questions.map(question => ({ id: question.id, selected: [] as string[] })) }
    const answers: readonly QuestionAnswerItem[] = await waitingFor(host, async () => kit.askQuestions({
      questions: request.questions.map(question => ({
        id: question.id,
        header: question.header,
        question: question.question,
        detail: question.detail,
        multiSelect: question.multiSelect === true,
        options: (question.options ?? []).map(option => ({ label: option.label, description: option.description })),
      })),
    }, request.signal))
    return {
      answers: answers.map(answer => ({
        id: answer.id,
        selected: [...answer.selected],
        ...answer.custom === undefined ? {} : { custom: answer.custom },
      })),
    }
  })

  if (!plain) kit.start()
  await openSession(host, config.resume, config.model)
  if (!plain) {
    publish(host, { type: 'hint', hint: '输入任务，/help 看命令' })
    // Late plugin output can land after the first frame; a couple of repaints
    // make sure the editor region is the one the operator ends up seeing.
    for (const delay of [150, 600, 1500]) {
      setTimeout(() => { kit.refresh(true) }, delay)
    }
  }
  if (host.runtime === undefined) throw new Error('tui-host: no session was opened')
  if (plain) await readPlainInput(host)
}

/** The approval policy values `/approve` accepts, for the command parser. */
export const APPROVE_POLICIES: readonly ApprovalPolicy[] = APPROVAL_POLICIES

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
    if (text === '/exit' || text === '/quit' || text === '/q') break
    await submit(host, text)
    await host.runtime?.agent.whenIdle()
    host.runtime?.refreshUsage()
  }
  await host.runtime?.dispose()
  host.ctx.get('appExit')?.(host.failed ? 1 : 0)
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