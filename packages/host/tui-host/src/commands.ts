/**
 * Slash commands the terminal owns. They are parsed here, away from the
 * terminal and the agent, so the dispatch table can be tested as data.
 * @module @deepseek-ai/dsh-tui-host/commands
 */

/** Help text shown by `/help`. */
/**
 * Every command the composer offers, as the `/` menu lists it. The name has no
 * leading slash, so the editor's completion inserts it after the slash the
 * operator typed.
 */
export const COMMANDS: readonly { readonly name: string; readonly description: string }[] = [
  { name: 'help', description: '显示命令列表' },
  { name: 'status', description: '打印会话事实（id、标题、模型、cwd、上下文）' },
  { name: 'budget', description: '测量系统提示装配与上下文占用' },
  { name: 'stop', description: '取消当前回合（ctrl+c 亦可）' },
  { name: 'new', description: '开一个新会话' },
  { name: 'sessions', description: '列出最近 50 个会话' },
  { name: 'resume', description: '恢复会话：/resume [id|last|pick]' },
  { name: 'model', description: '切换模型：/model [name]' },
  { name: 'approve', description: '切换审批策略：/approve [ask|never]' },
  { name: 'exit', description: '退出（/q 亦可）' },
]

export const HELP_TEXT = [
  '/help            显示本列表',
  '/exit  (/q)      退出（空输入框按两次 ctrl+c 亦可）',
  '/stop            取消当前回合（ctrl+c 亦可）',
  '/new             开一个新会话',
  '/resume [id|last|pick]  恢复会话；无参或 pick 打开选择器',
  '/sessions        列出最近 50 个会话',
  '/model [name]    切换模型；无参打开模型选择器',
  '/approve [ask|never]  切换审批策略；无参打开选择器',
  '/status          打印会话事实',
  '/budget          测量系统提示装配与上下文占用',
].join('\n')

/** What the terminal should do with one submitted line. */
export type CommandResult =
  | { readonly kind: 'prompt'; readonly text: string }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit' }
  | { readonly kind: 'stop' }
  | { readonly kind: 'new' }
  | { readonly kind: 'sessions' }
  | { readonly kind: 'resume'; readonly sessionId: string }
  | { readonly kind: 'model'; readonly model: string }
  | { readonly kind: 'approve'; readonly policy: 'ask' | 'never' | 'pick' }
  | { readonly kind: 'status' }
  | { readonly kind: 'budget' }
  | { readonly kind: 'error'; readonly text: string }

/**
 * Classify one submitted line.
 * @param input - the trimmed line the operator submitted.
 * @returns the command to run, or `prompt` carrying the text to send to the model.
 */
export function parseCommand(input: string): CommandResult {
  if (!input.startsWith('/')) return { kind: 'prompt', text: input }
  const space = input.indexOf(' ')
  const name = (space === -1 ? input.slice(1) : input.slice(1, space)).toLowerCase()
  const argument = space === -1 ? '' : input.slice(space + 1).trim()
  switch (name) {
    case 'help':
    case '?':
      return { kind: 'help' }
    case 'exit':
    case 'quit':
    case 'q':
      return { kind: 'exit' }
    case 'stop':
      return { kind: 'stop' }
    case 'new':
    case 'clear':
      return { kind: 'new' }
    case 'sessions':
    case 'ls':
      return { kind: 'sessions' }
    case 'status':
      return { kind: 'status' }
    case 'budget':
      return { kind: 'budget' }
    case 'resume':
      return argument === '' ? { kind: 'resume', sessionId: 'pick' } : { kind: 'resume', sessionId: argument }
    case 'model':
      return argument === '' ? { kind: 'model', model: 'pick' } : { kind: 'model', model: argument }
    case 'approve':
      if (argument === '' || argument === 'pick') return { kind: 'approve', policy: 'pick' }
      if (argument === 'ask' || argument === 'never') return { kind: 'approve', policy: argument }
      return { kind: 'error', text: 'usage: /approve [ask|never]' }
    default:
      return { kind: 'error', text: `unknown command /${name} — try /help` }
  }
}