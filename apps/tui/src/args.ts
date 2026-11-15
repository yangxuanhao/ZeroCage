/**
 * ZeroCage command-line entry. It owns three things the tree cannot know about
 * itself: where the harness home lives, which profile this binary boots, and
 * the pre-boot diagnostics (`--version`, `doctor`). Everything else — flags,
 * plugins, sessions — belongs to the mounted profile.
 * @module @deepseek-ai/zerocage/bin
 */

import { homedir } from 'node:os'
import { join } from 'node:path'

/** The profile this binary boots; an operator can override it with `--profile`. */
export const DEFAULT_PROFILE = 'tui'

/** ZeroCage's own release version, independent of the harness core it carries. */
export const ZEROCAGE_VERSION = '0.1.0'

/** Flags that consume the following argument as their value. */
export const VALUE_FLAGS: ReadonlySet<string> = new Set(['--resume', '--model', '--patch', '--profile'])

/** Usage text, printed before any profile work. */
export const USAGE = [
  'zerocage — 终端 coding agent（DeepSeek Harness 内核）',
  '',
  '用法: zerocage [选项]',
  '',
  '选项:',
  '  --resume <session-id>  恢复指定会话',
  '  --model <provider/model>  指定模型路由（裸 id 保留 provider）',
  '  --plain                纯文本逐行输出（管道 / CI / 日志）',
  '  --patch <file>         叠加一个 cordis 补丁层（可重复）',
  '  --profile <name>       指定 profile（默认 tui）',
  '  --version, -v          打印版本与内核版本',
  '  doctor [topic]         诊断：kernel | plugins | model | permissions',
  '  --help, -h             本说明',
  '',
  '终端内命令: /help /status /budget /stop /new /sessions /resume /model /approve /exit',
].join('\n')

/** What the invocation asks for. */
export interface Invocation {
  /** `version`, `help`, `doctor`, `error` short-circuit booting; `run` boots the profile. */
  readonly mode: 'run' | 'version' | 'help' | 'doctor' | 'error'
  /** Profile to boot. */
  readonly profile: string
  /** `--patch` overlay paths, in argv order. */
  readonly patches: readonly string[]
  /** Arguments handed to the tree through `ctx.cmdlineArgs`. */
  readonly args: readonly string[]
  /** Optional `doctor` topic. */
  readonly doctorTopic: string | undefined
  /** Message for the `error` mode. */
  readonly error: string | undefined
}

/** The value that follows `flag`, or an error when it is missing. */
function valueOf(argv: readonly string[], flag: string): { value: string | undefined; error: string | undefined } {
  const index = argv.indexOf(flag)
  if (index === -1) return { value: undefined, error: undefined }
  const value = argv[index + 1]
  if (value === undefined || value.startsWith('-')) {
    return { value: undefined, error: `${flag} 需要一个值（当前缺失）` }
  }
  return { value, error: undefined }
}

/**
 * Parse the ZeroCage command line.
 * @param argv - arguments after the executable (`process.argv.slice(2)`).
 * @returns the invocation to run.
 */
export function parseInvocation(argv: readonly string[]): Invocation {
  const base = { profile: DEFAULT_PROFILE, patches: [] as string[], args: [] as string[], doctorTopic: undefined, error: undefined }
  if (argv.includes('--version') || argv.includes('-v')) return { ...base, mode: 'version' }
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') return { ...base, mode: 'help' }
  // Only the leading word is the subcommand: a task that happens to contain
  // "doctor" must reach the model.
  if (argv[0] === 'doctor') {
    const topic = argv[1]
    const known = topic === 'kernel' || topic === 'plugins' || topic === 'model' || topic === 'permissions'
    return { ...base, mode: 'doctor', doctorTopic: known ? topic : undefined }
  }
  const patches: string[] = []
  let profile = DEFAULT_PROFILE
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--patch' && argv[index + 1] !== undefined && !argv[index + 1]?.startsWith('-')) patches.push(String(argv[index + 1]))
    if (value === '--profile' && argv[index + 1] !== undefined && !argv[index + 1]?.startsWith('-')) profile = String(argv[index + 1])
  }
  const resume = valueOf(argv, '--resume')
  const model = valueOf(argv, '--model')
  const firstError = resume.error ?? model.error
  if (firstError !== undefined) return { ...base, mode: 'error', profile, patches, error: firstError }
  // Every argument reaches the tree unchanged: the app's startup row parses its
  // own flags from `ctx.cmdlineArgs`, and the launcher has no opinion on them.
  return { mode: 'run', profile, patches, args: [...argv], doctorTopic: undefined, error: undefined }
}

/**
 * Point the harness at ZeroCage's own home unless the operator chose one.
 * @param env - process environment, mutated in place.
 * @returns the resolved home directory.
 */
export function resolveHome(env: NodeJS.ProcessEnv): string {
  const configured = env.DSH_HOME
  if (configured === undefined || configured === '') {
    const fallback = join(homedir(), '.zerocage')
    env.DSH_HOME = fallback
    return fallback
  }
  return configured
}