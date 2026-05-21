# @side/replace-comment-html-action

GitHub Action that upserts HTML inside a GitHub issue/PR comment using CSS selectors. Entry point bundled to `dist/index.mjs` and consumed via `uses: reside-eng/replace-comment-html-action@vN` from other workflows.

## Stack

Yarn 4, Node 24 (engines `^24.0.0`), TypeScript 6 (`@tsconfig/node24`), ESM (`"type": "module"`). **Biome** (lint + format), **Lefthook** (hooks), **Vitest** (tests + coverage), **esbuild** (bundle to `dist/index.mjs`), **commitlint** (Conventional Commits).

`src/`:
- `index.ts` — entry; reads action inputs and dispatches to `action()`
- `action.ts` — core comment-upsert logic (cheerio DOM manipulation, environment-grouped table reordering)
- `github.ts` — Octokit wrapper (`findExistingComment`, `updateComment`, `createComment`)

## Commands

```bash
yarn check              # Biome (fails on warnings)
yarn check:fix          # auto-fix lint + format
yarn check:fix:staged   # used by lefthook pre-commit
yarn types:check        # tsc --noEmit
yarn test               # vitest run
yarn test:cov           # vitest run --coverage (gate: 75% lines/statements)
yarn build              # rimraf dist/ && node build.mjs (esbuild -> dist/index.mjs)
```

## Conventions

- Biome enforces single quotes, 2-space, LF — no ESLint, Prettier, Husky, or lint-staged.
- Conventional Commits (commitlint via `commit-msg` hook).
- Pre-commit auto-restages Biome fixes and runs `tsc --noEmit`. Never `--no-verify` — fix the underlying issue.
- Relative imports use `.js` extension; Node built-ins use the `node:` protocol.
- `dist/` is rebuilt and committed by the release workflow's "Push updates to branch for major version" step; do not edit `dist/` by hand.

## Release

`semantic-release` (`semantic_version: ^25`) via `cycjimmy/semantic-release-action@v6.0.0` on pushes to `main`/`next`/`alpha`/`beta`/`N.x`. New major versions get a `vN` branch pointing at the latest commit with the built `dist/` amended in — that's the ref consumers use (`reside-eng/replace-comment-html-action@v1`).

## Atlassian

Cloud ID `residenetwork.atlassian.net` for all Atlassian MCP calls.

## Side org context

Side-wide context lives in a sibling `../side-ai-context/` directory; the parent `CLAUDE.md` (workspace root above this repo) lists the canonical files.
