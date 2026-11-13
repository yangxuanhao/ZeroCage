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
const VALUE_FLAGS = new Set(['--resume', '--model', '--patch', '--profile'])

/** What the invocation asks for. */
export interface Invocation {
  /** `version` and `doctor` short-circuit booting. */
  readonly mode: 'run' | 'version' | 'doctor'
  /** Profile to boot. */
  readonly profile: string
  /** `--patch` overlay paths, in argv order. */
  readonly patches: readonly string[]
  /** Arguments handed to the tree through `ctx.cmdlineArgs`. */
  readonly args: readonly string[]
  /** Optional `doctor` topic: `kernel`, `plugins`, `model`, or `permissions`. */
  readonly doctorTopic: string | undefined
}

/**
 * Parse the ZeroCage command line.
 * @param argv - arguments after the executable (`process.argv.slice(2)`).
 * @returns the invocation to run.
 */
export function parseInvocation(argv: readonly string[]): Invocation {
  if (argv.includes('--version') || argv.includes('-v')) return { mode: 'version', profile: DEFAULT_PROFILE, patches: [], args: [], doctorTopic: undefined }
  const patches: string[] = []
  let profile = DEFAULT_PROFILE
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]
    if (value === '--patch') {
      const patch = argv[index + 1]
      if (patch !== undefined) patches.push(patch)
    }
    if (value === '--profile') {
      const name = argv[index + 1]
      if (name !== undefined && !name.startsWith('--')) profile = name
    }
  }
  const doctorIndex = argv.indexOf('doctor')
  if (doctorIndex !== -1 || argv[0] === 'doctor') {
    const topic = argv[doctorIndex + 1]
    return { mode: 'doctor', profile, patches, args: [], doctorTopic: topic?.startsWith('--') === true ? undefined : topic }
  }
  // Unknown flags stay unread here; the startup row in the tree parses them.
  return { mode: 'run', profile, patches, args: argv.filter((_value, index) => !(index > 0 && VALUE_FLAGS.has(argv[index - 1] ?? ''))) }
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
