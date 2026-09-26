import { Octokit } from "@octokit/rest";
import { config } from "./config.js";

const octokit = new Octokit({ auth: config.githubToken });
const [owner, repo] = config.targetRepo.split("/");

/** The URL of any PR ever opened from `branch` (open, closed or merged), or
 * null. A closed one counts too: if someone closed a fix, a retry shouldn't
 * open it again. */
export async function findFixPr(branch: string): Promise<string | null> {
  const { data } = await octokit.pulls.list({ owner, repo, head: `${owner}:${branch}`, state: "all", per_page: 1 });
  return data[0]?.html_url ?? null;
}

export async function openFixPr(
  branchName: string,
  filePath: string,
  newContent: string,
  prTitle: string,
  prBody: string
) {
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const baseBranch = repoData.default_branch;

  const { data: ref } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });

  try {
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });
  } catch (err) {
    // 422: the branch is left over from an earlier attempt that failed before
    // opening its PR. Reuse it; the commit below updates the file on it.
    if ((err as { status?: number }).status !== 422) throw err;
  }

  const { data: existingFile } = await octokit.repos.getContent({
    owner,
    repo,
    path: filePath,
    ref: branchName,
  });

  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: prTitle,
    content: Buffer.from(newContent).toString("base64"),
    branch: branchName,
    sha: (existingFile as any).sha,
  });

  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: prTitle,
    head: branchName,
    base: baseBranch,
    body: prBody,
  });

  return pr.html_url;
}

export interface FixPr {
  number: number;
  url: string;
  state: string; // "open" or "closed"
  title: string;
  body: string;
  headRef: string;
  baseSha: string; // the base commit the PR's diff is against
  files: string[]; // paths the PR changes
}

export async function getFixPr(number: number): Promise<FixPr> {
  const { data: pr } = await octokit.pulls.get({ owner, repo, pull_number: number });
  const { data: files } = await octokit.pulls.listFiles({ owner, repo, pull_number: number, per_page: 100 });
  return {
    number,
    url: pr.html_url,
    state: pr.state,
    title: pr.title,
    body: pr.body ?? "",
    headRef: pr.head.ref,
    baseSha: pr.base.sha,
    files: files.map((f) => f.filename),
  };
}

/** A file of TARGET_REPO at a ref: its text, and the blob sha an update needs. */
export async function readRepoFile(filePath: string, ref: string): Promise<{ content: string; sha: string }> {
  const { data } = await octokit.repos.getContent({ owner, repo, path: filePath, ref });
  if (Array.isArray(data) || data.type !== "file") throw new Error(`${filePath} at ${ref} isn't a file`);
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

/** Commit `content` to the PR's branch as `filePath`, and set its title and body. */
export async function updateFixPr(pr: FixPr, filePath: string, content: string, title: string, body: string): Promise<void> {
  const { sha } = await readRepoFile(filePath, pr.headRef);
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: filePath,
    message: title,
    content: Buffer.from(content).toString("base64"),
    branch: pr.headRef,
    sha,
  });
  await octokit.pulls.update({ owner, repo, pull_number: pr.number, title, body });
}
