import { config } from "./config.js";

const MODEL = "gemini-3.5-flash-lite"; // check https://ai.google.dev for current free-tier model names

export interface PatchResult {
  explanation: string;
  patchedCode: string;
}

export interface DetectedChange {
  version: string; // release tag the change came from, e.g. "v18.0.0"
  entry: string; // human-readable changelog line, e.g. "v18.0.0: `charges.create` removed. Use `paymentIntents.create` instead."
  methodName: string; // dotted call path the scanner should look for, e.g. "charges.create"
}

export interface ReleaseNotes {
  version: string;
  notes: string;
}

async function callGemini(prompt: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${config.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return text.replace(/```json|```/g, "").trim();
}

/**
 * Reads a batch of releases' raw notes in one shot and pulls out any
 * breaking API changes relevant to callers of `packageName`, in the shape
 * the rest of the pipeline expects (the same shape CHANGELOG_ENTRY/
 * METHOD_NAME used to be filled in by hand). Batched into a single call so
 * checking N new releases costs one request, not N — the free-tier Gemini
 * quota is a handful of requests per day.
 */
export async function extractBreakingChanges(
  packageName: string,
  releases: ReleaseNotes[]
): Promise<DetectedChange[]> {
  const releasesText = releases
    .map((r) => `### ${r.version}\n${r.notes}`)
    .join("\n\n");

  const prompt = `You are scanning release notes for breaking API changes in the "${packageName}" SDK.

RELEASES (oldest to newest):
${releasesText}

Identify only changes that would break existing caller code (removed/renamed methods, changed signatures, removed parameters). Ignore additions, deprecations-without-removal, docs, and internal changes.

Return ONLY a JSON array, no markdown fences, no extra text. Each element must have this exact shape:
{"version": "the release tag this change came from, e.g. v18.0.0", "entry": "one-line summary in the form 'v18.0.0: \`old.method\` removed. Use \`new.method\` instead.'", "methodName": "the dotted call path callers would use, e.g. charges.create"}

If there are no breaking changes in any of these releases, return an empty array: []`;

  const cleaned = await callGemini(prompt);

  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    throw new Error(`Could not parse model output as JSON:\n${cleaned}`);
  }
}

/**
 * Sends the breaking-change diff + the affected code snippet to Gemini,
 * and asks it to return a minimal patch as strict JSON.
 */
export async function generatePatch(
  changelogEntry: string,
  affectedFilePath: string,
  affectedCode: string
): Promise<PatchResult> {
  const prompt = `You are fixing code broken by an SDK update.

CHANGELOG ENTRY (what changed in the new SDK version):
${changelogEntry}

FILE: ${affectedFilePath}
CURRENT CODE:
${affectedCode}

Return ONLY a JSON object with this exact shape, no markdown fences, no extra text:
{"explanation": "one sentence on what you changed and why", "patchedCode": "the full corrected file contents"}`;

  const cleaned = await callGemini(prompt);

  try {
    return JSON.parse(cleaned) as PatchResult;
  } catch {
    throw new Error(`Could not parse model output as JSON:\n${cleaned}`);
  }
}
