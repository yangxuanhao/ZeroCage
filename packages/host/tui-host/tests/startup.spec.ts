import { describe, expect, it } from 'vitest'
import { parseTuiArgs, USAGE } from '../src/startup.ts'

describe('parseTuiArgs', () => {
  it('reads the resume id and model override', () => {
    expect(parseTuiArgs(['--resume', 'session-1', '--model', 'p/m'])).toEqual({
      resume: 'session-1',
      model: 'p/m',
      plain: false,
      help: false,
    })
  })

  it('reads the plain and help switches, including the short form', () => {
    expect(parseTuiArgs(['--plain']).plain).toBe(true)
    expect(parseTuiArgs(['--help']).help).toBe(true)
    expect(parseTuiArgs(['-h']).help).toBe(true)
  })

  it('ignores loader flags it does not own', () => {
    expect(parseTuiArgs(['--patch', 'extra.yml'])).toEqual({ resume: undefined, model: undefined, plain: false, help: false })
  })

  it('fails loud when a flag lost its value instead of opening a fresh session', () => {
    expect(() => parseTuiArgs(['--resume', '--plain'])).toThrow(/--resume/)
    expect(() => parseTuiArgs(['--model'])).toThrow(/--model/)
  })

  it('documents every flag in the usage text', () => {
    for (const flag of ['--resume', '--model', '--plain', '--help']) expect(USAGE).toContain(flag)
  })
})
