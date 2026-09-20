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

## What's stubbed vs. real

| Piece | Status |
|---|---|
| Usage scanner (AST-based) | Working — flags call sites by method name |
| LLM patch generation (Gemini) | Working |
| GitHub PR creation | Working |
| Changelog watcher | Working — polls GitHub Releases, extracts breaking changes via Gemini |
| Eval harness | **Not built yet** |

## Next steps (in order)

1. **Tighten the scanner**: the current match is "call expression text
   contains the method name" — this will false-positive on comments and
   unrelated methods with similar names. Add proper call-target resolution.
2. **Build the eval harness**: collect 10-15 real historical breaking
   changes for your target SDK, replay them, and log pass/fail.
3. Only then consider the dashboard — it's not needed to prove the idea works.
