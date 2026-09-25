import assert from "node:assert/strict";
import { test } from "node:test";
import type { DetectedChange } from "./llmClient.js";
import { fixBranchName, processReleases, type PipelineDeps } from "./pipeline.js";

const change: DetectedChange = {
  version: "v18.0.0",
  entry: "v18.0.0: `charges.create` removed. Use `paymentIntents.create` instead.",
  methodName: "charges.create",
};
const opts = { repoPath: "/repo", targetPackage: "stripe" };

/** A fake GitHub + model: remembers the PRs it opened, and can fail a file's first PR. */
function fakes(failFirstPrFor: string[] = []) {
  const prs = new Map<string, string>();
  const failing = new Set(failFirstPrFor);
  const calls = { generatePatch: [] as string[], markedSeen: [] as string[] };
  const deps: PipelineDeps = {
    findUsages: () => ["a.js", "b.js"].map((f) => ({ filePath: `/repo/${f}`, lineNumbers: [5], snippet: `old ${f}` })),
    generatePatch: async (_entry, file, code) => {
      calls.generatePatch.push(file);
      return { explanation: "fixed", patchedCode: code.replace("old", "new") };
    },
    findFixPr: async (branch) => prs.get(branch) ?? null,
    openFixPr: async (branch, file) => {
      if (failing.delete(file)) throw new Error("GitHub 502");
      const url = `https://github.com/me/repo/pull/${prs.size + 1}`;
      prs.set(branch, url);
      return url;
    },
    markReleasesSeen: (tag) => void calls.markedSeen.push(tag),
  };
  return { deps, calls };
}

test("releases are marked seen once every change and file went through", async () => {
  const { deps, calls } = fakes();
  const result = await processReleases({ changes: [change], latestTag: "v18.0.0" }, deps, opts);

  assert.deepEqual(result.changes[0].patches.map((p) => p.status), ["pr_opened", "pr_opened"]);
  assert.equal(result.markedSeen, true);
  assert.deepEqual(calls.markedSeen, ["v18.0.0"]);
});

test("a failed PR leaves the releases unseen, and the retry only redoes that file", async () => {
  const { deps, calls } = fakes(["b.js"]);

  const first = await processReleases({ changes: [change], latestTag: "v18.0.0" }, deps, opts);
  assert.deepEqual(first.changes[0].patches.map((p) => p.status), ["pr_opened", "error"]);
  assert.equal(first.markedSeen, false);

  calls.generatePatch.length = 0;
  const retry = await processReleases({ changes: [change], latestTag: "v18.0.0" }, deps, opts);

  // a.js already has its PR: no second PR, and no model call spent on it
  assert.deepEqual(retry.changes[0].patches.map((p) => [p.filePath, p.status]), [["a.js", "pr_exists"], ["b.js", "pr_opened"]]);
  assert.deepEqual(calls.generatePatch, ["/repo/b.js"]);
  assert.deepEqual(calls.markedSeen, ["v18.0.0"]);
});

test("a batch with no breaking changes still marks its releases seen", async () => {
  const { deps, calls } = fakes();
  await processReleases({ changes: [], latestTag: "v19.0.0" }, deps, opts);
  assert.deepEqual(calls.markedSeen, ["v19.0.0"]);
});

test("a change that fails outright (e.g. the scan throws) also blocks the marker", async () => {
  const { deps, calls } = fakes();
  deps.findUsages = () => {
    throw new Error("parse error");
  };
  const result = await processReleases({ changes: [change], latestTag: "v18.0.0" }, deps, opts);
  assert.equal(result.changes[0].error, "parse error");
  assert.deepEqual(calls.markedSeen, []);
});

test("fix branch names are stable and valid git refs whatever the input", () => {
  assert.equal(fixBranchName(change, "src/billing.js"), fixBranchName(change, "src/billing.js"));
  assert.notEqual(fixBranchName(change, "a.js"), fixBranchName(change, "b.js"));

  const weird = fixBranchName({ ...change, version: "..v1 ~^:?*[", methodName: "a..b\\c d" }, "../x.lock/");
  assert.match(weird, /^api-dependabot\/[A-Za-z0-9._-]+$/);
  assert.doesNotMatch(weird, /\.\.|[.-]$|\/[.-]/);
});
