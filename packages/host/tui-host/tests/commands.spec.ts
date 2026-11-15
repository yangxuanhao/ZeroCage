import { describe, expect, it } from 'vitest'
import { HELP_TEXT, parseCommand } from '../src/commands.ts'

describe('parseCommand', () => {
  it('treats a plain line as a prompt', () => {
    expect(parseCommand('fix the tests')).toEqual({ kind: 'prompt', text: 'fix the tests' })
  })

  it('recognizes the terminal commands, with aliases', () => {
    expect(parseCommand('/help').kind).toBe('help')
    expect(parseCommand('/?').kind).toBe('help')
    expect(parseCommand('/exit').kind).toBe('exit')
    expect(parseCommand('/quit').kind).toBe('exit')
    expect(parseCommand('/q').kind).toBe('exit')
    expect(parseCommand('/stop').kind).toBe('stop')
    expect(parseCommand('/new').kind).toBe('new')
    expect(parseCommand('/sessions').kind).toBe('sessions')
    expect(parseCommand('/ls').kind).toBe('sessions')
    expect(parseCommand('/status').kind).toBe('status')
    expect(parseCommand('/budget').kind).toBe('budget')
  })

  it('reads the approval policy and rejects an unknown one', () => {
    expect(parseCommand('/approve ask')).toEqual({ kind: 'approve', policy: 'ask' })
    expect(parseCommand('/approve never')).toEqual({ kind: 'approve', policy: 'never' })
    expect(parseCommand('/approve')).toEqual({ kind: 'approve', policy: 'pick' })
    expect(parseCommand('/approve maybe')).toEqual({ kind: 'error', text: 'usage: /approve [ask|never]' })
  })

  it('is case insensitive on the command name and keeps the argument', () => {
    expect(parseCommand('/MODEL gpt-5')).toEqual({ kind: 'model', model: 'gpt-5' })
    expect(parseCommand('/Resume session-1')).toEqual({ kind: 'resume', sessionId: 'session-1' })
  })

  it('opens the interactive picker when no argument is given', () => {
    expect(parseCommand('/model')).toEqual({ kind: 'model', model: 'pick' })
    expect(parseCommand('/resume')).toEqual({ kind: 'resume', sessionId: 'pick' })
  })

  it('rejects an unknown command and names it', () => {
    expect(parseCommand('/nope')).toEqual({ kind: 'error', text: 'unknown command /nope — try /help' })
  })

  it('lists every command in the help text, including the aliases', () => {
    for (const command of ['/help', '/exit', '/stop', '/new', '/resume', '/sessions', '/model', '/approve', '/status', '/budget']) {
      expect(HELP_TEXT).toContain(command)
    }
  })
})
