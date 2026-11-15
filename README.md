# ZeroCage

> Minimalist, high-contrast, unrestricted autonomous engineering agent in your terminal.

[English](#english) | [简体中文](#简体中文) | [日本語](#日本語) | [한국어](#한국어) | [Français](#français) | [Deutsch](#deutsch) | [Español](#español) | [Русский](#русский)

---

<a id="english"></a>
## English

ZeroCage is a terminal-first autonomous AI engineering agent built on a modular plugin architecture and a custom alternate-screen TUI. It is designed for speed, zero visual clutter, and unrestricted engineering workflows.

### ✨ Highlights
- **Unrestricted & Ultra-Low Cost**: Zero banned-word filtering or artificial refusal guardrails, and as affordable to run as Pi.
- **Minimalist High-Contrast UI**: Crimson, crisp white, and dark charcoal palette with zero redundant borders or noise.
- **Full Keyboard & Mouse Support**:
  - Clickable tool-call and reasoning cards to expand/collapse details inline.
  - Mouse wheel scrolling in both the transcript and interactive overlays.
  - Interactive pickers (`/model`, `/resume`, `/approve`, `Ctrl+P`) with **keyboard navigation**, **mouse click/wheel**, and **live type-to-filter** search.
- **Interactive Command Palette (`Ctrl+P`)**: Instant access to all slash commands with real-time filtering.
- **Session Persistence & Resume**: Save, list (`/sessions`), and resume (`/resume`) engineering sessions seamlessly.
- **Granular Approval Policy (`/approve`)**: Switch between `ask` (confirm before tool execution) and `never` (autonomous execution).
- **Context & Token Transparency (`/status`, `/budget`)**: Inspect system prompt assembly, tool schemas, and real-time context window usage.

### 🚀 Quick Start
Verified from source on Node.js 22+ with `pnpm`:
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

### ⌨️ Keybindings & Slash Commands
| Shortcut / Command | Description |
| --- | --- |
| `Ctrl+P` | Open interactive command palette |
| `Ctrl+C` | Cancel current turn (press twice on empty input to exit) |
| `Ctrl+D` | Exit ZeroCage |
| `/model [name]` | Switch model (opens interactive picker if no argument) |
| `/resume [id\|last\|pick]` | Resume a previous session |
| `/approve [ask\|never]` | Set tool-call approval policy |
| `/new` / `/clear` | Start a new session |
| `/sessions` | List recent 50 sessions |
| `/status` | Show session ID, model, cwd, and context usage |
| `/budget` | Measure system prompt & token budget |
| `/stop` | Cancel the current turn |
| `/help` | Show command reference |

### 🧪 Testing
```bash
npx vitest run packages/client/tui-kit/tests/ packages/host/tui-host/tests/ apps/tui/tests/
node --import tsx/esm apps/tui/tests/e2e/pty-smoke.e2e.ts
```

---

<a id="简体中文"></a>
## 简体中文

ZeroCage 是一个基于模块化插件架构与自定义全屏终端界面（alternate-screen TUI）打造的自主工程智能体，专注于极速响应、零视觉干扰与无限制的工程工作流。

### ✨ 核心亮点
- **无违禁词限制 & 极致低价**：无内容审查/违禁词拦截，运行成本与 Pi 一样便宜。
- **极简高对比度界面**：红 + 皓白 + 幽暗深灰配色，去除多余边框与干扰信息。
- **全键盘 + 鼠标交互**：
  - 支持鼠标点击展开/折叠工具调用与思考过程卡片。
  - 支持对话区与弹窗内的鼠标滚轮滚动。
  - 交互式选择器（`/model`、`/resume`、`/approve`、`Ctrl+P`）全面支持 **键盘上下选择**、**鼠标点击/滚轮** 与 **实时键入搜索过滤**。
- **命令面板 (`Ctrl+P`)**：随时唤起所有斜杠命令，输入关键字即可过滤并执行。
- **会话持久化与恢复**：支持保存、查看（`/sessions`）与恢复（`/resume`）历史会话。
- **精细化审批策略 (`/approve`)**：在 `ask`（工具调用前询问确认）与 `never`（自主执行）之间随时切换。
- **上下文与 Token 透明化 (`/status`, `/budget`)**：实时查看系统提示词装配大小、工具数量与上下文窗口占用。

### 🚀 快速开始
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

### ⌨️ 快捷键与斜杠命令
- `Ctrl+P`：打开命令面板
- `Ctrl+C`：取消当前回合（空输入框连按两次退出）
- `Ctrl+D`：退出
- `/model [name]`：切换模型（无参数弹出交互式列表）
- `/resume [id|last|pick]`：恢复会话（无参数或 `pick` 弹出选择器）
- `/approve [ask|never]`：切换审批策略（无参数弹出选择器）
- `/new` / `/clear`：开启新会话
- `/sessions`：列出最近 50 个会话
- `/status` / `/budget`：查看会话状态与上下文占用

---

<a id="日本語"></a>
## 日本語

ZeroCage は、モジュラープラグイン構造とカスタム全画面 TUI 上に構築された自律型エンジニアリングエージェントです。

### ✨ 主な特徴
- **制限なし＆超低コスト**：禁止ワードによるブロックなし、Pi と同等の圧倒的な低コスト。
- **ミニマルUI**：クリムゾンレッド・ホワイト・ダークチャコールの洗練された配色。
- **キーボード＆マウス完全対応**：ツール呼び出し・思考カードのクリック展開、ホイールスクロール、リアルタイム検索付きピッカー（`/model`、`/resume`、`/approve`、`Ctrl+P`）。
- **コマンドパレット (`Ctrl+P`)**・**セッション管理**（`/sessions`、`/resume`）・**承認ポリシー切替**（`/approve`）。

### 🚀 クイックスタート
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="한국어"></a>
## 한국어

ZeroCage는 모듈형 플러그인 아키텍처와 커스텀 풀스크린 TUI 기반의 자율 엔지니어링 에이전트입니다.

### ✨ 주요 특징
- **금지어 제한 없음 & 초저비용**: 금지어 차단 없이 자유롭게 동작하며, Pi만큼 저렴한 비용으로 실행됩니다.
- **미니멀 고대비 UI**: 크림슨, 화이트, 다크 차콜 컬러 팔레트.
- **키보드 및 마우스 완벽 지원**: 도구 호출/추론 카드 클릭 확장, 마우스 휠 스크롤, 실시간 필터링 선택기(`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **명령 팔레트 (`Ctrl+P`)**, **세션 저장/복원**(`/sessions`, `/resume`), **승인 정책 전환**(`/approve`).

### 🚀 빠른 시작
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="français"></a>
## Français

ZeroCage est un agent d'ingénierie autonome en terminal, conçu sur une architecture modulaire avec une interface plein écran minimaliste.

### ✨ Points forts
- **Sans censure & Ultra-économique** : Aucun filtrage de mots interdits, et aussi peu coûteux que Pi.
- **Interface minimaliste** : Palette cramoisi, blanc pur et charbon foncé.
- **Clavier & Souris complets** : Cartes d'outils/réflexion cliquables, défilement à la molette et sélecteurs interactifs avec recherche en direct (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Palette de commandes (`Ctrl+P`)**, **gestion des sessions** (`/sessions`, `/resume`) et **politique d'approbation** (`/approve`).

### 🚀 Démarrage rapide
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="deutsch"></a>
## Deutsch

ZeroCage ist ein autonomer Engineering-Agent für das Terminal auf Basis einer modularen Plugin-Architektur und einer minimalistischen Vollbild-TUI.

### ✨ Highlights
- **Uneingeschränkt & Extrem Günstig**: Keine Sperrwort-Filterung, und so preiswert im Betrieb wie Pi.
- **Minimalistische UI**: Karmesinrot, Weiß und dunkles Anthrazit.
- **Volle Tastatur- & Mausunterstützung**: Klickbare Tool- und Reasoning-Karten, Mausrad-Scrolling und interaktive Picker mit Live-Filter (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Befehlspalette (`Ctrl+P`)**, **Sitzungsverwaltung** (`/sessions`, `/resume`) und **Genehmigungsrichtlinie** (`/approve`).

### 🚀 Schnellstart
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="español"></a>
## Español

ZeroCage es un agente de ingeniería autónomo para terminal, construido sobre una arquitectura modular con una TUI minimalista a pantalla completa.

### ✨ Destacados
- **Sin restricciones y ultraeconómico**: Sin bloqueo por palabras prohibidas, y tan barato de operar como Pi.
- **Interfaz minimalista**: Paleta carmesí, blanco nítido y carbón oscuro.
- **Soporte completo de teclado y ratón**: Tarjetas de herramientas y razonamiento clicables, desplazamiento con rueda y selectores interactivos con búsqueda en vivo (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Paleta de comandos (`Ctrl+P`)**, **persistencia de sesiones** (`/sessions`, `/resume`) y **política de aprobación** (`/approve`).

### 🚀 Inicio rápido
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="русский"></a>
## Русский

ZeroCage — автономный инженерный агент для терминала на базе модульной архитектуры плагинов и минималистичного полноэкранного TUI.

### ✨ Особенности
- **Без цензуры и сверхдёшево**: Никаких фильтров запрещённых слов, а стоимость работы такая же низкая, как у Pi.
- **Минималистичный интерфейс**: Малиновый, белый и тёмно-угольный цвета.
- **Полная поддержка клавиатуры и мыши**: Кликабельные карточки инструментов и размышлений, прокрутка колесом мыши и интерактивные списки с живым поиском (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Палитра команд (`Ctrl+P`)**, **управление сессиями** (`/sessions`, `/resume`) и **политика подтверждений** (`/approve`).

### 🚀 Быстрый старт
```bash
git clone https://github.com/yangxuanhao/ZeroCage.git
cd ZeroCage
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```
