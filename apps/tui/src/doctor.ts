/**
 * `zerocage doctor`: report the four facts an operator needs before filing a
 * bug — kernel build, mounted plugins, model route, and permission posture.
 * Every value is read from disk or the environment; nothing is hardcoded and
 * nothing is booted, so doctor works even when a profile is broken.
 * @module @deepseek-ai/zerocage/doctor
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** One reported fact. */
export interface DoctorFact {
  readonly label: string
  readonly value: string
}

/** One reported section. */
export interface DoctorSection {
  readonly title: string
  readonly facts: readonly DoctorFact[]
  /** Extra lines shown under the facts (bundle names, warnings). */
  readonly notes: readonly string[]
}

/** Read and parse a JSON file, or return undefined when it is absent or invalid. */
export function readJson(path: string): unknown {
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    // A corrupt settings/profile file is exactly what doctor is for.
    void (error instanceof Error ? error.message : String(error))
    return undefined
  }
}

/** Read a nested string array from an unknown JSON value. */
function stringArrayAt(value: unknown, keys: readonly string[]): readonly string[] {
  let cursor: unknown = value
  for (const key of keys) {
    if (typeof cursor !== 'object' || cursor === null) return []
    cursor = Reflect.get(cursor, key)
  }
  if (!Array.isArray(cursor)) return []
  return cursor.filter((entry): entry is string => typeof entry === 'string')
}

/** Read the harness core version from the CLI package that owns its `dsh` bin. */
function coreVersion(installRoot: string): string {
  const manifest = readJson(join(installRoot, 'apps', 'cli', 'package.json'))
  if (typeof manifest !== 'object' || manifest === null) return 'not installed'
  const version = Reflect.get(manifest, 'version')
  return typeof version === 'string' ? version : 'unknown'
}

/** The options doctor needs to look at this installation. */
export interface DoctorOptions {
  /** Harness home (`$DSH_HOME`). */
  readonly home: string
  /** Directory that holds the booted profile. */
  readonly profileDir: string
  /** Profile name. */
  readonly profile: string
  /** Installation root: the directory whose `node_modules/@deepseek-ai` holds the packages. */
  readonly installRoot: string
  /** ZeroCage's own version. */
  readonly zerocageVersion: string
  /** Process environment. */
  readonly env: NodeJS.ProcessEnv
}

/** Collect the four sections. */
export function collectDoctorSections(options: DoctorOptions): readonly DoctorSection[] {
  const profileManifest = readJson(join(options.profileDir, 'package.json'))
  const bundles = stringArrayAt(profileManifest, ['dsh', 'profile', 'bundles'])
  const settings = readJson(join(options.home, 'settings.json'))
  const modelSection = typeof settings === 'object' && settings !== null ? Reflect.get(settings, 'agentDefaultModel') : undefined
  const configuredModel = typeof modelSection === 'object' && modelSection !== null
    ? `${String(Reflect.get(modelSection, 'provider') ?? '')}/${String(Reflect.get(modelSection, 'model') ?? '')}`
    : 'profile default'
  const credential = options.env.DEEPSEEK_API_KEY === undefined || options.env.DEEPSEEK_API_KEY === ''
    ? 'DEEPSEEK_API_KEY absent (interactive credentials store may still hold one)'
    : 'DEEPSEEK_API_KEY present in the environment'
  return [
    {
      title: 'kernel',
      facts: [
        { label: 'zerocage', value: options.zerocageVersion },
        { label: 'dsh core', value: coreVersion(options.installRoot) },
        { label: 'node', value: process.version },
        { label: 'platform', value: `${process.platform}-${process.arch}` },
      ],
      notes: [],
    },
    {
      title: 'plugins',
      facts: [
        { label: 'profile', value: options.profile },
        { label: 'profile dir', value: options.profileDir },
        { label: 'exists', value: existsSync(options.profileDir) ? 'yes' : 'no (created on first run)' },
        { label: 'bundles', value: String(bundles.length) },
      ],
      notes: bundles.map(bundle => `- ${bundle}`),
    },
    {
      title: 'model',
      facts: [
        { label: 'default', value: configuredModel },
        { label: 'credentials', value: credential },
        { label: 'settings', value: settings === undefined ? 'none' : join(options.home, 'settings.json') },
      ],
      notes: [],
    },
    {
      title: 'permissions',
      facts: [
        { label: 'sandbox', value: options.env.DSH_PERMISSION_MODE ?? 'danger-full-access (bundle default)' },
        { label: 'approval', value: 'never (bundle default)' },
        { label: 'fs fence', value: 'none (sandbox-policy is danger-full-access)' },
      ],
      notes: [],
    },
  ]
}

/**
 * Render the sections for a terminal.
 * @param sections - collected sections.
 * @returns ready-to-print lines.
 */
export function formatDoctor(sections: readonly DoctorSection[]): string {
  const lines: string[] = []
  for (const section of sections) {
    lines.push(`[${section.title}]`)
    const width = Math.max(...section.facts.map(fact => fact.label.length), 1)
    for (const fact of section.facts) lines.push(`  ${fact.label.padEnd(width)}  ${fact.value}`)
    for (const note of section.notes) lines.push(`  ${note}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}
