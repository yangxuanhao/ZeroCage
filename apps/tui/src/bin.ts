#!/usr/bin/env node
/**
 * The `zerocage` executable: resolve the harness home, answer pre-boot
 * questions (`--version`, `doctor`), or hand the profile boot to the shared
 * launcher. This file is the only place the binary's identity is decided.
 * @module @deepseek-ai/zerocage/bin
 */

import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDshRuntimeVersion, loadLayeredEnv, StartupError } from '@deepseek-ai/dsh-app-boot'
import { runProfile } from '@deepseek-ai/dsh/profile-boot'
import { DEFAULT_PROFILE, parseInvocation, resolveHome, ZEROCAGE_VERSION } from './args.ts'
import { collectDoctorSections, formatDoctor } from './doctor.ts'

/** Installation root: `apps/tui/src` and `apps/tui/lib` both sit three levels below it. */
const INSTALL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Print the versions an operator quotes in a bug report.
 * @returns the text to print.
 */
function versionText(): string {
  return [
    `zerocage ${ZEROCAGE_VERSION}`,
    `dsh-core ${getDshRuntimeVersion()}`,
    `node ${process.version}`,
    `protocol session-format (see @deepseek-ai/dsh-session)`,
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
  try {
    await runProfile({
      environment: loadLayeredEnv('dsh'),
      profile: invocation.profile === '' ? DEFAULT_PROFILE : invocation.profile,
      patchFiles: invocation.patches,
      args: invocation.args,
    })
  } catch (error) {
    if (error instanceof StartupError) {
      process.stderr.write(`zerocage: startup failed: ${error.message}\n`)
      return 1
    }
    throw error
  }
  return 0
}

const code = await main()
if (code !== 0) process.exitCode = code
