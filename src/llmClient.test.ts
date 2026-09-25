import assert from "node:assert/strict";
import { test } from "node:test";

// config.ts requires these at import; set before loading llmClient. dotenv
// doesn't override variables that are already set, so the real .env is unused.
process.env.GEMINI_API_KEY = "test-key-123";
process.env.GITHUB_TOKEN ??= "unused";
process.env.TARGET_REPO ??= "me/repo";

test("the Gemini API key goes in a header, not the URL", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), headers: init.headers as Record<string, string> });
    const text = JSON.stringify({ explanation: "x", patchedCode: "y" });
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }));
  }) as typeof fetch;

  const { generatePatch } = await import("./llmClient.js");
  await generatePatch("entry", "a.js", "code");

  assert.equal(seen.length, 1);
  assert.ok(!seen[0].url.includes("key="), seen[0].url);
  assert.ok(!seen[0].url.includes("test-key-123"));
  assert.equal(seen[0].headers["x-goog-api-key"], "test-key-123");
});
