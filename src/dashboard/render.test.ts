import assert from "node:assert/strict";
import { test } from "node:test";

// A plain JS module (it's served to the browser as-is); imported by URL so
// TypeScript doesn't look for type declarations.
const render = await import(new URL("./public/render.js", import.meta.url).href);

const hostileRun = {
  startedAt: "2026-09-26T00:00:00.000Z",
  changesFound: 1,
  error: "<script>alert('run')</script>",
  notesProblems: ["v1: link to <iframe src=//evil>"],
  changes: [{
    // the model's reading of a third party's release notes
    version: "v9<img src=x onerror=alert(1)>",
    methodName: "<b onmouseover=alert(2)>charges.create</b>",
    usagesFound: 1,
    error: "Could not parse model output as JSON: <svg onload=alert(3)>",
    patches: [
      { filePath: "a.js", status: "error", error: '" onmouseover="alert(4)' },
      { filePath: "b.js", status: "pr_opened", prUrl: "javascript:alert(5)" },
    ],
  }],
};

test("text from release notes and model output is shown, never run", () => {
  const html: string = render.renderRuns([hostileRun]);
  for (const live of ["<script", "<img", "<svg", "<b ", "<iframe", 'onmouseover="alert(4)', "javascript:"]) {
    assert.ok(!html.includes(live), `rendered live markup: ${live}`);
  }
  assert.ok(html.includes("v9&lt;img src=x onerror=alert(1)&gt;")); // still visible, as text
  assert.ok(html.includes('href="#"')); // the javascript: link was replaced
});

test("status and eval rows are escaped too, and https PR links still work", () => {
  assert.ok(!render.renderStatus({ lastSeenTag: "<img src=x>", lastRunAt: null }).includes("<img"));
  assert.ok(!render.renderEvals([{ timestamp: "<i>t</i>", passed: 1, total: 1 }]).includes("<i>"));
  const ok = render.renderRuns([{ ...hostileRun, changes: [{ ...hostileRun.changes[0], patches: [
    { filePath: "b.js", status: "pr_opened", prUrl: "https://github.com/me/repo/pull/7" },
  ] }] }]);
  assert.ok(ok.includes('href="https://github.com/me/repo/pull/7"'));
});
