# @side/replace-comment-html-action

GitHub Action that upserts HTML inside an issue/PR comment via CSS selectors. Two modes: `upsert` (replace existing or append) and `create-only` (never overwrite). When `parent-selector` is set, `selector` is treated as nested inside that parent and the parent comment body is updated in place. Consumed by other workflows as `uses: reside-eng/replace-comment-html-action@vN`.

## Stack

Yarn 4, Node 24 (engines `^24.0.0`), TypeScript 6 (`@tsconfig/node24`), ESM (`"type": "module"`). **Biome** (lint + format), **Lefthook** (hooks), **Vitest** (tests + coverage), **esbuild** (bundle to `dist/index.mjs`), **commitlint** (Conventional Commits).

`src/`:
- `index.ts` — entry; reads action inputs and dispatches to `action()`.
- `action.ts` — core upsert logic via cheerio. `reorderTableRows` groups `<tr id="preview-link-<env>-<service>">` rows by environment with `rowspan` merging — non-obvious and the highest-edge-case area.
- `github.ts` — Octokit wrapper (`findExistingComment` / `updateComment` / `createComment`). Reads action inputs at module load (`getOctokit(getInput('token'))`), so tests must mock `@actions/core` and `@actions/github` *before* importing it.

## Commands

```bash
yarn check              # Biome — fails on warnings
yarn check:fix          # auto-fix lint + format
yarn types:check        # tsc --noEmit
yarn test:cov           # vitest run --coverage (gate: 75% lines/statements)
yarn build              # rimraf dist/ && node build.mjs (esbuild → dist/index.mjs)
```

## Conventions

- Biome enforces single quotes, 2-space, LF — no ESLint, Prettier, Husky, or lint-staged.
- Conventional Commits via commitlint (`commit-msg` hook). Use `feat!:` or a `BREAKING CHANGE:` footer to trigger a semantic-release major bump.
- Pre-commit auto-restages Biome fixes and runs `tsc --noEmit`. Never `--no-verify` — fix the underlying issue.
- Relative imports use the `.js` extension; Node built-ins use the `node:` protocol.
- `dist/` is gitignored on `main`. The release workflow rebuilds `dist/index.mjs` and force-commits it to the `v<major>` branch on each release — do not edit `dist/` by hand.
