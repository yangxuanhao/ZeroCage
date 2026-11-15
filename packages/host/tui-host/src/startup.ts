/**
 * The terminal app's own flag surface. The launcher hands every inner argument
 * to `ctx.cmdlineArgs`; this provider parses them once and publishes an
 * ordinary Cordis service, so the host row reads parsed values instead of
 * re-parsing argv (the same split `dsh-headless/startup` uses).
 * @module @deepseek-ai/dsh-tui-host/startup
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-cmdline'

/** Parsed terminal flags. */
export interface TuiStartupOptions {
  /** Session id to resume. */
  resume?: string
  /** `provider/model` or a bare model id. */
  model?: string
  /** Print plain lines instead of taking over the terminal. */
  plain: boolean
  /** Print usage instead of starting a conversation. */
  help: boolean
}

/** Stable Cordis plugin name. */
export const name = 'tui-startup'

/** The launcher must publish the argument snapshot before this row mounts. */
export const inject = ['cmdlineArgs']

export const Config: z<TuiStartupOptions> = z.object({
  resume: z.string(),
  model: z.string(),
  plain: z.boolean().default(false),
  help: z.boolean().default(false),
})

/** Terminal usage text. */
export const USAGE = [
  'zerocage — a terminal coding agent on the DeepSeek Harness core',
  '',
  'usage: zerocage [options]',
  '',
  'options:',
  '  --resume <session-id>  resume a recorded session',
  '  --model <id>           provider/model or a bare model id',
  '  --plain                print plain lines instead of a fullscreen terminal UI',
  '  --help                 show this text',
  '',
  'commands inside the terminal: /help, /status, /stop, /new, /sessions, /resume, /model, /exit',
].join('\n')

/** Read the value that follows `flag`, if present. */
function valueAfter(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('-')) {
    // Silently dropping the value would open a new session while the operator
    // believes they resumed one.
    throw new Error(`${flag} 需要一个值；用 \`zerocage --help\` 看用法`)
  }
  return value
}

/**
 * Parse the terminal's flags.
 * @param args - the invocation's inner arguments, in argv order.
 * @returns the parsed options; unknown flags are ignored so the loader's own
 *   flags (`--patch`) stay available.
 */
export function parseTuiArgs(args: readonly string[]): TuiStartupOptions {
  const resume = valueAfter(args, '--resume')
  const model = valueAfter(args, '--model')
  return {
    ...resume === undefined ? {} : { resume },
    ...model === undefined ? {} : { model },
    plain: args.includes('--plain'),
    help: args.includes('--help') || args.includes('-h'),
  }
}
declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Parsed terminal flags, provided before the host row mounts. */
    tuiStartup?: TuiStartupOptions
  }
}

/**
 * Publish the parsed flags.
 * @param ctx - plugin context carrying the launcher's argument snapshot.
 * @param config - static override from the profile patch; flags win.
 */
export function apply(ctx: Context, config: TuiStartupOptions): void {
  const args = ctx.cmdlineArgs?.get() ?? []
  const parsed = parseTuiArgs(args)
  const resume = parsed.resume ?? config.resume
  const model = parsed.model ?? config.model
  ctx.provide('tuiStartup', {
    ...resume === undefined ? {} : { resume },
    ...model === undefined ? {} : { model },
    plain: parsed.plain || config.plain,
    help: parsed.help || config.help,
  })
  if (parsed.help || config.help) {
    process.stdout.write(`${USAGE}\n`)
    ctx.get('appExit')?.(0)
  }
}