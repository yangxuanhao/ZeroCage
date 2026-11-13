/**
 * Slash commands the terminal owns. They are parsed here, away from the
 * terminal and the agent, so the dispatch table can be tested as data.
 * @module @deepseek-ai/dsh-tui-host/commands
 */

/** Help text shown by `/help`. */
export const HELP_TEXT = [
  '/help            show this list',
  '/exit            leave zerocage (ctrl+d on an empty line does the same)',
  '/stop            cancel the running turn (ctrl+c does the same)',
  '/new             start a fresh session in this process',
  '/resume <id|last>  resume a recorded session',
  '/sessions        list recorded sessions',
  '/model <name>    switch model (bare id keeps the provider)',
  '/status          print the session facts the status bar shows',
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
  | { readonly kind: 'status' }
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
      return { kind: 'new' }
    case 'sessions':
    case 'ls':
      return { kind: 'sessions' }
    case 'status':
      return { kind: 'status' }
    case 'resume':
      return argument === '' ? { kind: 'error', text: 'usage: /resume <session-id|last>' } : { kind: 'resume', sessionId: argument }
    case 'model':
      return argument === '' ? { kind: 'error', text: 'usage: /model <model-id>' } : { kind: 'model', model: argument }
    default:
      return { kind: 'error', text: `unknown command /${name} — try /help` }
  }
}
