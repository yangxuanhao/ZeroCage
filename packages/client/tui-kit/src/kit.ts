/**
 * ZeroCage Kit Root:
 * Refined vertical layout:
 * - Header (2 rows: Brand & Hairline rule)
 * - Scrollable transcript
 * - Status Bar (1 row)
 * - Editor (with fine hairline borders)
 * - Footer (1 row)
 * @module @deepseek-ai/dsh-tui-kit/kit
 */

import {
  CombinedAutocompleteProvider,
  Editor,
  matchesKey,
  ProcessTerminal,
  ScrollView,
  TuiAltScreen,
  VStack,
  type EditorTheme,
  type OverlayHandle,
  type SelectListTheme,
  type TuiMouseEvent,
} from '@deepseek-ai/pi-tui'
import { createChoicePrompt, type PromptOption } from './prompt.ts'
import { createFooter, createStatusBar } from './status-bar.ts'
import { createTheme, detectColorDepth, type Theme } from './theme.ts'
import { createTranscript } from './transcript.ts'
import type {
  ApprovalPrompt,
  GenericChoice,
  QuestionAnswerItem,
  QuestionPromptRequest,
  SessionChoice,
  TuiKit,
  TuiKitOptions,
} from './types.ts'

const TICK_MS = 110
const CTRL_C = '\x03'
const CTRL_D = '\x04'

function editorTheme(theme: Theme): EditorTheme {
  const selectList: SelectListTheme = {
    selectedPrefix: theme.accent,
    selectedText: theme.inverse,
    description: theme.muted,
    scrollInfo: theme.muted,
    noMatch: theme.warn,
  }
  return { borderColor: theme.border, selectList }
}

export function createTuiKit(options: TuiKitOptions): TuiKit {
  const theme = createTheme(options.colorDepth ?? detectColorDepth(process.env, process.stdout.isTTY === true))
  const terminal = options.terminal ?? new ProcessTerminal()
  const mouseEnabled = process.env.ZEROCAGE_MOUSE !== '0'
  const tui = new TuiAltScreen(terminal, true, options.logDirectory, { mouse: mouseEnabled, copyOnSelect: true })
  const indeed = {
    runningSince: undefined as number | undefined,
  }
  const transcript = createTranscript({ getState: options.getState, theme })
  const scroll = new ScrollView(transcript, { follow: 'end', primary: true, overscroll: 'chain', scrollbar: 'auto' })

  let lastToggleAt = 0
  scroll.handleMouse = (event: TuiMouseEvent) => {
    if (event.button === 'left' && (event.type === 'press' || event.type === 'click')) {
      const now = Date.now()
      if (now - lastToggleAt < 250) return { handled: true }
      const row = scroll.scrollTop + Math.max(0, event.y)
      const id = transcript.blockAtRow(row)
      if (id !== undefined) {
        lastToggleAt = now
        options.onToggleBlock?.(id)
        return { handled: true, render: true }
      }
    }
    return undefined
  }

  const status = createStatusBar({ getState: options.getState, theme, clock: indeed })
  const footer = createFooter({ getState: options.getState, theme })
  const editor = new Editor(tui, editorTheme(theme), { paddingX: 1 })

  // Clean, thin hairline borders for the composer
  editor.renderTopBorder = (width: number, hiddenLineCount: number): string => {
    const border = hiddenLineCount > 0 ? `↑ ${String(hiddenLineCount)} more ` : ''
    const line = border.length < width ? `${border}─`.padEnd(width, '─') : border
    return theme.border(line)
  }
  editor.renderBottomBorder = (width: number, hiddenLineCount: number): string => {
    const border = hiddenLineCount > 0 ? `↓ ${String(hiddenLineCount)} more ` : ''
    const line = border.length < width ? `${border}─`.padEnd(width, '─') : border
    return theme.border(line)
  }

  if (options.getCommands !== undefined) {
    const commands = options.getCommands().map(command => ({ name: command.name, description: command.description }))
    editor.setAutocompleteProvider(new CombinedAutocompleteProvider(commands, options.completionRoot ?? process.cwd()))
  }

  let lastSubmitAt = 0
  editor.onSubmit = (text: string): void => {
    const trimmed = text.trim()
    if (trimmed === '') return
    lastSubmitAt = Date.now()
    if (!trimmed.startsWith('/')) editor.addToHistory(trimmed)
    scroll.scrollToEnd()
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
  let ticker: ReturnType<typeof setInterval> | undefined
  let onResize: (() => void) | undefined
  let lastInterruptAt = 0
  let cancelPrompt: (() => void) | undefined

  const closeOverlay = (): void => {
    overlay?.hide()
    overlay = undefined
    cancelPrompt = undefined
    tui.setFocus(editor)
    tui.requestRender()
  }

  const closeOverlaySettled = (): void => {
    cancelPrompt?.()
  }

  const runPrompt = <T>(
    build: (settle: (value: T | undefined) => void) => { component: ReturnType<typeof createChoicePrompt>; maxHeight: number },
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
      const { component, maxHeight } = build(finish)
      cancelPrompt = () => { finish(undefined) }
      overlay = tui.showOverlay(component, { anchor: 'center', width: '80%', maxHeight, margin: 1 })
      tui.setFocus(component)
      tui.requestRender()
    })
  }

  const kit: TuiKit = {
    start(): void {
      if (started || stopped) return
      started = true
      removeInputListener = tui.addInputListener((data: string) => {
        if (data === '\n') {
          const justSubmitted = Date.now() - lastSubmitAt < 60
          if (justSubmitted) return { consume: true }
          return { data: '\r' }
        }
        if (matchesKey(data, 'ctrl+c') || data === CTRL_C) {
          if (overlay !== undefined) {
            closeOverlaySettled()
            return { consume: true }
          }
          const text = editor.getText()
          const state = options.getState()
          if (text === '' && state.status !== 'running') {
            const now = Date.now()
            if (now - lastInterruptAt < 2000) {
              options.onExit()
              return { consume: true }
            }
            lastInterruptAt = now
            options.onInterrupt()
            return { consume: true }
          }
          options.onInterrupt()
          return { consume: true }
        }
        if ((matchesKey(data, 'ctrl+d') || data === CTRL_D) && editor.getText() === '') {
          options.onExit()
          return { consume: true }
        }
        if (overlay === undefined && matchesKey(data, 'ctrl+p') && options.getCommands !== undefined) {
          const cmds = options.getCommands()
          if (cmds.length > 0) {
            void kit.pickChoice('命令面板', cmds.map(c => ({
              value: c.name,
              label: `/${c.name}`,
              description: c.description,
            }))).then(picked => {
              if (picked !== undefined) options.onSubmit(`/${picked}`)
            })
            return { consume: true }
          }
        }
        if (overlay !== undefined && matchesKey(data, 'escape')) {
          closeOverlaySettled()
          return { consume: true }
        }
        return undefined
      })
      tui.start()
      tui.setFocus(editor)
      tui.requestRender()
      onResize = (): void => {
        setTimeout(() => { tui.renderNow(true) }, 30)
      }
      process.stdout.on('resize', onResize)
      ticker = setInterval(() => {
        const running = options.getState().status === 'running' || options.getState().status === 'waiting'
        if (running) {
          indeed.runningSince ??= Date.now()
          tui.requestRender()
        } else {
          indeed.runningSince = undefined
        }
      }, TICK_MS)
    },
    async stop(): Promise<void> {
      if (stopped) return
      stopped = true
      if (ticker !== undefined) clearInterval(ticker)
      ticker = undefined
      if (onResize !== undefined) process.stdout.off('resize', onResize)
      onResize = undefined
      removeInputListener?.()
      removeInputListener = undefined
      overlay?.hide()
      overlay = undefined
      if (started) tui.stop()
    },
    refresh(force = false): void {
      if (started && !stopped) tui.requestRender(force)
    },
    notify(text: string): void {
      process.stdout.write(`${text}\n`)
    },
    async askApproval(prompt: ApprovalPrompt, signal?: AbortSignal): Promise<'allowed-once' | 'rejected'> {
      const onAbort = (): void => { closeOverlaySettled() }
      signal?.addEventListener('abort', onAbort, { once: true })
      const choice = await runPrompt<'allowed-once' | 'rejected'>(settle => ({
        maxHeight: 9,
        component: createChoicePrompt({
          title: `allow ${prompt.toolName}?`,
          detail: prompt.reason,
          options: [
            { value: 'allowed-once', label: 'yes, run this call', description: undefined },
            { value: 'rejected', label: 'no, skip this call', description: undefined },
          ],
          multiSelect: false,
          allowCustom: false,
          theme,
          settle: values => settle(values?.[0] === 'allowed-once' ? 'allowed-once' : 'rejected'),
        }),
      }))
      signal?.removeEventListener('abort', onAbort)
      return choice ?? 'rejected'
    },
    async askQuestions(request: QuestionPromptRequest, signal?: AbortSignal): Promise<readonly QuestionAnswerItem[]> {
      const answers: QuestionAnswerItem[] = []
      let cancelled = false
      for (const question of request.questions) {
        if (signal?.aborted === true || cancelled) {
          cancelled = true
          answers.push({ id: question.id, selected: [], custom: '(skipped)' })
          continue
        }
        const promptOptions: PromptOption[] = question.options.map(option => ({
          value: option.label,
          label: option.label,
          description: option.description,
        }))
        const title = question.header === undefined ? question.question : `${question.header} · ${question.question}`
        const custom = { value: '' }
        const picked = await runPrompt<readonly string[]>(settle => ({
          maxHeight: promptOptions.length + 10,
          component: createChoicePrompt({
            title,
            detail: question.detail,
            options: promptOptions,
            multiSelect: question.multiSelect,
            allowCustom: true,
            theme,
            settle: (values, typed) => {
              if (typed !== undefined) custom.value = typed
              settle(values ?? (typed === undefined ? undefined : []))
            },
          }),
        }))
        if (picked === undefined) {
          cancelled = true
          answers.push({ id: question.id, selected: [], custom: '(skipped)' })
          continue
        }
        answers.push({
          id: question.id,
          selected: picked,
          custom: custom.value === '' ? undefined : custom.value,
        })
      }
      return answers
    },
    async pickSession(title: string, choices: readonly SessionChoice[]): Promise<string | undefined> {
      const picked = await runPrompt<readonly string[]>(settle => ({
        maxHeight: Math.min(choices.length + 8, 24),
        component: createChoicePrompt({
          title,
          detail: undefined,
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
    async pickChoice(title: string, choices: readonly GenericChoice[], detail?: string): Promise<string | undefined> {
      const picked = await runPrompt<readonly string[]>(settle => ({
        maxHeight: Math.min(choices.length + 8, 24),
        component: createChoicePrompt({
          title,
          detail,
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
