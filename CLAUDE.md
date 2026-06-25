# CLAUDE.md — QubeKit

QubeKit is a collaborative, multiplayer **mechanical construction kit** (bricks,
beams, gears, axles, motors, sensors, programmable logic) and the flagship demo
for the Qubeworlds stack: *build a machine together in the browser, program it in
Q64, simulate it in Quine, publish it on Qubepods.* The product vision is
`Plan.md`; the build roadmap is `PHASED_PLAN.md`.

## Audience & secrets — QubeKit will go public

This repo is **destined to be public.** Write and commit accordingly — treat
everything here as **permanently public** (a history rewrite is an emergency
measure, not an undo button).

- **Never commit identity or infrastructure values** — not in docs, examples, or
  comments: credentials/API tokens/secrets, account identifiers, **account
  emails**, personal emails, or provider resource ids (D1/KV/zone/Secrets-Store
  ids). Use `<account-id>`-style placeholders + "look it up with `wrangler
  whoami`". Env var *names* (`CLOUDFLARE_API_TOKEN_STAGE`, …) are fine; their
  *values* are not. CI uses repo secrets; real `wrangler.jsonc` is gitignored
  (commit a `wrangler.example.jsonc` with placeholders).
- **Write docs for the real audience.** Contributors change things **by PR**;
  they never deploy and hold no infrastructure access. Operator-only runbooks
  (how a world ships, account setup, console steps) belong in the maintainers'
  private notes, not here. If a doc says "you" and the reader can't do the
  action, it's addressed wrong.

## The one rule: QubeKit is framework + data; the platform repos are generic hosts

Every neighbouring repo keeps a hard agnosticism boundary, and QubeKit lives on
the *content* side of all of them. **Do not push QubeKit concepts into the
platform.**

- **Quine** (`qubeworlds/quine`) — the engine "knows NOTHING about content." We add
  only *generic* engine capabilities there (physics joints, a nearest-port
  spatial query, live entity-mutation exports). Never a "beam"/"gear" concept.
- **Q64** (`q64-lang/q64`) — "a language, it does not know QubeKit." No
  `part`/`snap` keywords. Parts/controllers are ordinary Q64 records + `face`/`fit`
  + the `@realtime` effect. Compiler asks go upstream as *general-purpose* pulls
  (tracked in **q64-lang/q64#36**).
- **Qubepods** (`taluvi-dev/qubepods`) — a generic stateful host. QubeKit's
  authoritative world logic ships as a **portable library** (`packages/sim`) that
  the qubepods stateful runtime imports; qubepods stays domain-free.
- **world** (`qubeworlds/world`) — owns the `qubegame` op-replication transport
  (rev/origin envelope) and the `mountScene` overlay path. QubeKit reuses both;
  it owns only its *op vocabulary* and its overlay UI.

What lives **here**: the domain model + specs, the portable world logic, the
construction client + overlay UI, the parts catalog (data), example worlds, and
build-time content tools. What does **not**: engine code, runtime infra, compiler
features, or the base transport — those stay in their repos.

## Layout

```
spec/                 # Phase-0 contracts: parts.md, assembly.md, protocol.md (source of truth)
packages/
  schema/             # shared TS types + validators (Part, SnapPort, Connection, ops)
  sim/                # PORTABLE authoritative world logic — imported by qubepods' stateful runtime
  client/             # construction client (snap resolution, optimistic apply, transport glue)
  overlay/            # Build/Simulate UI — Svelte 5 runes, scene overlay, touch-first
q64/                  # Q64 library qube: domain records + @realtime controllers
catalog/              # parts catalog as DATA (geometry refs + ports + mass)
worlds/               # example qubekit.world projects (the rover-builder demo)
tools/                # build-time content tools (catalog→scene, publish) — never shipped in wasm
docs/                 # authoring guides; lessons
```

## Toolchain & environment — `init.sh`

`init.sh` is the single setup entry point (idempotent, safe to re-run). It:
1. runs `pnpm install` for the workspace, and
2. fetches the prebuilt **q64 + qube** binaries from GitHub releases into `./bin`
   (see below) so `qube build` / `qube run` work without a from-source build.

**Claude Code on the web** runs it automatically via the SessionStart hook
(`.claude/hooks/session-start.sh` → `init.sh`, gated on `CLAUDE_CODE_REMOTE`),
so a fresh cloud session is build-ready in seconds. Locally, run `./init.sh`
yourself once.

## Getting `q64` / `qube` — prefer the GitHub release, don't build q64 from source

QubeKit does **not** modify q64, so never clone and build the q64 repo here (the
from-source Binaryen build is slow). Pull the prebuilt native binaries from the
`q64-lang/q64` GitHub release — this is exactly what `init.sh` does:

```sh
base=https://github.com/q64-lang/q64/releases/latest/download
curl -fsSL "$base/q64-linux-amd64"  -o bin/q64  && chmod +x bin/q64
curl -fsSL "$base/qube-linux-amd64" -o bin/qube && chmod +x bin/qube
curl -fsSL "$base/manifest.json"    -o bin/manifest.json   # lists every platform URL + sha256 — verify before trusting
```

The release ships native `q64` (linux-amd64 + macOS amd64/arm64) and `qube`
(linux + macOS, amd64/arm64). Build q64 from source **only** if a task actually
changes q64 itself — which belongs in `q64-lang/q64`, not here.

## Preview — the live editor shell (fast-iterate loop)

`apps/preview/` is a **static-asset qube** (the editor shell: quine engine from
the CDN + QubeKit chrome). It's the visibility surface — deploy it and watch
changes on a real device (the iPad floor).

- **Live URL:** <https://qubekit-preview.qubepod.app/>
- **One-time auth** — mint a **deploy-scoped** token in the qubepods console
  (app.qubepods.com, project `qubekit`), then:
  ```sh
  qube pod login --url https://api.qubepods.com --token <deploy-token>
  ```
  Saved in `~/.qube/pods.toml` (gitignored location). **Never commit the token.**
- **Deploy** (one command, re-run after any change):
  ```sh
  apps/preview/deploy.sh
  ```
  It zips `qubepod.jsonc` + `web/` and POSTs to `api.qubepods.com/api/deploy`
  (reads the token from `pods.toml`, or `$QUBEPODS_TOKEN`). Returns the
  `*.qubepod.app` URL.

Notes: this deploys to **prod qubepods** (the token is prod-scoped). The native
`qube` CLI has no static `qube deploy` yet (only `qube pod deploy`, which needs a
component) — the script does what the Qubonaut shell's `qube deploy` does. From
inside Qubonaut you can instead just `cd apps/preview && qube deploy`.

## Deploy — Cloudflare stage and prod are SEPARATE accounts

Worlds and any QubeKit Workers deploy to Cloudflare, and **stage and prod are two
different Cloudflare accounts with two different API tokens.** A token is valid on
exactly one account — never assume one works for both, or you silently target the
wrong account.

Cloud sessions provide both pairs as env vars. **The `_STAGE` suffix is stage;
unsuffixed is prod:**

| Env var | Account | Use |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | **prod** | `wrangler … --env prod`, prod deploys |
| `CLOUDFLARE_API_TOKEN_STAGE` / `CLOUDFLARE_ACCOUNT_ID_STAGE` | **stage** | `wrangler … --env stage`, stage deploys |

Rules of the road:
- Deploy via a **named env** (`pnpm run deploy:stage` / `deploy:prod`). Each
  worker's `wrangler.jsonc` pins the right `account_id` per env, so the scripts
  hit the right account on their own — **do not override `CLOUDFLARE_ACCOUNT_ID`**
  on a deploy.
- For a raw `wrangler`/`curl` op against **stage**, pass the stage pair
  explicitly (`CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN_STAGE"
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID_STAGE" wrangler …`) — the bare
  names point at **prod**.
- **These are CLI/deploy creds; a deployed Worker can't read them.** Runtime
  secrets come from the per-account **Secrets Store**, with names carrying the env
  postfix (`…_STAGE` / `…_PROD`). Never commit secret **values**, account IDs, or
  account emails — look concrete IDs up with `wrangler whoami`. Treat everything
  committed as permanently public.
- Never deploy to **prod** without clear permission.

## Conventions

- Package manager: **pnpm** workspaces. Run commands from each package dir.
- Deploy target: **Cloudflare Workers** (`wrangler.jsonc`, never `.toml`).
- UI: **Svelte 5 runes** (`$state`/`$derived`/`$props`), dark theme, the overlay
  mounts via `world`'s `mountScene` path (`mount(el, host)`), **touch-first** —
  iPad is the editing floor, phone is the run floor.
- Qube ids are **snake_case**, dotted namespace, **no hyphens** (a hyphen in a
  qube name is rejected by `qube`).
- Engine renders **WebGL2** by default (WebGPU opt-in).
- Conventional commits (`feat:`/`fix:`/`docs:`/`refactor:`/`test:`).
