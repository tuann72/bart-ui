# AGENTS.md — LLM context for Bart

Bart is a portable, shadcn-style React LLM assistant. Consumers scaffold it into
their own repository (`bunx @bart-ui/cli init` / `npx @bart-ui/cli init`) and own
the source afterwards; there is no runtime npm dependency on Bart. It provides a
streaming chat UI, markdown-based site knowledge, safe page navigation,
element highlighting, and opt-in element clicking. LLM requests always pass
through consumer-owned server code; API keys live only in environment
variables.

## Current state

Implemented and verified:

- `registry/` — the source templates consumers will receive: headless core,
  three UI variants, theming tokens, and the Fetch-standard server handler.
- The interact tool: the model can click page elements that are registered
  with `data-bart-target`, flagged `interactive: true` in the manifest, and
  are natively button-like (`core/interact.ts` rejects links, text inputs,
  and disabled controls at runtime). Defaults to `confirm`, capped per turn
  (`maxInteractionsPerTurn`, default 3, ceiling 10), and flashes the highlight
  overlay + aria-live announcement so the click is always visible. The
  playground's example is the pricing page's "Start pickup order" button
  (`start-order`).
- "Ask about selection": selecting page text shows an "Ask Bart" popover;
  clicking it opens the active variant with the selection attached as a
  dismissible pill. Up to eight unique selections can be attached in every
  variant and are sent as markdown blockquotes before the question.
- Motion: CSS keyframes only, no animation library (0.45s expo-out both
  ways). Panels slide in/out; the launcher tabs animate back in on close so
  the panel reads as shrinking into the tab; the sidebar pushes page content
  aside through body margin classes with a matching transition; the spotlight
  fades/scales in and back out, vertically centered, with its backdrop fading
  alongside the card on either exit path (Escape or a backdrop click); the
  selection popover fades and lifts
  in, and fades back out when the selection is lost. `prefers-reduced-motion`
  disables all Bart animation (`core/motion.ts` also skips the exit-animation
  state). Every panel's exit follows one pattern, owned by
  `core/use-shell-lifecycle.ts`: `open` flips false the moment a close begins,
  a `closing` flag keeps the panel mounted while the exit animation plays, and
  `onAnimationEnd` unmounts — never a `setTimeout` duplicating the CSS
  duration in JS. `motionDisabled()` skips the closing state entirely.
  Reopening mid-exit (e.g. the selection popover's "Ask Bart") cancels the
  close instead of losing the request; an external controlled `open={false}`
  unmounts instantly, as controlled components do. Closing a panel returns
  focus to its launcher, which has to wait for the remount commit (see
  gotchas).
- Iconography: shared SVG icons in `components/icons.tsx` (circular Bart
  mark, close, send, stop, check, refresh) — no emoji glyphs in Bart UI. The
  send/stop control is a round icon button inside the combined input shell.
- User and assistant messages render safe GitHub-flavored Markdown through
  `react-markdown` and `remark-gfm`; raw HTML is disabled. Thinking states
  rotate playful filler labels alongside the dots.
- The dock resizes from three handles on its two free edges — the inside corner
  (both axes), the top bar (height), and the inside side bar (width) — capped at
  32rem wide and `min(52rem, 92dvh)` tall. The sidebar resizes its width from a
  full-height bar on whichever edge faces the page (280–640px). Both mirror for
  `side="left"`, and both drop their handles on mobile, where the layout is
  fixed. Every handle is invisible at rest and on hover (`opacity: 0`): the
  directional cursor is the whole affordance, held page-wide for the duration of
  a drag (see gotchas). Keyboard focus is the one state that reveals a handle,
  because an invisible focus target fails WCAG 2.4.7 — so only the handles that
  are keyboard-operable are focusable at all. The dock's edge bars are
  pointer-only (`aria-hidden`, not buttons) because its corner already resizes
  both axes with the arrow keys; adding them to the tab order would be two extra
  stops that each do strictly less.
- `apps/playground/` — a fictional Stackhouse Burger Co. site with Home,
  Pricing, and FAQ routes for visual and grounded-context testing, plus a Hono
  API server running a scripted mock model (offline, deterministic, no API
  key). No provider adapter is installed anywhere in the repository. This app
  doubles as the future Playwright host.
- Tests (`bun test`, 131 passing): pure unit tests (shortcut suppression,
  route/target/interaction validation, context selection and search, resize
  math, server boundary hardening) plus a React Testing Library contract suite
  that runs identical behavioral assertions against all three variant shells
  in happy-dom (see Testing strategy).
- Playwright browser suite (`bun run test:e2e`, 7 specs): runs against the
  playground + mock model in Chromium, both servers auto-started by
  `apps/playground/playwright.config.ts` (and reused if already running).
  Covers real streaming, variant open/close, the `/` shortcut, highlight
  overlay, interact approve/deny with its DOM effect, and a layout regression
  (spotlight hint icon inline under Tailwind preflight).

Planned but NOT yet built: the `@bart-ui/cli` package (`init`, `add <variant>`,
`sync`, `doctor`, `update`), markdown ingestion via `gray-matter` (manifests are
currently hand-written in the playground), Next.js/React Router adapters and
example apps, provider factories (OpenAI/Anthropic/Google), and
durable rate limiting.

## Workspace layout

Bun workspace (Bun 1.3, **isolated installs**: dependencies resolve from each
package's `node_modules`, symlinked into the root `.bun` store — nothing is
hoisted to root `node_modules`).

- `registry/` = `@bart-ui/registry` (private, source-only; exports `.`,
  `./server`, `./styles.css` pointing at TypeScript source, not builds)
  - `src/core/` — `use-bart-chat.ts` (headless core over AI SDK `useChat`),
    `tool-policy.ts` (route/target allowlisting + policy resolution),
    `use-shell-lifecycle.ts` (open/closing/unmount phases, Escape-to-close,
    focus restore — shared by every variant shell), `use-sidebar-push.ts`
    (the sidebar's only global side effects: body push classes + the `<html>`
    width variable, instance-counted), `resize.ts` (side-aware resize math,
    DOM-free), `highlight.ts` (overlay + aria-live), `shortcut.ts` (spotlight
    `/` key suppression logic, DOM-free for testability), `selection.ts`
    (quote normalization/capping + blockquote building, DOM-free),
    `focus-trap.ts`, `use-resize-drag.ts` (pointer-capture drag plumbing +
    the page-wide cursor class, shared by every resize handle), `types.ts`
  - `src/components/` — `bart-provider.tsx` (`BartProvider`: runs the headless
    core and owns the shared `open` state, exposing both through
    `useBartContext`; also the per-shell `close` context behind `useCloseBart`),
    `bart-chat.tsx` (the batteries-included default — a thin `BartProvider` +
    one variant shell + selection popover), `dock.tsx`, `sidebar.tsx`,
    `spotlight.tsx` (shells read state from context, not props; dock/sidebar
    accept a `children` override for the panel body), `selection-popover.tsx`,
    `chat-parts.tsx` (the composable context-driven parts — `BartHeader`,
    `BartActions`, `BartTitle`, `BartBody`, `BartMessages`, `BartInput`,
    `NewChatButton`, `AutoApproveButton`, `CloseButton` — over the internal
    `MessageList`/`ChatInput`/`AutoApproveToggle` primitives, plus the approval
    cards, selected-text pills, and the `surfaceClass`/`resolveHeader` helpers)
  - `src/server/` — `index.ts` (`createBartHandler`), `context.ts`
    (deterministic lexical selection under a character budget)
  - `src/styles.css` — `--bart-*` theming tokens + all component styling
  - `src/test-setup.ts` — `bun test` preload (wired in the root
    `bunfig.toml`): registers happy-dom, then restores Bun's native
    fetch/stream globals (see gotchas), shims `offsetParent`, silences the
    act() streaming warning
- `apps/playground/` — Vite React app (port 5173, proxies `/api` → 8787);
  `src/` splits into `App.tsx` (composition), `pages.tsx` (the fictional site
  content), and `playground-controls.tsx` (the header's variant/side/launcher
  knobs); `server/` holds the Hono app, scripted mock model, and server
  manifest (port 8787), plus a test pinning the public manifest as the server
  manifest's safe projection

## Commands

From the repo root:

- `bun install` — install everything
- `bun test` — unit tests
- `bun run test:e2e` — Playwright suite (starts or reuses both playground servers)
- `bun run typecheck` — `tsc -p registry && tsc -b apps/playground`
- `bun run playground:server` — Hono mock API on :8787
- `bun run playground` — Vite dev server on :5173 (run both for visual testing)
- `bun run scripts/dev-real.ts [--provider google|openai|anthropic] [--model …]`
  — **optional** local smoke test against a *real* provider (defaults to
  Gemini). Provider-neutral launcher: reads a key from the root `.env`,
  installs the chosen adapter locally (restoring `package.json`/`bun.lock`
  afterward), generates the gitignored `apps/playground/server/*.local.ts`, and
  runs the real API + Vite together. Everything it produces is uncommitted —
  see invariant 12. Not part of dev/CI (those use the mock, no key, no cost).

## Working efficiently

- `registry/src/styles.css` is ~1000 lines — don't read it whole. Every section
  carries a `/* ---------- name ---------- */` marker: grep the marker, then read
  from that offset. Same for `apps/playground/src/App.tsx` (~490).
- Verification ladder, climbed only as far as the change needs: `bun run
  typecheck` → `bun test` (~130 tests: pure logic plus happy-dom component
  contracts) → `bun run test:e2e` (Playwright against the playground; it
  starts both servers itself, or reuses running ones). Screenshots are the most
  expensive output in this repo: take one only when the question is genuinely
  visual (contrast, a band artifact, spacing), clip to the element rather than
  the page, and never as a routine "looks right" check.
- Cursor, focus, and glass bugs here are cascade bugs, not paint bugs. Read the
  Gotchas section and check specificity before opening a browser.
- Don't re-read a file to confirm an edit landed; the edit fails loudly if it
  didn't.
- Commit at checkpoints. Uncommitted work is the expensive thing to lose when a
  long session compacts; `git log` and `git diff` are cheap context recovery.

## Conventions and hygiene rules

- Bun only: `bun add`/`bun remove` for dependencies (never hand-edit versions),
  `bun test`, `bunx`. Never commit npm/pnpm/Yarn lockfiles alongside `bun.lock`.
- Bootstrap new packages/apps with official initializers (`bun init`,
  `bun create vite`, `bunx shadcn@latest init`); don't fabricate foundational
  config from scratch. Inspect generated files before making targeted edits.
- The playground intentionally uses Vite (not `Bun.serve` HTML imports): it
  must mirror what real consumers run.
- Pinned stack: AI SDK v5 (`ai@^5`, `@ai-sdk/react@^2`), `zod@^4`,
  `react-markdown@^10`, `remark-gfm@^4`, Tailwind v4, Hono v4, React 19.
  Verify API shapes against `node_modules` types rather than assuming.
- Registry code must satisfy the playground's strict tsconfig (it is
  typechecked through the app's `tsc -b`): `noUnusedLocals`,
  `verbatimModuleSyntax`, `noUncheckedIndexedAccess`.
- Capability rule: conversation-level functionality (send, stop, errors,
  approvals, quotes, reset) is implemented in the headless core or shared
  chrome first and exposed by every variant. Variant-only behavior must be
  purely presentational or input-method-specific (the spotlight's shortcut and
  latest-exchange view qualify; a variant-only action button would not). The
  contract suite enforces this: new conversation behavior gets a test that
  runs against all three shells.
- Semantic `bart-*` CSS classes live in `registry/src/styles.css`; theming goes
  through the `--bart-primary` / `--bart-accent` (+ `-foreground`) tokens, which
  are also mapped into Tailwind via `@theme inline`. Both light and `.dark`
  values are required; shipped defaults must hold WCAG AA contrast. This applies
  to status colors too: `--bart-danger` / `--bart-danger-border` back
  `.bart-error`, and the dark value is near-white rather than a darkened red,
  because every variant's panel is dark (solid or glass) in that theme.
  Literal colors hardcoded in a rule are the bug — they cannot have a second
  theme.
- Two composition layers, one core. `<BartChat>` is the batteries-included
  default (a variant switch, the thing `bart init` scaffolds); underneath it,
  `<BartProvider>` + the composable parts (`BartHeader`/`BartActions`/
  `BartTitle`/`BartBody`/`BartMessages`/`BartInput`/`NewChatButton`/
  `AutoApproveButton`/`CloseButton`) are the shadcn-style API for consumers who
  want to rearrange the pieces. The parts read shared state from
  `useBartContext` (never prop-drilled `bart`); dock/sidebar take a `children`
  override for the panel body, defaulting to `<BartHeader/>` + `<BartBody/>`.
  **The composable parts are presentation only** — they must never carry
  tool-policy decisions. Security stays in `useBartChat` (invariant 2), so a
  consumer omitting or reordering a button can change what is *shown*, never
  what is *enforced*.
- Shell configuration is props, not forks: `appearance` (`"default"` opaque
  surface — the default — or `"glass"` backdrop blur), `icon` (any node,
  everywhere the brand mark shows), `title` (the shell name), and on
  dock/sidebar `header` (`false` none / node custom) and `inputSeparator`.
  New cosmetic knobs should follow this pattern and be covered by the
  contract suite when they apply to every shell.

## Gotchas

- **Never import `ai/test` in running server code.** Its entry point requires
  vitest and msw at runtime. The playground mock model is a plain
  `LanguageModelV2` object streaming through `simulateReadableStream`.
- Isolated installs mean type packages must be declared where they're used
  (e.g. `@ai-sdk/provider` is a devDependency of the playground for the mock
  model's types).
- The Vite proxy makes the browser origin (`localhost:5173`) differ from the
  API origin (`localhost:8787`), so the playground passes `allowedOrigins`
  explicitly; `createBartHandler` defaults to same-origin otherwise.
- Tailwind cannot auto-detect the symlinked registry package; the playground's
  `index.css` declares `@source "../../../registry/src"`.
- **`.bart-glass` carries no `border` and no `box-shadow` on purpose.** Pairing
  either with `backdrop-filter` on the same element leaves a pale unfiltered
  band around the whole inside perimeter — the blur visibly stops short of the
  edge. The band is fixed-width and unaffected by blur radius, border alpha,
  corner radius, or shadow geometry, so it does not look like it comes from
  those properties; only removing both clears it. An edge or drop shadow has to
  live on a wrapper element instead, so no element has both them and the filter.
  Every variant uses `.bart-glass` when `appearance="glass"`, so glass panels
  deliberately have no border or `box-shadow` — they are edgeless by design,
  separated from the page by the blur and tint alone. The default appearance
  uses `.bart-solid` (opaque `--bart-surface`, no `backdrop-filter`), which is
  why *that* class may carry a plain border — but still no `box-shadow`. A `::after` rim light was tried (a
  pseudo-element is a separate box, so it can carry an edge without re-arming
  the band) and reverted: it read as an unwanted 1px border. Don't reintroduce
  an edge here without asking.
- **A consuming page must paint its background on `<body>` or `<html>`, not on
  an inner wrapper.** The sidebar pushes `<body>` aside with a margin, so a
  background on a wrapper inside `<body>` gets pushed out from behind the panel
  and leaves bare white canvas there. The panel's glass then tints that white
  and reads as a grey slab — glaringly wrong in dark mode. A background on
  `<body>` propagates to the canvas and paints the full viewport, including
  behind the panel. This is why `apps/playground/src/index.css` sets `body`
  background rather than using a Tailwind class on the wrapper `<div>`.
- **Restoring focus to a launcher can't happen inside the close handler.** The
  launcher is unmounted while the panel is open, so a `launcherRef.current
  ?.focus()` called synchronously while closing targets a ref that is still
  null; it silently does nothing and focus falls to `<body>`.
  `useShellLifecycle` owns the fix: pass the launcher as `restoreFocusTo` and
  an effect keyed on the panel's visibility does the `focus()` after the
  commit that puts it back. The dock and sidebar both work this way; don't
  hand-roll it in a variant. The spotlight has no launcher, so it restores to
  whatever held focus before it opened (`restoreRef`), but for the same reason
  it also restores from an effect rather than from the close handler. Keep any
  new variant on one of these two shapes.
- **`[data-bart-ui] button:not(:disabled)` (specificity 0,2,1) outranks a
  single class.** Any button needing its own `cursor` must be exempted there or
  the blanket `pointer` silently wins and the affordance never appears. The
  exemption is `:not(.bart-resize-handle)`, so every resize handle carries
  `.bart-resize-handle` — add it to any new one. This is easy to miss because
  side-scoped rules like `.bart-dock-panel.bart-dock-left .bart-dock-resize`
  score (0,3,0) and win on their own, so the bug can show on one side only.
- **Pointer capture retargets events, not the cursor.** The cursor always
  resolves from the element under the pointer, so a drag that leaves its handle
  reverts to whatever it passes over. The dock therefore adds
  `body.bart-resizing-nwse` / `-nesw` for the duration of a drag, which forces
  the cursor page-wide (`body.bart-resizing-* *` with `!important` — the
  descendant selector and `!important` together are what it takes to outrank
  every element's own cursor) and suppresses text selection. It is removed on
  pointer-up, on pointer-cancel, and by an effect cleanup if the panel unmounts
  mid-drag — all three paths are needed or the page is left stuck with a resize
  cursor. `use-resize-drag.ts` owns this lifecycle so it is written once.
- **The sidebar's width and the page's push margin must move together.** Both
  read `--bart-sidebar-width`, so a resize sets that one variable on `<html>`
  instead of sizing the panel directly — otherwise the panel and the margin
  holding the page open drift apart mid-drag. `body.bart-sidebar-push` also
  eases margin over 0.45s for the open/close slide, which would leave the page
  trailing the pointer, so `body.bart-sidebar-push.bart-resizing-ew` turns that
  transition off for the duration of a drag only.
- **The test DOM is happy-dom, and two of its gaps are load-bearing.** It
  never runs CSS animations, so `animationend` never fires: tests close panels
  by dispatching the event themselves (`fireEvent.animationEnd(panel)`), and a
  hanging close in a test must never be "fixed" by weakening component unmount
  logic. And registering happy-dom replaces `fetch`/`Response`/`ReadableStream`
  with lookalikes the AI SDK rejects ("readable should be ReadableStream") —
  `registry/src/test-setup.ts` restores Bun's natives immediately after
  registration; keep that order.
- The playground `<BartChat key={variant}>` remounts on variant switch, so the
  conversation resets — intentional for the playground.

## Architecture invariants (do not weaken)

1. **Source ownership**: runtime component code is never imported from the CLI
   package; templates are bundled inside the versioned CLI and copied into the
   consumer repo. No remote template downloads at init time.
2. **Headless core owns security**: all tool-policy enforcement (approval
   prompts, route allowlisting, target validation, per-turn navigation caps)
   lives in `useBartChat`/`tool-policy.ts`, never in variant shells. The
   spotlight's minimal chrome gets no reduced security behavior.
3. **Server-side secrets**: provider credentials and model selection are fixed
   server-side and cannot be overridden by browser requests. `system` is a
   server-side option appended to a non-removable security preamble; system
   prompts are never accepted from the browser (the request schema rejects the
   `system` role).
4. **Navigation**: only exact routes from the generated manifest; schemes,
   hosts, protocol-relative URLs, and unknown routes are rejected; navigate
   defaults to `confirm`, executes through the injected router callback (never
   `window.location`), and is capped per assistant turn.
5. **Highlighting**: only registered target ids resolved via
   `data-bart-target` attributes; arbitrary model-generated CSS selectors are
   never accepted; overlay is non-layout-shifting, announced via aria-live,
   auto-cleaned. **Interaction** adds a second opt-in on top of registration:
   the manifest target must be flagged `interactive` (highlightable never
   implies clickable), and at runtime the element must be natively button-like
   and enabled — links are rejected so a click can never bypass the navigate
   tool's route allowlisting, and text inputs are rejected because interact
   clicks, it never types. Clicks are capped per assistant turn.
6. **Context is data, not instructions**: markdown is delimited in
   `<bart-context>` tags and the base system prompt says embedded instructions
   must be ignored and cannot expand tool permissions. Embedded content is
   sanitized on the way in: `neutralizeDelimiters` defuses any `<bart-…`
   sequence so a document can neither close its context block nor open a fake
   one, attribute values are quote-escaped, and the route catalog (also
   content-derived, via front matter) sits inside its own `<bart-catalog>`
   block under the same rules, with newlines collapsed so a crafted title
   cannot fake extra catalog entries.
7. **Request hardening**: schema validation with an allowlist of message part
   shapes (text, step-start, and this handler's own tool parts — anything else
   is rejected, never forwarded to the model), limits on body size / message
   count / message length / output tokens / tool steps / duration, origin
   validation, `authorize(request)` hook, abort on client disconnect
   (`AbortSignal.any` with a timeout). The body limit counts *bytes* and is
   enforced while streaming the request in — never buffer past the cap.
   Configured limits are clamps, not settings: consumers can lower them but
   `LIMIT_CAPS` (server) and the client's navigation/selection caps are hard
   ceilings. Don't log API keys, full prompts, or message bodies.
8. **Tool policies** are `auto` | `confirm` | `disabled` per tool. Defaults:
   highlight `auto`, navigate `confirm`, interact `confirm`. The user-facing
   auto-approve toggle (in every variant) only upgrades `confirm` to `auto`;
   it must never re-enable a tool the consumer set to `disabled`.
9. **Spotlight shortcut** (`/`, remappable) must never fire inside inputs,
   textareas, selects, contenteditable, during IME composition, or with
   modifiers; Escape closes and restores focus.
10. **Selection popup** (`selectionAsk`, default on, opt-out prop) must never
    trigger for text selected inside Bart's own UI — every Bart surface
    carries `data-bart-ui` and the popover checks the selection's ancestors.
    Selections are whitespace-collapsed, deduplicated, capped at 600 chars
    each, and limited to eight pending pills. Dock, sidebar, and spotlight must
    all render and remove items through the shared headless state/composer.
11. **Environment boundary**: the project root is the configured consumer
    workspace directory containing `.bart.json`. Markdown defaults to
    `<project-root>/content/bart`; provider secrets load server-side from the
    root `.env` (`.env.local` may override). Client code never reads secrets or
    uses `VITE_`/`NEXT_PUBLIC_` provider-key variables.
12. **Provider neutrality**: no provider adapter (`@ai-sdk/openai`,
    `@ai-sdk/anthropic`, `@ai-sdk/google`, …) is a dependency of any package in
    this repository, including the playground. The registry's model integration
    depends only on `ai`, `@ai-sdk/react`, and `zod`; its UI additionally uses
    provider-neutral Markdown renderers. Models arrive through the `model`
    option of `createBartHandler`. Provider adapters are installed by the
    future CLI into the *consumer's* project, based on the provider they
    select. The playground runs the scripted mock model only. If a
    real-provider smoke test is ever needed, it belongs behind a separate,
    uncommitted local setup — never in the committed dependency tree. This is
    realized by `scripts/dev-real.ts`: the launcher itself is provider-neutral
    (imports no adapter, favors none), and the adapter install + generated
    `*.local.ts` server it produces are the *only* provider-specific artifacts,
    both kept out of git (manifests restored after install; `*.local.ts`
    gitignored). Keep it that way — don't let a provider adapter reach a
    committed manifest or the generated file get committed.
13. **Distribution allowlist**: consumer installs include only the runtime
    files declared by the selected registry items and their declared consumer
    dependencies. Never bundle `apps/`, `*.test.*`, fixtures, screenshots,
    local environment files, root development manifests, or playground-only
    provider adapters into CLI templates. Use a package `files` allowlist when
    the CLI package is created; do not rely on a blacklist alone.

## Markdown context system (spec for `bart sync`)

Content lives in `<project-root>/content/bart` by default (configurable in
`.bart.json`) with required
front matter `title`, `description`, `route` (unique, relative; external URLs
rejected) and optional `keywords`, `targets` (ids unique per route). Sync
generates a **public manifest** (routes, descriptions, target ids — safe for
the browser) and a **server-only manifest** (markdown bodies). The server
validates the client-reported current route, always includes that page first,
then adds documents by deterministic lexical score under a character budget
(default 40,000 chars ≈ 10k tokens), truncating deterministically. A
server-executed `search_content` tool retrieves further excerpts. Vector
retrieval is deliberately out of V1 scope.

## Testing strategy

- Pure logic (validators, ranking, budgeting, shortcut suppression, resize
  math, server boundary) → `bun test`, no DOM or network. Test files sit next
  to sources (`*.test.ts`).
- Component behavior (open/close/focus, streaming, errors, approvals, reset)
  → the contract suite (`components/variants.contract.test.tsx`): one
  table-driven set of assertions run against dock, sidebar, and spotlight in
  happy-dom, with a queued-fetch mock speaking the AI SDK's SSE wire format.
  It asserts user-visible outcomes, never implementation details — that is
  what let the shell internals be rewritten under it without edits. Variant
  one-offs and `use-shell-lifecycle` edge cases (reopen-mid-exit) have their
  own blocks/files.
- Full flows → the Playwright suite (`apps/playground/e2e/*.e2e.ts` — that
  suffix, never `.test.ts`/`.spec.ts`, or `bun test` picks the file up and
  fails on Playwright's runner check; run with
  `bun run test:e2e`) against the playground with the mock model: real
  streaming, the `/` shortcut, tool approval/denial with actual DOM effects,
  and layout regressions that happy-dom cannot see (e.g. consumer CSS resets).
  New full-flow behavior belongs here only when a real browser is what proves
  it; shell behavior belongs in the contract suite. This suite existing
  unblocks the deferred stylesheet restructure.
- Screenshot-based visual regression only once the design stabilizes.
- The mock model exercises the same handler/transport/streaming/approval paths
  as real providers; provider-specific behavior belongs in a mocked-provider
  unit suite.

## Key decisions (and why)

- shadcn-style copied source over an npm runtime dependency: consumers must be
  able to edit everything; updates flow through content-hash-aware `bart
  update` (install-time hashes recorded in `.bart.json`).
- Next.js App Router + React Router/Vite-with-Hono as the two V1 targets; the
  Fetch-standard `Request -> Response` handler is the portable contract.
- Three UI variants (dock, sidebar, spotlight) as thin shells over one shared
  headless core; `bart init` installs one, `bart add <variant>` adds others.
- V1 provider choices are OpenAI, Anthropic (Claude), and Google Generative AI
  (Gemini). The CLI installs only the adapter required by the selected
  provider/model and keeps its key in the project-root server environment.
- In-memory token-bucket rate limiter for dev with a durable `RateLimiter`
  interface (arbitrary string key; defaults to client IP honoring
  trusted-proxy rules) and a prominent warning when the in-memory limiter runs
  in production. A durable store is not mandatory — zero-external-service
  setup is a core goal.
- Session-only chat history in V1; storage callbacks exist for consumers, but
  no databases, auth systems, analytics, or transcript retention.
- Deferred: vector retrieval, remote content ingestion, persistent history,
  attachments, voice, arbitrary selectors, tools with irreversible external
  side effects.
