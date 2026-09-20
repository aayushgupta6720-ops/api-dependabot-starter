import { Octokit } from "@octokit/rest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { config } from "./config.js";
import { extractBreakingChanges, type DetectedChange } from "./llmClient.js";

const octokit = new Octokit({ auth: config.githubToken });
const [owner, repo] = config.targetPackageRepo.split("/");

const STATE_PATH = "./.changelog-state.json";

interface WatcherState {
  lastSeenTag: string | null;
}

function loadState(): WatcherState {
  if (!existsSync(STATE_PATH)) return { lastSeenTag: null };
  return JSON.parse(readFileSync(STATE_PATH, "utf8"));
}

function saveState(state: WatcherState) {
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/**
 * Fetches GitHub releases for config.targetPackageRepo published since the
 * last run, and asks the LLM to pull structured breaking changes out of
 * their notes in a single batched call. Advances the on-disk "last seen"
 * marker so re-runs only look at genuinely new releases.
 */
export async function checkForBreakingChanges(): Promise<DetectedChange[]> {
  const state = loadState();

  const { data: releases } = await octokit.repos.listReleases({
    owner,
    repo,
    per_page: 20,
  });

  // GitHub returns newest first; walk oldest-to-newest so the state marker
  // advances in order and nothing in between gets skipped.
  const ordered = [...releases].reverse();

  const lastSeenIndex = state.lastSeenTag
    ? ordered.findIndex((r) => r.tag_name === state.lastSeenTag)
    : -1;

  const unseen =
    lastSeenIndex === -1
      ? ordered.slice(-1) // first run (or marker fell off the page): just the latest release
      : ordered.slice(lastSeenIndex + 1);

  const releasesWithNotes = unseen
    .filter((r) => r.body)
    .map((r) => ({ version: r.tag_name, notes: r.body! }));

  const found =
    releasesWithNotes.length > 0
      ? await extractBreakingChanges(config.targetPackage, releasesWithNotes)
      : [];

  if (unseen.length > 0) {
    saveState({ lastSeenTag: unseen[unseen.length - 1].tag_name });
  }

  return found;
}
