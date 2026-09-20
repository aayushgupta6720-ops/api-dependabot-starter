import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const config = {
  geminiApiKey: required("GEMINI_API_KEY"),
  githubToken: required("GITHUB_TOKEN"),
  targetRepo: required("TARGET_REPO"), // "owner/repo"
  targetPackage: process.env.TARGET_PACKAGE ?? "stripe",
  targetPackageRepo: process.env.TARGET_PACKAGE_REPO ?? "stripe/stripe-node", // GitHub repo whose releases we watch for breaking changes
};
