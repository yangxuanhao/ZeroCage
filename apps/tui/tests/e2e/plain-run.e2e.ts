#!/usr/bin/env node
/**
 * End-to-end run without a provider key: a scripted Messages endpoint stands in
 * for the model, so the real agent loop, the real tools, the real session log,
 * and the real plain-output sink all execute. Assertions are on observable
 * stdout, not on internals.
 *
 *   node --import tsx/esm apps/tui/tests/e2e/plain-run.e2e.ts
 *
 * Exits 0 when the run produced a tool card and the scripted answer, and
 * prints the whole transcript when it did not.
 * @module @deepseek-ai/zerocage/tests/e2e/plain-run
 */

import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startMockLlmServer } from '@deepseek-ai/dsh-llm-mock-server'

/** Repository root, so the child can load the source entry from any cwd. */
const REPO_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))

/** The tsx ESM loader, resolved once here where the package is installed. */
const TSX_LOADER = import.meta.resolve('tsx/esm')

/** Everything the child printed. */
interface RunResult {
  readonly code: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Run the zerocage entry in plain mode and feed it the given lines. */
function runZerocage(options: {
  readonly cwd: string
  readonly home: string
  readonly baseUrl: string
  readonly lines: readonly string[]
}): Promise<RunResult> {
  const child = spawn(
    process.execPath,
    ['--import', TSX_LOADER, join(REPO_ROOT, 'apps', 'tui', 'src', 'bin.ts'), '--plain'],
    {
      cwd: options.cwd,
      env: {
        ...process.env,
        DSH_HOME: options.home,
        DEEPSEEK_BASE_URL: `${options.baseUrl}/v1`,
        DEEPSEEK_API_KEY: 'mock-key',
        NO_COLOR: '1',
        // The child runs in a throwaway workspace, so tsx must be told which
        // tsconfig carries the workspace path aliases.
        TSX_TSCONFIG_PATH: join(REPO_ROOT, 'tsconfig.json'),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
  child.stdin.write(`${options.lines.join('\n')}\n`)
  child.stdin.end()
  return new Promise(resolve => {
    child.on('close', (code: number | null) => resolve({ code, stdout, stderr }))
  })
}

/** Report and exit 1 when a required fragment is missing. */
function expectFragment(haystack: string, needle: string, label: string, transcript: string): void {
  if (haystack.includes(needle)) {
    process.stdout.write(`ok   ${label}\n`)
    return
  }
  process.stdout.write(`FAIL ${label}: stdout did not contain ${JSON.stringify(needle)}\n\n--- transcript ---\n${transcript}\n`)
  process.exitCode = 1
}

const root = mkdtempSync(join(tmpdir(), 'zerocage-e2e-'))
const workspace = join(root, 'workspace')
const home = join(root, 'home')
mkdirSync(workspace, { recursive: true })
mkdirSync(home, { recursive: true })
const samplePath = join(workspace, 'sample.txt')
writeFileSync(samplePath, 'zero cage sample payload\n', 'utf8')

const server = await startMockLlmServer({
  sequence: ['tool_call_success', 'success'],
  apiKey: 'mock-key',
  successText: 'E2E-FINAL-ANSWER: the sample file was read.',
  toolName: 'read',
  toolArguments: JSON.stringify({ file_path: samplePath }),
})

process.stdout.write(`mock llm at ${server.baseURL}, workspace ${workspace}\n`)
const result = await runZerocage({
  cwd: workspace,
  home,
  baseUrl: server.baseURL,
  lines: ['read sample.txt and report the payload', '/exit'],
})
await server.close()

process.stdout.write(`child exit code ${String(result.code)}\n`)
if (result.stderr.trim() !== '') process.stdout.write(`--- child stderr ---\n${result.stderr}\n`)
if (process.env.ZEROCAGE_E2E_VERBOSE === '1') process.stdout.write(`--- transcript ---\n${result.stdout}\n`)

expectFragment(result.stdout, 'read sample.txt and report the payload', 'user prompt rendered', result.stdout)
expectFragment(result.stdout, 'read', 'tool card rendered', result.stdout)
expectFragment(result.stdout, 'zero cage sample payload', 'tool result rendered', result.stdout)
expectFragment(result.stdout, 'E2E-FINAL-ANSWER', 'final answer rendered', result.stdout)
if (result.code === 0) process.stdout.write('ok   child exited 0\n')
else {
  process.stdout.write(`FAIL child exited ${String(result.code)}\n`)
  process.exitCode = 1
}
process.stdout.write(`requests served: ${String(server.requests.length)}\n`)
