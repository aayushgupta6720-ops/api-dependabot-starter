import { Octokit } from "@octokit/rest";
import { config } from "./config.js";

const octokit = new Octokit({ auth: config.githubToken });
const [owner, repo] = config.targetRepo.split("/");

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

  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });

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
