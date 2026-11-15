#!/usr/bin/env node
/**
 * The `zerocage` executable: resolve the harness home, answer pre-boot
 * questions (`--version`, `--help`, `doctor`), or hand the profile boot to the
 * shared launcher. This file is the only place the binary's identity is decided.
 * @module @deepseek-ai/zerocage/bin
 */

import { openSync, writeSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDshRuntimeVersion, loadLayeredEnv } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { DEFAULT_PROFILE, parseInvocation, resolveHome, USAGE, ZEROCAGE_VERSION } from './args.ts'
import { collectDoctorSections, formatDoctor } from './doctor.ts'

/** Installation root: `apps/tui/src` and `apps/tui/lib` both sit three levels below it. */
const INSTALL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/** The armour bundle's host-probe complaint, which cannot apply to a source run. */
const ARMOUR_HOST_WARNING = /未定位到宿主目录/u

/** The account adapter's catalog-count line, which is not an operator concern. */
const CATALOG_INFO = /^\[llm-deepseek-account\] model listing from/u

/** Restores whatever the early terminal takeover changed. */
let restoreTerminal: (() => void) | undefined

/**
 * Stop the terminal from echoing keys typed while plugins mount. Only raw mode
 * is touched here: resuming stdin or switching screens this early leaves the
 * stream in a state pi-tui cannot take over, and keys then never reach the
 * editor. The alternate screen and the first clear belong to the kit.
 */
function takeTerminalEarly(): void {
  if (process.stdin.isTTY !== true) return
  if (process.env.ZEROCAGE_NO_EARLY_TERMINAL === '1') return
  try {
    process.stdin.setRawMode(true)
  } catch (error) {
    // A stdin that refuses raw mode still works; it just echoes during boot.
    void (error instanceof Error ? error.message : String(error))
  }
  restoreTerminal = () => {
    try {
      process.stdin.setRawMode(false)
    } catch (error) {
      void (error instanceof Error ? error.message : String(error))
    }
  }
}

/** Report a startup failure with the next command to try, not a raw stack. */
function reportFailure(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  const lines = ['zerocage: 启动失败', `  ${message.split('\n')[0] ?? message}`]
  if (/\.node\b|node-addon|system\.node/u.test(message)) {
    lines.push('  原生加载器缺失：先运行 `pnpm run build:native-system`（需要本机 C++ 工具链），再重试。')
  } else if (/Cannot find (module|package) '?(tsx|@deepseek-ai)/u.test(message)) {
    lines.push('  依赖未安装或不完整：在仓库根目录运行 `pnpm install`。')
  } else if (/profile|bundle/u.test(message)) {
    lines.push('  配置问题：`zerocage doctor plugins` 查看 profile 与 bundle 列表。')
  }
  lines.push('  诊断：`zerocage doctor`；版本：`zerocage --version`。')
  process.stderr.write(`${lines.join('\n')}\n`)
}

/**
 * Drop two boot-time lines that cannot help an operator: the armour bundle
 * looking for a desktop host it will never find here, and the account adapter's
 * model-catalog count. Everything else still reaches stderr, and
 * `ZEROCAGE_DEBUG=1` restores both.
 */
function silenceBootNoise(): void {
  const originalWarn = console.warn.bind(console)
  const originalError = console.error.bind(console)
  console.warn = (...args: unknown[]): void => {
    const text = args.map(value => (typeof value === 'string' ? value : String(value))).join(' ')
    const quiet = ARMOUR_HOST_WARNING.test(text) || CATALOG_INFO.test(text) || text.includes('dsh-purge')
    if (quiet) {
      if (process.env.ZEROCAGE_DEBUG === '1') originalWarn(text)
      return
    }
    originalWarn(...args)
  }
  console.error = (...args: unknown[]): void => {
    const text = args.map(value => (typeof value === 'string' ? value : String(value))).join(' ')
    const quiet = ARMOUR_HOST_WARNING.test(text) || CATALOG_INFO.test(text) || text.includes('dsh-purge')
    if (quiet) {
      if (process.env.ZEROCAGE_DEBUG === '1') originalError(text)
      return
    }
    originalError(...args)
  }
}

/**
 * Send every non-transcript write to a log file while the alternate screen owns
 * the terminal. A logger line landing after the first frame paints over the
 * editor rows and never repaints, which reads as "the input box is stuck".
 * @param home - harness home that owns the log directory.
 * @returns the log path, for the banner and for bug reports.
 */
function redirectLogsWhileFullscreen(home: string): string {
  const path = join(home, 'zerocage-tui.log')
  try {
    // Synchronous appends: a forced exit must not lose the trace that explains
    // the crash.
    const fd = openSync(path, 'a')
    const write = (chunk: string | Uint8Array): boolean => {
      try {
        writeSync(fd, chunk)
      } catch (error) {
        void (error instanceof Error ? error.message : String(error))
      }
      return true
    }
    Object.defineProperty(process.stderr, 'write', { value: write, configurable: true, writable: true })
    process.stderr.write(`\n--- zerocage ${new Date().toISOString()} ---\n`)
    console.warn = (...args: unknown[]): void => {
      write(`${args.map(value => (typeof value === 'string' ? value : String(value))).join(' ')}\n`)
    }
    console.error = (...args: unknown[]): void => {
      write(`${args.map(value => (typeof value === 'string' ? value : String(value))).join(' ')}\n`)
    }
    console.log = (...args: unknown[]): void => {
      write(`${args.map(value => (typeof value === 'string' ? value : String(value))).join(' ')}\n`)
    }
    return path
  } catch (error) {
    void (error instanceof Error ? error.message : String(error))
    return '(log redirection failed)'
  }
}

/**
 * Print the versions an operator quotes in a bug report.
 * @returns the text to print.
 */
function versionText(): string {
  return [
    `zerocage ${ZEROCAGE_VERSION}`,
    `dsh-core ${getDshRuntimeVersion()}`,
    `node ${process.version}`,
    'protocol session-format (see @deepseek-ai/dsh-session)',
  ].join('\n')
}

/**
 * Run one `zerocage` invocation.
 * @returns the process exit code.
 */
async function main(): Promise<number> {
  const invocation = parseInvocation(process.argv.slice(2))
  const home = resolveHome(process.env)
  if (invocation.mode === 'version') {
    process.stdout.write(`${versionText()}\n`)
    return 0
  }
  if (invocation.mode === 'help') {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (invocation.mode === 'error') {
    process.stderr.write(`zerocage: ${invocation.error ?? 'bad arguments'}\n\n${USAGE}\n`)
    return 2
  }
  if (invocation.mode === 'doctor') {
    const sections = collectDoctorSections({
      home,
      profileDir: join(home, 'profiles', invocation.profile),
      profile: invocation.profile,
      installRoot: INSTALL_ROOT,
      zerocageVersion: ZEROCAGE_VERSION,
      env: process.env,
    })
    const selected = invocation.doctorTopic === undefined
      ? sections
      : sections.filter(section => section.title === invocation.doctorTopic)
    process.stdout.write(`${formatDoctor(selected.length > 0 ? selected : sections)}\n`)
    return 0
  }
  const interactive = process.stdin.isTTY === true && !process.argv.includes('--plain')
  silenceBootNoise()
  if (interactive) {
    takeTerminalEarly()
    const logPath = redirectLogsWhileFullscreen(home)
    if (process.env.ZEROCAGE_DEBUG === '1') process.stderr.write(`log: ${logPath}\n`)
  }
  try {
    // `runProfile` resolves once the tree is mounted, not when it shuts down:
    // restoring the terminal here would hand raw mode back to the console while
    // the TUI is still running, and every keystroke would echo into the frame.
    await runProfile({
      environment: loadLayeredEnv('dsh'),
      profile: invocation.profile === '' ? DEFAULT_PROFILE : invocation.profile,
      patchFiles: invocation.patches,
      args: invocation.args,
    })
  } catch (error) {
    reportFailure(error)
    restoreTerminal?.()
    restoreTerminal = undefined
    if (process.env.ZEROCAGE_DEBUG === '1' && error instanceof Error && error.stack !== undefined) {
      process.stderr.write(`${error.stack}\n`)
    }
    return 1
  }
  return 0
}

// The profile owns process lifetime once mounted; this only covers the paths
// that return before a tree exists.
process.on('exit', () => { restoreTerminal?.() })

const code = await main()
if (code !== 0) process.exitCode = code
