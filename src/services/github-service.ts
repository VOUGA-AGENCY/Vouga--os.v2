import { createSign, randomUUID } from "node:crypto";
import { AppError } from "@/domain/validation";
import type { Member, PullRequest } from "@/domain/model";
import { api, required, type ServiceContext } from "./runtime";
import { recordActivity } from "./activity-service";
interface Repo {
  id: number;
  full_name: string;
  html_url: string;
}
interface GithubPR {
  number: number;
  title: string;
  html_url: string;
  state: string;
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  updated_at: string;
  user: { login: string };
  head: { ref: string };
  requested_reviewers?: { login: string }[];
}
export interface GithubPayload {
  installation?: { id: number };
  repository?: Repo;
  sender?: { login: string };
  action?: string;
  ref?: string;
  commits?: {
    id: string;
    message: string;
    timestamp: string;
    url: string;
    author: { name: string };
  }[];
  pull_request?: GithubPR;
  requested_reviewer?: { login: string };
}
async function installationToken(ctx: ServiceContext) {
  const now = Math.floor(Date.parse(ctx.now()) / 1000),
    header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
      "base64url",
    ),
    payload = Buffer.from(
      JSON.stringify({
        iat: now - 60,
        exp: now + 540,
        iss: required(ctx.env, "GITHUB_APP_ID"),
      }),
    ).toString("base64url");
  const sign = createSign("RSA-SHA256");
  sign.update(`${header}.${payload}`);
  sign.end();
  const jwt = `${header}.${payload}.${sign.sign(required(ctx.env, "GITHUB_APP_PRIVATE_KEY").replace(/\\n/g, "\n")).toString("base64url")}`;
  const result = await api<{ token: string }>(
    ctx,
    "github",
    `https://api.github.com/app/installations/${required(ctx.env, "GITHUB_INSTALLATION_ID")}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  return result.token;
}
async function github<T>(ctx: ServiceContext, path: string, token: string) {
  return api<T>(ctx, "github", `https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}
export async function listRepositories(ctx: ServiceContext) {
  const token = await installationToken(ctx);
  const repos: Repo[] = [];
  for (let page = 1; page <= 100; page++) {
    const result = await github<{ repositories: Repo[] }>(
      ctx,
      `/installation/repositories?per_page=100&page=${page}`,
      token,
    );
    repos.push(...result.repositories);
    if (result.repositories.length < 100) break;
  }
  return repos;
}
export async function linkRepository(
  ctx: ServiceContext,
  me: Member,
  projectId: string,
  repositoryId: number,
) {
  if (me.role !== "admin")
    throw new AppError("Só administradores podem ligar repositórios.", 403);
  const repo = (await listRepositories(ctx)).find(
    (item) => item.id === repositoryId,
  );
  if (!repo)
    throw new AppError("Repositório fora da instalação autorizada.", 403);
  await ctx.repo.transact((data) => {
    const project = data.projects.find((item) => item.id === projectId);
    if (!project) throw new AppError("Projeto não encontrado.", 404);
    project.repositories ??= [];
    if (!project.repositories.some((item) => item.id === repo.id))
      project.repositories.push({
        id: repo.id,
        fullName: repo.full_name,
        url: repo.html_url,
      });
    project.version++;
    const connection = data.externalConnections.find(
      (item) => item.id === "github",
    );
    if (connection) connection.status = "connected";
    else
      data.externalConnections.push({
        id: "github",
        provider: "github",
        label: "Vouga",
        status: "connected",
        externalId: ctx.env.GITHUB_INSTALLATION_ID,
      });
  });
  const token = await installationToken(ctx);
  for (let page = 1; page <= 100; page++) {
    const prs = await github<GithubPR[]>(
      ctx,
      `/repos/${repo.full_name}/pulls?state=open&per_page=100&page=${page}`,
      token,
    );
    await ctx.repo.transact((data) => {
      for (const pr of prs)
        upsertPR(data.pullRequests, projectId, repo.id, pr, ctx.now());
    });
    if (prs.length < 100) break;
  }
  await importRecentCommits(ctx, projectId, repo, token);
}
function upsertPR(
  prs: PullRequest[],
  projectId: string,
  repositoryId: number,
  pr: GithubPR,
  now: string,
) {
  const existing = prs.find(
    (item) =>
      item.projectId === projectId &&
      item.repositoryId === repositoryId &&
      item.number === pr.number,
  );
  const next: PullRequest = {
    ...(existing ?? {
      id: randomUUID(),
      version: 0,
      createdAt: now,
      createdBy: "github",
    }),
    version: (existing?.version ?? 0) + 1,
    updatedAt: pr.updated_at || now,
    projectId,
    repositoryId,
    title: pr.title,
    url: pr.html_url,
    number: pr.number,
    state:
      pr.merged || pr.merged_at
        ? "merged"
        : pr.state === "closed"
          ? "closed"
          : pr.draft
            ? "draft"
            : "open",
    author: pr.user.login,
    branch: pr.head.ref,
    reviewRequested:
      pr.requested_reviewers?.map((reviewer) => reviewer.login) ?? [],
  };
  if (existing) {
    if (existing.updatedAt <= next.updatedAt) Object.assign(existing, next);
  } else prs.push(next);
}
export async function applyGithubEvent(
  ctx: ServiceContext,
  delivery: string,
  event: string,
  payload: GithubPayload,
) {
  if (String(payload.installation?.id) !== ctx.env.GITHUB_INSTALLATION_ID)
    throw new AppError("Instalação GitHub não autorizada.", 403);
  if (!payload.repository) return;
  await ctx.repo.transact((data) => {
    for (const project of data.projects.filter((item) =>
      item.repositories?.some((repo) => repo.id === payload.repository!.id),
    )) {
      if (
        data.activity.some(
          (item) => item.externalKey === `github:${delivery}:${project.id}`,
        )
      )
        continue;
      const base = {
        actorId: "github",
        actorName: payload.sender?.login,
        timestamp: ctx.now(),
        source: "github" as const,
        entityType: "project" as const,
        entityId: project.id,
        projectId: project.id,
      };
      if (event === "push" && payload.commits?.length)
        recordActivity(data, {
          ...base,
          type: "github.commit_pushed",
          summary: `${payload.commits.length} commits pushed to ${payload.ref?.replace("refs/heads/", "")}`,
          metadata: {
            repositoryId: payload.repository!.id,
            branch: payload.ref,
            commits: payload.commits.map((commit) => ({
              sha: commit.id,
              message: commit.message,
              url: commit.url,
              author: commit.author.name,
              timestamp: commit.timestamp,
            })),
          },
          externalKey: `github:${delivery}:${project.id}`,
        });
      if (payload.pull_request) {
        const pr = payload.pull_request;
        upsertPR(
          data.pullRequests,
          project.id,
          payload.repository!.id,
          pr,
          ctx.now(),
        );
        const type =
          payload.action === "review_requested"
            ? "github.review_requested"
            : pr.merged || pr.merged_at
              ? "github.pull_request_merged"
              : payload.action === "opened"
                ? "github.pull_request_opened"
                : event === "pull_request_review"
                  ? "github.review_submitted"
                  : "github.pull_request_updated";
        recordActivity(data, {
          ...base,
          type,
          summary: `PR #${pr.number} · ${pr.title} · ${payload.action}`,
          metadata: {
            url: pr.html_url,
            number: pr.number,
            author: pr.user.login,
            branch: pr.head.ref,
            reviewer: payload.requested_reviewer?.login,
            repositoryId: payload.repository!.id,
          },
          externalKey: `github:${delivery}:${project.id}`,
        });
      }
    }
  });
}

interface GithubCommit {
  sha: string;
  html_url: string;
  author?: { login: string } | null;
  commit: { message: string; author: { name: string; date: string } };
}
async function importRecentCommits(
  ctx: ServiceContext,
  projectId: string,
  repo: Repo,
  token: string,
) {
  const commits = await github<GithubCommit[]>(
    ctx,
    `/repos/${repo.full_name}/commits?per_page=30`,
    token,
  );
  await ctx.repo.transact((data) => {
    if (
      !data.projects.some(
        (p) =>
          p.id === projectId && p.repositories?.some((r) => r.id === repo.id),
      )
    )
      throw new AppError("Repositório já não está associado ao projeto.", 409);
    for (const commit of commits)
      recordActivity(data, {
        type: "github.commit_pushed",
        actorId: "github",
        actorName: commit.author?.login || commit.commit.author.name,
        timestamp: commit.commit.author.date,
        source: "github",
        entityType: "project",
        entityId: projectId,
        projectId,
        summary: `${commit.sha.slice(0, 7)} · ${commit.commit.message.split("\n")[0]}`,
        metadata: {
          sha: commit.sha,
          url: commit.html_url,
          repositoryId: repo.id,
          imported: true,
        },
        externalKey: `github:commit:${repo.id}:${commit.sha}:${projectId}`,
      });
  });
}
export async function syncProjectGithub(
  ctx: ServiceContext,
  me: Member,
  projectId: string,
) {
  if (me.role !== "admin")
    throw new AppError(
      "Só administradores podem sincronizar repositórios.",
      403,
    );
  const project = (await ctx.repo.read()).projects.find(
    (p) => p.id === projectId,
  );
  if (!project) throw new AppError("Projeto não encontrado.", 404);
  for (const repo of project.repositories ?? [])
    await linkRepository(ctx, me, projectId, repo.id);
}
