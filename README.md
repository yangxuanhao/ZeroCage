# ZeroCage

> Minimalist, high-contrast autonomous engineering agent in your terminal.

ZeroCage is a terminal-first AI coding & engineering agent built on a modular Cordis plugin architecture and a custom alternate-screen TUI (`pi-tui`), designed for fast, distraction-free workflows.

## ✨ Highlights

- **Minimalist High-Contrast UI**: Clean crimson, crisp white, and dark charcoal palette with zero visual clutter.
- **Full Keyboard & Mouse Support**:
  - Clickable tool-call and reasoning cards to expand/collapse details inline.
  - Mouse wheel scrolling in both the transcript and interactive overlays.
  - Interactive pickers (`/model`, `/resume`, `/approve`, `Ctrl+P` command palette) with **keyboard navigation**, **mouse click/wheel**, and **live type-to-filter** search.
- **Interactive Command Palette (`Ctrl+P`)**: Instant access to all slash commands (`/model`, `/resume`, `/approve`, `/new`, `/clear`, `/sessions`, `/status`, `/budget`, `/stop`, `/help`).
- **Session Persistence & Resume**: Save, list (`/sessions`), and resume (`/resume`) engineering sessions seamlessly.
- **Granular Approval Policy (`/approve`)**: Switch between `ask` (confirm before tool execution) and `never` (autonomous execution).
- **Context & Token Transparency (`/status`, `/budget`)**: Inspect system prompt assembly, tool schemas, and real-time context window usage.

## 🚀 Quick Start

```bash
# Install dependencies
pnpm install

# Run the TUI
pnpm --filter @deepseek-ai/dsh-tui start
```

## ⌨️ Keybindings & Commands

| Shortcut / Command | Action |
| --- | --- |
| `Ctrl+P` | Open command palette |
| `Ctrl+C` | Cancel current turn (press twice on empty input to exit) |
| `Ctrl+D` | Exit ZeroCage |
| `/model [name]` | Switch model (opens interactive picker if no argument) |
| `/resume [id\|last\|pick]` | Resume a previous session |
| `/approve [ask\|never]` | Set tool-call approval policy |
| `/new` / `/clear` | Start a new session |
| `/sessions` | List recent sessions |
| `/status` | Show session & context stats |
| `/budget` | Measure system prompt & token budget |
| `/help` | Show command reference |

## 🧪 Testing

```bash
# Unit tests (tui-kit, tui-host, apps/tui)
npx vitest run packages/client/tui-kit/tests/ packages/host/tui-host/tests/ apps/tui/tests/

# PTY end-to-end smoke test
node --import tsx/esm apps/tui/tests/e2e/pty-smoke.e2e.ts
```
