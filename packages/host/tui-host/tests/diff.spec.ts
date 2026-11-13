import { describe, expect, it } from 'vitest'
import { diffFromArguments, diffFromOutput, resolveDiff } from '../src/diff.ts'

describe('diffFromArguments', () => {
  it('turns an old/new text pair into deletion and addition lines', () => {
    const diff = diffFromArguments('edit', JSON.stringify({ old_string: 'a\nb', new_string: 'a\nc' }))
    expect(diff).toEqual([
      { kind: 'del', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'a' },
      { kind: 'add', text: 'c' },
    ])
  })

  it('shows whole-file writes as additions', () => {
    const diff = diffFromArguments('write', JSON.stringify({ content: 'one\ntwo\n' }))
    expect(diff).toEqual([{ kind: 'add', text: 'one' }, { kind: 'add', text: 'two' }])
  })

  it('returns nothing for a tool that carries no text pair', () => {
    expect(diffFromArguments('read', JSON.stringify({ file_path: 'a' }))).toEqual([])
  })

  it('returns nothing for arguments that are not JSON yet', () => {
    expect(diffFromArguments('edit', '{"old_string":')).toEqual([])
  })

  it('caps a huge argument diff', () => {
    const big = Array.from({ length: 200 }, (_value, index) => `line ${String(index)}`).join('\n')
    const diff = diffFromArguments('write', JSON.stringify({ content: big }))
    expect(diff).toHaveLength(121)
    expect(diff[diff.length - 1]).toEqual({ kind: 'hunk', text: '… 80 more diff lines' })
  })
})

describe('diffFromOutput', () => {
  it('parses a unified diff', () => {
    const output = ['--- a.ts', '+++ b.ts', '@@ -1,2 +1,2 @@', ' kept', '-old', '+new'].join('\n')
    expect(diffFromOutput(output)).toEqual([
      { kind: 'hunk', text: '@@ -1,2 +1,2 @@' },
      { kind: 'context', text: 'kept' },
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
    ])
  })

  it('ignores ordinary output', () => {
    expect(diffFromOutput('tests passed')).toEqual([])
  })
})

describe('resolveDiff', () => {
  it('prefers the recorded arguments over a diff the tool echoed', () => {
    const args = JSON.stringify({ old_string: 'old', new_string: 'new' })
    expect(resolveDiff('edit', args, '@@ -1 +1 @@\n-x\n+y')).toEqual([
      { kind: 'del', text: 'old' },
      { kind: 'add', text: 'new' },
    ])
  })

  it('falls back to the echoed diff', () => {
    expect(resolveDiff('patch', '{}', '@@ -1 +1 @@\n-x\n+y')).toHaveLength(3)
  })
})
