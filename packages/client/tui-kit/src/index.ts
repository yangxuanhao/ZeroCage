/**
 * ZeroCage terminal rendering kit: pi-tui adapters, transcript and tool cards,
 * diff styling, status bar, and terminal prompts. The TUI host owns state; this
 * package only renders snapshots and reports operator intent.
 * @module @deepseek-ai/dsh-tui-kit
 */

export { createTuiKit } from './kit.ts'
export { stripTerminalSequences, visibleWidth } from '@deepseek-ai/pi-tui'
export { createChoicePrompt, type ChoicePrompt, type ChoicePromptOptions, type PromptOption } from './prompt.ts'
export { contextPercent, createFooter, createStatusBar, formatCount, shortenPath } from './status-bar.ts'
export { createTheme, detectColorDepth, type Rgb, type Theme } from './theme.ts'
export { createTranscript, type TranscriptOptions } from './transcript.ts'
export type {
  ApprovalPrompt,
  ColorDepth,
  DiffLine,
  QuestionAnswerItem,
  QuestionOption,
  QuestionPromptItem,
  QuestionPromptRequest,
  SessionChoice,
  TokenStats,
  TuiKit,
  TuiKitOptions,
  TuiStatus,
  TuiViewState,
  ViewBlock,
} from './types.ts'
