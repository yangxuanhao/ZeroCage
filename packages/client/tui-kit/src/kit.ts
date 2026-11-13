/**
 * The terminal composition root: one fullscreen pi-tui renderer, a scrolling
 * transcript, a status bar, the multiline editor, and an overlay channel for
 * prompts. It owns terminal lifecycle only — every conversation fact comes from
 * the host through {@link TuiKitOptions.getState}.
 * @module @deepseek-ai/dsh-tui-kit/kit
 */

import {
  Editor,
  matchesKey,
  ProcessTerminal,
  ScrollView,
  TuiAltScreen,
  VStack,
  type EditorTheme,
  type OverlayHandle,
  type SelectListTheme,
} from '@deepseek-ai/pi-tui'
import { createChoicePrompt, type PromptOption } from './prompt.ts'
import { createFooter, createStatusBar } from './status-bar.ts'
import { createTheme, detectColorDepth, type Theme } from './theme.ts'
import { createTranscript } from './transcript.ts'
import type {
  ApprovalPrompt,
  QuestionAnswerItem,
  QuestionPromptRequest,
  SessionChoice,
  TuiKit,
  TuiKitOptions,
} from './types.ts'

/** Editor theme derived from the kit theme; borders and menus share the palette. */
function editorTheme(theme: Theme): EditorTheme {
  const selectList: SelectListTheme = {
    selectedPrefix: theme.accent,
    selectedText: theme.inverse,
    description: theme.muted,
    scrollInfo: theme.muted,
    noMatch: theme.warn,
  }
  return { borderColor: theme.muted, selectList }
}

/** Outcome of one overlay prompt is settled through its resolve callback. */

/**
 * Build the terminal kit.
 * @param options - state reader, host callbacks, and rendering overrides.
 * @returns the kit the host drives; no terminal state is touched before {@link TuiKit.start}.
 */
export function createTuiKit(options: TuiKitOptions): TuiKit {
  const theme = createTheme(options.colorDepth ?? detectColorDepth(process.env, process.stdout.isTTY === true))
  const terminal = options.terminal ?? new ProcessTerminal()
  const tui = new TuiAltScreen(terminal, true, options.logDirectory, { mouse: true, copyOnSelect: true })
  const transcript = createTranscript({ getState: options.getState, theme })
  const scroll = new ScrollView(transcript, { follow: 'end', primary: true, overscroll: 'chain', scrollbar: 'auto' })
  const status = createStatusBar({ getState: options.getState, theme })
  const footer = createFooter({ getState: options.getState, theme })
  const editor = new Editor(tui, editorTheme(theme), { paddingX: 1 })
  editor.onSubmit = (text: string): void => {
    const trimmed = text.trim()
    if (trimmed === '') return
    editor.addToHistory(trimmed)
    options.onSubmit(trimmed)
  }
  const layout = new VStack([
    { component: scroll, basis: 0, grow: 1, shrink: 1, minSize: 1 },
    { component: status, basis: 'auto', grow: 0, shrink: 0, minSize: 1 },
    { component: editor, basis: 'auto', grow: 0, shrink: 1, minSize: 3 },
    { component: footer, basis: 'auto', grow: 0, shrink: 0, minSize: 1 },
  ])
  tui.setLayoutRoot(layout)

  let started = false
  let stopped = false
  let overlay: OverlayHandle | undefined
  let removeInputListener: (() => void) | undefined

  const closeOverlay = (): void => {
    overlay?.hide()
    overlay = undefined
    tui.setFocus(editor)
    tui.requestRender()
  }

  /** Show one overlay prompt and settle its promise from the prompt callback. */
  const runPrompt = <T>(
    build: (settle: (value: T | undefined) => void) => { component: ReturnType<typeof createChoicePrompt> },
  ): Promise<T | undefined> => {
    return new Promise<T | undefined>(resolve => {
      closeOverlay()
      let settled = false
      const finish = (value: T | undefined): void => {
        if (settled) return
        settled = true
        closeOverlay()
        resolve(value)
      }
      const { component } = build(finish)
      // Non-capturing is wrong here: a prompt owns the keyboard while it is open.
      overlay = tui.showOverlay(component, { anchor: 'center', width: '80%', maxHeight: '70%', margin: 1 })
      tui.setFocus(component)
      tui.requestRender()
    })
  }

  const kit: TuiKit = {
    start(): void {
      if (started || stopped) return
      started = true
      // pi-tui's own start() drives the terminal's input and resize handlers;
      // this listener sits in front of the focused component.
      removeInputListener = tui.addInputListener((data: string) => {
        if (overlay !== undefined) return undefined
        if (matchesKey(data, 'ctrl+c')) {
          options.onInterrupt()
          return { consume: true }
        }
        if (matchesKey(data, 'ctrl+d') && editor.getText() === '') {
          options.onExit()
          return { consume: true }
        }
        return undefined
      })
      tui.start()
      tui.setFocus(editor)
      tui.requestRender()
    },
    async stop(): Promise<void> {
      if (stopped) return
      stopped = true
      removeInputListener?.()
      removeInputListener = undefined
      overlay?.hide()
      overlay = undefined
      if (started) tui.stop()
    },
    refresh(): void {
      if (started && !stopped) tui.requestRender()
    },
    notify(text: string): void {
      process.stdout.write(`${text}\n`)
    },
    async askApproval(prompt: ApprovalPrompt, signal?: AbortSignal): Promise<'allowed-once' | 'rejected'> {
      const detail = prompt.reason === undefined ? undefined : prompt.reason
      const onAbort = (): void => {
        closeOverlay()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      const choice = await runPrompt<'allowed-once' | 'rejected'>(settle => ({
        component: createChoicePrompt({
          title: `allow ${prompt.toolName}?`,
          detail,
          options: [
            { value: 'allowed-once', label: 'yes, run this call', description: undefined },
            { value: 'rejected', label: 'no, skip this call', description: undefined },
          ],
          multiSelect: false,
          allowCustom: false,
          theme,
          settle: (values) => {
            const first = values?.[0]
            settle(first === 'allowed-once' ? 'allowed-once' : 'rejected')
          },
        }),
      }))
      signal?.removeEventListener('abort', onAbort)
      return choice ?? 'rejected'
    },
    async askQuestions(request: QuestionPromptRequest, signal?: AbortSignal): Promise<readonly QuestionAnswerItem[]> {
      const answers: QuestionAnswerItem[] = []
      for (const question of request.questions) {
        if (signal?.aborted === true) break
        const options: PromptOption[] = question.options.map(option => ({
          value: option.label,
          label: option.label,
          description: option.description,
        }))
        const title = question.header === undefined ? question.question : `${question.header} · ${question.question}`
        const custom = { value: '' }
        const picked = await runPrompt<readonly string[]>(settle => ({
          component: createChoicePrompt({
            title,
            detail: question.detail,
            options,
            multiSelect: question.multiSelect,
            allowCustom: true,
            theme,
            settle: (values, typed) => {
              if (typed !== undefined) custom.value = typed
              settle(values ?? (typed === undefined ? undefined : []))
            },
          }),
        }))
        const selected = picked ?? []
        const typed = custom.value === '' ? undefined : custom.value
        answers.push({ id: question.id, selected, custom: typed })
      }
      return answers
    },
    async pickSession(title: string, choices: readonly SessionChoice[]): Promise<string | undefined> {
      const picked = await runPrompt<readonly string[]>(settle => ({
        component: createChoicePrompt({
          title,
          detail: 'Enter resumes the highlighted session; Esc keeps the current one.',
          options: choices.map(choice => ({
            value: choice.value,
            label: choice.label,
            description: choice.description,
          })),
          multiSelect: false,
          allowCustom: false,
          theme,
          settle: values => settle(values),
        }),
      }))
      return picked?.[0]
    },
  }
  return kit
}
