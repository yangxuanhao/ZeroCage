# ZeroCage

[English](#english) | [简体中文](#简体中文) | [日本語](#日本語) | [한국어](#한국어) | [Français](#français) | [Deutsch](#deutsch) | [Español](#español) | [Русский](#русский)

---

<a id="english"></a>
## English

> Minimalist, high-contrast autonomous engineering agent in your terminal.

### ✨ Highlights
- **Unrestricted & Ultra-Low Cost**: Zero banned-word filtering / refusal guardrails, and as affordable to run as Pi.
- **Minimalist High-Contrast UI**: Crimson, crisp white, and dark charcoal palette with zero visual clutter.
- **Full Keyboard & Mouse Support**: Clickable tool-call and reasoning cards, mouse wheel scrolling, and interactive pickers (`/model`, `/resume`, `/approve`, `Ctrl+P`) with live type-to-filter search.
- **Interactive Command Palette (`Ctrl+P`)**: Instant access to all slash commands.
- **Session Persistence & Resume**: Save, list (`/sessions`), and resume (`/resume`) engineering sessions.
- **Granular Approval Policy (`/approve`)**: Switch between `ask` and `never` (autonomous).

### 🚀 Quick Start
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

### ⌨️ Keybindings & Commands
- `Ctrl+P`: Command palette
- `Ctrl+C`: Cancel current turn (press twice on empty input to exit)
- `Ctrl+D`: Exit
- `/model [name]`, `/resume [id|last|pick]`, `/approve [ask|never]`, `/new`, `/clear`, `/sessions`, `/status`, `/budget`, `/help`

---

<a id="简体中文"></a>
## 简体中文

> 极简、高对比度的终端自主工程智能体。

### ✨ 核心亮点
- **无违禁词限制 & 极致低价**：无内容审查/违禁词拦截，运行成本与 Pi 一样便宜。
- **极简高对比度界面**：红 + 皓白 + 幽暗深灰配色，无冗余边框与干扰信息。
- **全键盘 + 鼠标交互**：支持点击展开/折叠工具调用与思考过程、鼠标滚轮滚动，以及支持键盘导航、鼠标点击/滚轮和实时输入过滤的交互式选择器（`/model`、`/resume`、`/approve`、`Ctrl+P`）。
- **命令面板 (`Ctrl+P`)**：随时唤起所有斜杠命令并搜索执行。
- **会话持久化与恢复**：支持保存、查看（`/sessions`）和恢复（`/resume`）历史会话。
- **精细化审批策略 (`/approve`)**：在 `ask`（工具调用前询问）与 `never`（自主执行）之间随时切换。

### 🚀 快速开始
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="日本語"></a>
## 日本語

> ミニマルで高コントラストなターミナル自律エンジニアリングエージェント。

### ✨ 主な特徴
- **制限なし＆超低コスト**：禁止ワードによるブロックなし、Pi と同等の圧倒的な低コスト。
- **ミニマルUI**：クリムゾンレッド・ホワイト・ダークチャコールの洗練された配色。
- **キーボード＆マウス完全対応**：ツール呼び出し・思考カードのクリック展開、ホイールスクロール、リアルタイム検索付きピッカー（`/model`、`/resume`、`/approve`、`Ctrl+P`）。
- **コマンドパレット (`Ctrl+P`)**：すべてのスラッシュコマンドに即座にアクセス。
- **セッション管理**：履歴の保存・一覧（`/sessions`）・再開（`/resume`）。

### 🚀 クイックスタート
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="한국어"></a>
## 한국어

> 미니멀하고 고대비의 터미널 자율 엔지니어링 에이전트.

### ✨ 주요 특징
- **금지어 제한 없음 & 초저비용**: 금지어 차단 없이 자유롭게 동작하며, Pi만큼 저렴한 비용으로 실행됩니다.
- **미니멀 고대비 UI**: 크림슨, 화이트, 다크 차콜 컬러 팔레트.
- **키보드 및 마우스 완벽 지원**: 도구 호출/추론 카드 클릭 확장, 마우스 휠 스크롤, 실시간 필터링 선택기(`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **명령 팔레트 (`Ctrl+P`)**: 모든 슬래시 명령에 즉시 접근.
- **세션 저장 및 복원**: `/sessions`, `/resume` 지원.

### 🚀 빠른 시작
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="français"></a>
## Français

> Agent d'ingénierie autonome minimaliste et à fort contraste dans votre terminal.

### ✨ Points forts
- **Sans censure & Ultra-économique** : Aucun filtrage de mots interdits, et aussi peu coûteux que Pi.
- **Interface minimaliste** : Palette cramoisi, blanc pur et charbon foncé.
- **Clavier & Souris complets** : Cartes d'outils/réflexion cliquables, défilement à la molette et sélecteurs interactifs avec recherche en direct (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Palette de commandes (`Ctrl+P`)** et **gestion des sessions** (`/sessions`, `/resume`).

### 🚀 Démarrage rapide
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="deutsch"></a>
## Deutsch

> Minimalistischer, kontrastreicher autonomer Engineering-Agent für Ihr Terminal.

### ✨ Highlights
- **Uneingeschränkt & Extrem Günstig**: Keine Sperrwort-Filterung, und so preiswert im Betrieb wie Pi.
- **Minimalistische UI**: Karmesinrot, Weiß und dunkles Anthrazit.
- **Volle Tastatur- & Mausunterstützung**: Klickbare Tool- und Reasoning-Karten, Mausrad-Scrolling und interaktive Picker mit Live-Filter (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Befehlspalette (`Ctrl+P`)** & **Sitzungsverwaltung** (`/sessions`, `/resume`).

### 🚀 Schnellstart
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="español"></a>
## Español

> Agente de ingeniería autónomo minimalista y de alto contraste en tu terminal.

### ✨ Destacados
- **Sin restricciones y ultraeconómico**: Sin bloqueo por palabras prohibidas, y tan barato de operar como Pi.
- **Interfaz minimalista**: Paleta carmesí, blanco nítido y carbón oscuro.
- **Soporte completo de teclado y ratón**: Tarjetas de herramientas y razonamiento clicables, desplazamiento con rueda y selectores interactivos con búsqueda en vivo (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Paleta de comandos (`Ctrl+P`)** y **persistencia de sesiones** (`/sessions`, `/resume`).

### 🚀 Inicio rápido
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```

---

<a id="русский"></a>
## Русский

> Минималистичный высококонтрастный автономный инженерный агент в терминале.

### ✨ Особенности
- **Без цензуры и сверхдёшево**: Никаких фильтров запрещённых слов, а стоимость работы такая же низкая, как у Pi.
- **Минималистичный интерфейс**: Малиновый, белый и тёмно-угольный цвета.
- **Полная поддержка клавиатуры и мыши**: Кликабельные карточки инструментов и размышлений, прокрутка колесом мыши и интерактивные списки с живым поиском (`/model`, `/resume`, `/approve`, `Ctrl+P`).
- **Палитра команд (`Ctrl+P`)** и **управление сессиями** (`/sessions`, `/resume`).

### 🚀 Быстрый старт
```bash
pnpm install
node --import tsx/esm apps/tui/src/bin.ts
```
