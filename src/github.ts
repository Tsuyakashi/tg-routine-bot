const GITHUB_API = "https://api.github.com";

interface GithubConfig {
  owner: string;
  repo: string;
  token: string;
}

export function getGithubConfig(): GithubConfig {
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) {
    throw new Error("GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN must be set in .env");
  }
  return { owner, repo, token };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export interface WorkflowRun {
  id: number;
  status: string; // queued | in_progress | completed
  conclusion: string | null;
  created_at: string;
  html_url: string;
}

/** Триггерит workflow_dispatch. Кидает, если GitHub ответил не 2xx. */
export async function dispatchWorkflow(workflowFile: string, ref = "main"): Promise<void> {
  const { owner, repo, token } = getGithubConfig();
  const res = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: { ...headers(token), "Content-Type": "application/json" },
      body: JSON.stringify({ ref }),
    },
  );
  if (!res.ok) {
    throw new Error(`dispatch failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * GitHub не возвращает run_id из dispatch напрямую, поэтому ищем свежий run
 * этого workflow, созданный после момента отправки команды.
 */
export async function findRunAfter(
  workflowFile: string,
  since: Date,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<WorkflowRun> {
  const { timeoutMs = 30_000, intervalMs = 3_000 } = opts;
  const { owner, repo, token } = getGithubConfig();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?event=workflow_dispatch&per_page=5`,
      { headers: headers(token) },
    );
    if (!res.ok) throw new Error(`list runs failed: ${res.status}`);
    const data = (await res.json()) as { workflow_runs: WorkflowRun[] };
    const run = data.workflow_runs.find((r) => new Date(r.created_at) >= since);
    if (run) return run;
    await sleep(intervalMs);
  }
  throw new Error("run не появился в списке — GitHub не подхватил dispatch вовремя");
}

/** Поллит run до status=completed. Дефолтный таймаут покрывает деплой + ожидание SSM в workflow. */
export async function waitForCompletion(
  runId: number,
  opts: { timeoutMs?: number; intervalMs?: number; onTick?: (run: WorkflowRun) => void } = {},
): Promise<WorkflowRun> {
  const { timeoutMs = 8 * 60_000, intervalMs = 15_000, onTick } = opts;
  const { owner, repo, token } = getGithubConfig();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}`, {
      headers: headers(token),
    });
    if (!res.ok) throw new Error(`get run failed: ${res.status}`);
    const run = (await res.json()) as WorkflowRun;
    onTick?.(run);
    if (run.status === "completed") return run;
    await sleep(intervalMs);
  }
  throw new Error("workflow не завершился за отведённое время");
}

export interface DownloadedArtifact {
  name: string;
  files: { path: string; data: Buffer }[];
}

/** Скачивает и распаковывает артефакты run'а по списку имён. Молча пропускает те, что не нашлись. */
export async function downloadArtifactsByName(
  runId: number,
  names: string[],
): Promise<DownloadedArtifact[]> {
  if (names.length === 0) return [];

  const { owner, repo, token } = getGithubConfig();
  const listRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`,
    { headers: headers(token) },
  );
  if (!listRes.ok) throw new Error(`list artifacts failed: ${listRes.status}`);
  const { artifacts } = (await listRes.json()) as {
    artifacts: { id: number; name: string; expired: boolean }[];
  };

  const AdmZip = (await import("adm-zip")).default;
  const results: DownloadedArtifact[] = [];

  for (const name of names) {
    const artifact = artifacts.find((a) => a.name === name && !a.expired);
    if (!artifact) continue;

    const zipRes = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/actions/artifacts/${artifact.id}/zip`,
      { headers: headers(token), redirect: "follow" },
    );
    if (!zipRes.ok) throw new Error(`download artifact "${name}" failed: ${zipRes.status}`);

    const buf = Buffer.from(await zipRes.arrayBuffer());
    const zip = new AdmZip(buf);
    const files = zip.getEntries().map((e) => ({ path: e.entryName, data: e.getData() }));
    results.push({ name, files });
  }

  return results;
}
