# api-dependabot

Detects SDK breaking changes and opens a fixing PR automatically.

## Setup

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY, GITHUB_TOKEN, TARGET_REPO
```

- Get a free Gemini key: https://aistudio.google.com/apikey
- Create a GitHub token with `repo` scope: https://github.com/settings/tokens
- `TARGET_REPO` should be a throwaway repo you own, e.g. `yourname/test-repo`,
  containing some sample code that calls the SDK you're tracking.
- Clone that same repo locally into `./target-repo` (the scanner reads it from disk).
- `TARGET_PACKAGE_REPO` (optional, defaults to `stripe/stripe-node`) is the GitHub
  repo whose Releases the changelog watcher polls for breaking changes.

## Run

```bash
npm run dev
```

This checks `TARGET_PACKAGE_REPO`'s GitHub releases for breaking changes
since the last run (tracked in `.changelog-state.json`), extracts them with
Gemini, then runs scan → generate patch → open PR for each one it finds.

On the very first run there's no "last seen" marker yet, so it only looks at
the single most recent release — it won't replay the SDK's entire history.

## Eval harness

```bash
npm run eval
```

Replays a fixed set of breaking-change fixtures (`src/eval/fixtures.ts`)
straight through `generatePatch`, checks the output against each fixture's
`mustContain`/`mustNotContain` substrings, and writes full results
(explanations + patched code, not just pass/fail) to `eval-results/`.

The bundled fixtures are 10 real breaking changes pulled straight from
[stripe-node's own CHANGELOG](https://github.com/stripe/stripe-node/blob/master/CHANGELOG.md)
(v6.21.0 through v22.0.0), each citing the release it shipped in. If you
point `TARGET_PACKAGE_REPO` at a different SDK, swap these out for that
SDK's own history the same way.

## What's stubbed vs. real

| Piece | Status |
|---|---|
| Usage scanner (AST-based) | Working — resolves call sites back to a client built from the tracked package, not just text matching |
| LLM patch generation (Gemini) | Working |
| GitHub PR creation | Working |
| Changelog watcher | Working — polls GitHub Releases, extracts breaking changes via Gemini |
| Eval harness | Working — replays fixtures through the patch generator, grades pass/fail |

## Next steps

Only remaining item is the dashboard — it's not needed to prove the idea
works, so it's deliberately last.
