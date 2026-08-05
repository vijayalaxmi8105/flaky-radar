import AdmZip from "adm-zip";
import { logger } from "../logger.js";

const GITHUB_API = "https://api.github.com";

interface GithubArtifact {
  id: number;
  name: string;
  archive_download_url: string;
  expired: boolean;
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN is not set — cannot call GitHub API");
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

// Adjust this if your CI job uploads the artifact under a different name.
// Common conventions: "junit", "test-results", "junit-results".
function isJunitArtifactName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.includes("junit") || lower.includes("test-results") || lower.includes("test-report");
}

/**
 * Fetches the first JUnit XML file found inside a workflow run's artifacts.
 * Returns null if no matching artifact/XML is found (caller should treat
 * this as "nothing to parse yet", not as a hard failure).
 */
export async function fetchJunitXmlForRun(params: {
  owner: string;
  repo: string;
  githubRunId: bigint;
}): Promise<string | null> {
  const { owner, repo, githubRunId } = params;

  const listUrl = `${GITHUB_API}/repos/${owner}/${repo}/actions/runs/${githubRunId}/artifacts`;
  const listRes = await fetch(listUrl, { headers: githubHeaders() });

  if (!listRes.ok) {
    throw new Error(
      `Failed to list artifacts for run ${githubRunId}: ${listRes.status} ${await listRes.text()}`
    );
  }

  const listData = (await listRes.json()) as { artifacts: GithubArtifact[] };
  const candidate = listData.artifacts.find(
    (a) => !a.expired && isJunitArtifactName(a.name)
  );

  if (!candidate) {
    logger.warn(
      { owner, repo, githubRunId: githubRunId.toString() },
      "no matching junit artifact found for this run"
    );
    return null;
  }

  const downloadRes = await fetch(candidate.archive_download_url, {
    headers: githubHeaders(),
  });

  if (!downloadRes.ok) {
    throw new Error(
      `Failed to download artifact "${candidate.name}": ${downloadRes.status}`
    );
  }

  const arrayBuffer = await downloadRes.arrayBuffer();
  const zip = new AdmZip(Buffer.from(arrayBuffer));
  const entries = zip.getEntries();

  const xmlEntry = entries.find((e) => e.entryName.toLowerCase().endsWith(".xml"));
  if (!xmlEntry) {
    logger.warn(
      { owner, repo, githubRunId: githubRunId.toString(), artifactName: candidate.name },
      "artifact downloaded but contained no .xml file"
    );
    return null;
  }

  return xmlEntry.getData().toString("utf-8");
}