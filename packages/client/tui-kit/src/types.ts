/**
 * The view model contract between the TUI host (state collection) and this kit
 * (rendering). The host owns every value here; the kit only reads snapshots and
 * asks the host to act through the callbacks in {@link TuiKitOptions}.
 * @module @deepseek-ai/dsh-tui-kit/types
 */

import type { Terminal } from '@deepseek-ai/pi-tui'

/** One rendered line of a unified diff. */
export interface DiffLine {
  readonly kind: 'add' | 'del' | 'context' | 'hunk'
  readonly text: string
}

/** Token and context accounting for the status bar. */
export interface TokenStats {
  /** Input tokens billed by the last request. */
  readonly input: number
  /** Output tokens produced by the last request. */
  readonly output: number
  /** Tokens the context currently holds, as the host measures it. */
  readonly contextUsed: number
  /** The selected model's context window, or 0 when unknown. */
  readonly contextWindow: number
}

/** Conversation status shown in the status bar. */
export type TuiStatus = 'starting' | 'idle' | 'running' | 'waiting' | 'error'

/** A transcript entry. Ordering in {@link TuiViewState.blocks} is display order. */
export type ViewBlock =
  | { readonly kind: 'user'; readonly id: string; readonly turn: number; readonly text: string }
  | {
    readonly kind: 'assistant'
    readonly id: string
    readonly turn: number
    readonly text: string
    readonly reasoning: string
    readonly streaming: boolean
  }
  | {
    readonly kind: 'tool'
    readonly id: string
    readonly turn: number
    readonly name: string
    readonly args: string
    readonly status: 'running' | 'ok' | 'error'
    readonly output: string
    readonly diff: readonly DiffLine[]
  }
  | {
    readonly kind: 'notice'
    readonly id: string
    readonly turn: number
    readonly level: 'info' | 'warn' | 'error'
    readonly text: string
  }

/** Everything the transcript, status bar, and editor need for one frame. */
export interface TuiViewState {
  readonly sessionId: string
  readonly title: string
  readonly model: string
  readonly cwd: string
  readonly status: TuiStatus
  readonly blocks: readonly ViewBlock[]
  /** User messages accepted while a turn is already running. */
  readonly queued: readonly string[]
  readonly tokens: TokenStats
  /** Tool currently executing, for the status bar. */
  readonly currentTool: string | undefined
  /** Last failure message, kept until the next successful turn starts. */
  readonly lastError: string | undefined
  /** Short hint under the editor; the kit appends its own key hints. */
  readonly hint: string | undefined
}

/** An approval the host must surface and answer before the tool runs. */
export interface ApprovalPrompt {
  readonly toolName: string
  readonly reason: string | undefined
}

/** One selectable question option. */
export interface QuestionOption {
  readonly label: string
  readonly description: string | undefined
}

/** One question the model asked through `ask_user`. */
export interface QuestionPromptItem {
  readonly id: string
  readonly header: string | undefined
  readonly question: string
  readonly detail: string | undefined
  readonly options: readonly QuestionOption[]
  readonly multiSelect: boolean
}

/** A batch of questions to answer in order. */
export interface QuestionPromptRequest {
  readonly questions: readonly QuestionPromptItem[]
}

/** One answer, matching the question ids it replies to. */
export interface QuestionAnswerItem {
  readonly id: string
  readonly selected: readonly string[]
  readonly custom: string | undefined
}

/** A resumable session offered by the picker. */
export interface SessionChoice {
  readonly value: string
  readonly label: string
  readonly description: string | undefined
}

/** The rendering kit the host drives. */
export interface TuiKit {
  /** Take over the terminal and render the first frame. */
  start(): void
  /** Restore the terminal; safe to call twice. */
  stop(): Promise<void>
  /** Ask for a re-render after the host changed its view state. */
  refresh(): void
  /** Ask the operator to allow one tool call. Resolves `rejected` when unanswered. */
  askApproval(prompt: ApprovalPrompt, signal?: AbortSignal): Promise<'allowed-once' | 'rejected'>
  /** Ask the operator the model's questions. Resolves an empty list when unanswered. */
  askQuestions(request: QuestionPromptRequest, signal?: AbortSignal): Promise<readonly QuestionAnswerItem[]>
  /** Show a session picker. Resolves the chosen id, or undefined when cancelled. */
  pickSession(title: string, choices: readonly SessionChoice[]): Promise<string | undefined>
  /** Print a line to the terminal without taking over rendering (used before start). */
  notify(text: string): void
}

/** What the host supplies to build a kit. */
export interface TuiKitOptions {
  /** Snapshot reader; the kit calls it once per frame. */
  readonly getState: () => TuiViewState
  /** A submitted input line, already trimmed of surrounding whitespace. */
  readonly onSubmit: (text: string) => void
  /** Ctrl+C with an empty editor. */
  readonly onInterrupt: () => void
  /** Ctrl+D on an empty editor, or the `/exit` command. */
  readonly onExit: () => void
  /** Working directory for pi-tui's per-session log file; defaults to the OS temp directory. */
  readonly logDirectory?: string
  /** Force a render depth; defaults to detection from the environment. */
  readonly colorDepth?: ColorDepth
  /** Overrides the process terminal, for tests and for embedding. */
  readonly terminal?: Terminal
}

/** Color capability tiers the theme degrades through. */
export type ColorDepth = 'truecolor' | 'ansi256' | 'ansi16' | 'none'
