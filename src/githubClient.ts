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
