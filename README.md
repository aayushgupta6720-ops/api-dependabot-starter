# api-dependabot

A multi-step autonomous agent pipeline (detect → scan → patch → PR) that
watches an SDK's changelog for breaking changes, resolves real usages via
AST analysis, and uses an LLM to generate and submit fixing pull requests
without human intervention — going beyond version-bump tools like
Dependabot by actually patching the affected code.

Includes an eval harness that replays real breaking-change fixtures
through the patch generator to catch regressions in output quality, and
fault-tolerant run logging that isolates failures per-item so one bad
patch or PR doesn't abort the rest of a run.

**Stack:** TypeScript, Node.js, LLM integration (Gemini), prompt
engineering, AST analysis (ts-morph), GitHub API/Octokit, agentic
pipeline design, eval harness design

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
- `TARGET_PACKAGE` (optional, defaults to `stripe`) is the package name the
  scanner looks for in `import` statements.
- `TARGET_PACKAGE_REPO` (optional, defaults to `stripe/stripe-node`) is the GitHub
  repo whose Releases the changelog watcher polls for breaking changes.

## Run

```bash
npm run dev
```

This checks `TARGET_PACKAGE_REPO`'s GitHub releases for breaking changes
since the last run (tracked in `.changelog-state.json`), extracts them with
Gemini, then runs scan → generate patch → open PR for each one it finds.
The scanner groups call sites by file, so a file that calls the changed
method several times still gets one patch and one PR.

On the very first run there's no "last seen" marker yet, so it only looks at
the single most recent release — it won't replay the SDK's entire history.

Some releases don't carry their notes: stripe-node's recent ones just say
"See [the changelog](…/CHANGELOG.md#22-7-0-alpha-5) for the full release
notes." For a release that short, the watcher reads that release's section
of the linked changelog instead (found by the link's anchor, or failing that
by a heading starting with the version) and sends that to the model. It
only follows links into `TARGET_PACKAGE_REPO` itself. If the section can't
be read, the run log and dashboard say so and the release stays unseen, so
its breaking changes aren't silently missed.

The marker only moves once every change from those releases has been
handled. If a patch or PR fails, the releases stay unseen and the next run
retries them. Each fix goes on a branch named after its change and file
(`api-dependabot/<version>-<method>-<file>`), so a retry finds the PR an
earlier run opened and skips that file, without a model call. A PR that was
closed counts too, so a fix someone rejected isn't reopened.

## Model and free-tier quota

The model is `gemini-3.5-flash-lite`, set by `MODEL` in `src/llmClient.ts`.
The free tier allows it 500 requests/day per Google project. The bigger
`gemini-3.5-flash` and `gemini-3.6-flash` work too, but get only 20
requests/day each, and a single `npm run eval` uses 10.

`npm run dev` makes no Gemini calls when there are no new releases.
Otherwise it makes one call to extract breaking changes from all new
releases at once, plus one per affected file for each breaking change.
The key goes in an `x-goog-api-key` header rather than the URL, where
proxies and request logs would record it.

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

## Run logging

Every `npm run dev` run appends a JSON entry to `run-log.jsonl` (gitignored,
created on first run): changes found, call sites found, and a per-file outcome
(`pr_opened` / `pr_exists` / `no_change_needed` / `error`; `pr_exists`
means an earlier run already opened that fix). A failure patching or opening
a PR for one file is caught and recorded instead of aborting the rest of
the run — later changes/files in the same run still get processed.

## Dashboard

```bash
npm run dashboard
```

Serves a read-only view at `http://localhost:4200` (override with
`DASHBOARD_PORT`): a feed of past runs (with PR links / error badges),
eval pass-rate history from `eval-results/`, and watcher health (last run,
last seen release tag from `.changelog-state.json`). No new dependencies —
built on Node's built-in `http` server plus a static HTML/JS page.

It listens on `127.0.0.1` only, since the run history (PR links, file
paths, errors) isn't for everyone on your network. `DASHBOARD_HOST=0.0.0.0`
opens it up; there's no auth, so only do that on a network you trust.
Everything it shows is escaped: versions and method names are the model's
reading of someone else's release notes, and errors can quote raw model
output, so none of it is trusted as HTML. An unreadable line in
`run-log.jsonl` or eval file is skipped rather than taking the page down.

## Tests

```bash
npm test
```

Runs offline with Node's built-in test runner (no API keys or network): the
retry logic in `src/pipeline.ts` (what gets marked seen, what a retry
skips), the dashboard's escaping and error handling, and how the Gemini key
is sent.

## What's stubbed vs. real

| Piece | Status |
|---|---|
| Usage scanner (AST-based) | Working — resolves call sites back to a client built from the tracked package, not just text matching, and groups them per file |
| LLM patch generation (Gemini) | Working |
| GitHub PR creation | Working |
| Changelog watcher | Working — polls GitHub Releases, extracts breaking changes via Gemini |
| Eval harness | Working — replays fixtures through the patch generator, grades pass/fail |
| Run logging | Working — every run appends structured results to `run-log.jsonl` |
| Dashboard | Working — read-only view of runs, evals, and watcher health |

## Next steps

Nothing major stubbed out. Possible follow-ups: retention/rotation for
`run-log.jsonl` if it grows large, and auth if the dashboard is ever
exposed beyond localhost.
