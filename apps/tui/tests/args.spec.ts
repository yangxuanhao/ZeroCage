import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE, parseInvocation, resolveHome, USAGE, ZEROCAGE_VERSION } from '../src/args.ts'
import { collectDoctorSections, formatDoctor, readJson } from '../src/doctor.ts'

describe('parseInvocation', () => {
  it('defaults to booting the tui profile with no overlays', () => {
    expect(parseInvocation([])).toEqual({
      mode: 'run',
      profile: DEFAULT_PROFILE,
      patches: [],
      args: [],
      doctorTopic: undefined,
      error: undefined,
    })
  })

  it('short-circuits version and help before any profile work', () => {
    expect(parseInvocation(['--version']).mode).toBe('version')
    expect(parseInvocation(['-v']).mode).toBe('version')
    expect(parseInvocation(['--help']).mode).toBe('help')
    expect(parseInvocation(['-h']).mode).toBe('help')
    expect(parseInvocation(['help']).mode).toBe('help')
  })

  it('reads doctor only as the leading subcommand, with an optional known topic', () => {
    expect(parseInvocation(['doctor'])).toMatchObject({ mode: 'doctor', doctorTopic: undefined })
    expect(parseInvocation(['doctor', 'model'])).toMatchObject({ mode: 'doctor', doctorTopic: 'model' })
    expect(parseInvocation(['doctor', 'unknown']).doctorTopic).toBeUndefined()
    // A task that mentions doctor is a task.
    expect(parseInvocation(['fix the doctor page']).mode).toBe('run')
  })

  it('rejects a flag that lost its value instead of silently continuing', () => {
    expect(parseInvocation(['--resume']).mode).toBe('error')
    expect(parseInvocation(['--resume']).error).toContain('--resume')
    expect(parseInvocation(['--model', '--plain']).mode).toBe('error')
  })

  it('collects patch overlays and a profile override', () => {
    const invocation = parseInvocation(['--patch', 'a.yml', '--patch', 'b.yml', '--profile', 'web'])
    expect(invocation.patches).toEqual(['a.yml', 'b.yml'])
    expect(invocation.profile).toBe('web')
  })

  it('hands every argument to the tree unchanged', () => {
    const invocation = parseInvocation(['--resume', 'session-1', '--plain', '--patch', 'x.yml'])
    expect(invocation.args).toEqual(['--resume', 'session-1', '--plain', '--patch', 'x.yml'])
  })

  it('keeps positional arguments', () => {
    expect(parseInvocation(['read the file']).args).toEqual(['read the file'])
  })

  it('documents every flag in the usage text', () => {
    for (const flag of ['--resume', '--model', '--plain', '--patch', '--profile', '--version', '--help', 'doctor']) {
      expect(USAGE).toContain(flag)
    }
  })
})

describe('resolveHome', () => {
  it('falls back to the ZeroCage home and remembers it', () => {
    const env: NodeJS.ProcessEnv = {}
    const home = resolveHome(env)
    expect(home.endsWith('.zerocage')).toBe(true)
    expect(env.DSH_HOME).toBe(home)
  })

  it('keeps an explicit home', () => {
    const env: NodeJS.ProcessEnv = { DSH_HOME: 'C:\\custom' }
    expect(resolveHome(env)).toBe('C:\\custom')
  })
})

describe('doctor', () => {
  it('reports the four sections from real files', () => {
    const root = mkdtempSync(join(tmpdir(), 'zerocage-doctor-'))
    const home = join(root, 'home')
    const profileDir = join(home, 'profiles', 'tui')
    mkdirSync(profileDir, { recursive: true })
    writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
      dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-tui-app'] } },
    }))
    writeFileSync(join(home, 'settings.json'), JSON.stringify({ agentDefaultModel: { provider: 'deepseek-official', model: 'deepseek-flash' } }))
    mkdirSync(join(root, 'apps', 'cli'), { recursive: true })
    writeFileSync(join(root, 'apps', 'cli', 'package.json'), JSON.stringify({ version: '0.2.2-rc.3' }))

    const sections = collectDoctorSections({
      home,
      profileDir,
      profile: 'tui',
      installRoot: root,
      zerocageVersion: ZEROCAGE_VERSION,
      env: { DEEPSEEK_API_KEY: 'k' },
    })
    expect(sections.map(section => section.title)).toEqual(['kernel', 'plugins', 'model', 'permissions'])
    const text = formatDoctor(sections)
    expect(text).toContain('0.2.2-rc.3')
    expect(text).toContain('@deepseek-ai/dsh-tui-app')
    expect(text).toContain('deepseek-official/deepseek-flash')
    expect(text).toContain('danger-full-access')
    expect(text).toContain('never')
  })

  it('reports a missing profile and malformed settings instead of throwing', () => {
    const root = mkdtempSync(join(tmpdir(), 'zerocage-doctor-empty-'))
    const home = join(root, 'home')
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, 'settings.json'), '{ not json')
    const sections = collectDoctorSections({
      home,
      profileDir: join(home, 'profiles', 'tui'),
      profile: 'tui',
      installRoot: root,
      zerocageVersion: ZEROCAGE_VERSION,
      env: {},
    })
    const text = formatDoctor(sections)
    expect(text).toContain('no (created on first run)')
    expect(text).toContain('none')
    expect(readJson(join(home, 'settings.json'))).toBeUndefined()
  })

  it('reports the environment credential source', () => {
    const root = mkdtempSync(join(tmpdir(), 'zerocage-doctor-cred-'))
    const sections = collectDoctorSections({
      home: root,
      profileDir: root,
      profile: 'tui',
      installRoot: root,
      zerocageVersion: ZEROCAGE_VERSION,
      env: { DEEPSEEK_API_KEY: 'secret' },
    })
    expect(formatDoctor(sections)).toContain('DEEPSEEK_API_KEY present')
  })
})
