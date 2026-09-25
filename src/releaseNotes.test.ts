import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_SECTION_CHARS, changelogSection, pointedChangelog, resolveReleaseNotes } from "./releaseNotes.js";

const WATCHED = "stripe/stripe-node";
const pointer = (anchor: string) =>
  `See [the changelog](https://github.com/stripe/stripe-node/blob/private-preview/CHANGELOG.md#${anchor}) for the full release notes.`;

// The shape of stripe-node's CHANGELOG.md on private-preview (2026-09).
const CHANGELOG = `# Changelog

## <a id="22-7-0-alpha-5"></a>22.7.0-alpha.5 - 2026-09-23
This release changes the pinned API version to \`2026-09-23.preview\`.

* ⚠️ [#2854](https://github.com/stripe/stripe-node/pull/2854) Update generated code
  * ⚠️ Remove support for \`create\` method on resource \`Radar.BillingEvaluation\`

## <a id="22-7-0-alpha-4"></a>22.7.0-alpha.4 - 2026-09-16
* Add support for \`foo\` on \`Charge\`

## <a id="22-7-0"></a>22.7.0 - 2026-09-01
* ⚠️ Remove \`charges.create\`
`;

test("a short body linking into the watched repo's changelog is a pointer", () => {
  assert.deepEqual(pointedChangelog(pointer("22-7-0-alpha-5"), WATCHED), {
    repo: "stripe/stripe-node", ref: "private-preview", path: "CHANGELOG.md", anchor: "22-7-0-alpha-5",
  });
});

test("real notes, links elsewhere and bodies without a link are left alone", () => {
  const longNotes = "* ⚠️ Remove `charges.create`\n".repeat(20) + pointer("22-7-0");
  assert.equal(pointedChangelog(longNotes, WATCHED), null);
  // notes are written by a third party: they can't send the watcher to another repo
  assert.equal(pointedChangelog(pointer("x").replace("stripe/stripe-node", "evil/repo"), WATCHED), null);
  assert.equal(pointedChangelog("Bug fixes.", WATCHED), null);
});

test("the section is found by the link's anchor and stops at the next release", () => {
  const section = changelogSection(CHANGELOG, "22-7-0-alpha-5", "v22.7.0-alpha.5")!;
  assert.ok(section.startsWith('## <a id="22-7-0-alpha-5">'));
  assert.ok(section.includes("Remove support for `create` method on resource `Radar.BillingEvaluation`"));
  assert.ok(!section.includes("22.7.0-alpha.4"));
});

test("without an anchor, the heading that starts with the version is used, exactly", () => {
  const plain = "# Changes\n\n## [v2.1.0] - 2026-01-02\n* Remove `a.b`\n\n## 2.0.0\n* Add `c`\n";
  assert.equal(changelogSection(plain, "missing", "v2.1.0"), "## [v2.1.0] - 2026-01-02\n* Remove `a.b`");
  assert.equal(changelogSection(plain, "missing", "2.0.0"), "## 2.0.0\n* Add `c`");
  // "22.7.0" is its own release, not a prefix of "22.7.0-alpha.5"
  assert.ok(changelogSection(CHANGELOG, "missing", "v22.7.0")!.includes("Remove `charges.create`"));
  assert.equal(changelogSection(CHANGELOG, "missing", "v9.9.9"), null);
});

test("pointer releases get their section; the changelog is fetched once for all of them", async () => {
  const fetches: string[] = [];
  const fetchFile = async (repo: string, ref: string, path: string) => {
    fetches.push(`${repo}/${path}@${ref}`);
    return CHANGELOG;
  };
  const { releases, problems } = await resolveReleaseNotes(
    [
      { version: "v22.7.0-alpha.4", notes: pointer("22-7-0-alpha-4") },
      { version: "v22.7.0-alpha.5", notes: pointer("22-7-0-alpha-5") },
      { version: "v22.6.2", notes: "* Fix a typo" },
    ],
    WATCHED,
    fetchFile
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(fetches, ["stripe/stripe-node/CHANGELOG.md@private-preview"]);
  assert.ok(releases[1].notes.includes("Radar.BillingEvaluation"));
  assert.equal(releases[2].notes, "* Fix a typo");
});

test("a changelog that can't be fetched, or lacks the release, is reported, not skipped silently", async () => {
  const unreachable = await resolveReleaseNotes(
    [{ version: "v22.7.0-alpha.5", notes: pointer("22-7-0-alpha-5") }],
    WATCHED,
    async () => {
      throw new Error("Not Found");
    }
  );
  assert.match(unreachable.problems[0], /^v22\.7\.0-alpha\.5: .*couldn't be read \(Not Found\)/);
  assert.equal(unreachable.releases[0].notes, pointer("22-7-0-alpha-5")); // original body kept

  const missing = await resolveReleaseNotes(
    [{ version: "v23.0.0", notes: pointer("23-0-0") }],
    WATCHED,
    async () => CHANGELOG
  );
  assert.match(missing.problems[0], /no section for this release/);
});

test("an oversized section is cut to the limit", async () => {
  const huge = `## <a id="1-0-0"></a>1.0.0\n${"* ⚠️ Remove `x`\n".repeat(5000)}`;
  const { releases } = await resolveReleaseNotes(
    [{ version: "v1.0.0", notes: pointer("1-0-0") }],
    WATCHED,
    async () => huge
  );
  assert.ok(releases[0].notes.length <= MAX_SECTION_CHARS + "\n[truncated]".length);
  assert.ok(releases[0].notes.endsWith("[truncated]"));
});
