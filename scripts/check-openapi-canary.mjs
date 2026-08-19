#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const specs = [
  {
    name: "app",
    liveUrl: "https://app.sendmux.ai/api/v1/openapi.json",
    snapshot: "openapi-app.json",
  },
  {
    name: "sending",
    liveUrl: "https://smtp.sendmux.ai/api/v1/openapi.json",
    snapshot: "openapi-sending.json",
  },
];

const options = parseArgs(process.argv.slice(2));
const docsDir = resolve(options.docsDir ?? process.env.OPENAPI_INPUT_DIR ?? "sendmux-docs");
const liveDir = options.liveDir ? resolve(options.liveDir) : undefined;
const mismatches = [];
const issueTitle = "OpenAPI live-vs-snapshot drift";

for (const spec of specs) {
  const snapshotPath = join(docsDir, spec.snapshot);
  assertFile(snapshotPath);

  const snapshot = readJson(snapshotPath);
  const live = liveDir ? readJson(join(liveDir, spec.snapshot)) : await fetchJson(spec.liveUrl);
  assertOpenApi31(snapshotPath, snapshot);
  assertOpenApi31(liveDir ? join(liveDir, spec.snapshot) : spec.liveUrl, live);

  const snapshotCanonical = `${stableStringify(snapshot)}\n`;
  const liveCanonical = `${stableStringify(live)}\n`;

  if (snapshotCanonical !== liveCanonical) {
    mismatches.push({
      name: spec.name,
      liveUrl: spec.liveUrl,
      snapshotPath,
      detail: firstDifference(snapshotCanonical, liveCanonical),
    });
  }
}

if (mismatches.length === 0) {
  console.log("Live OpenAPI specs match committed snapshots.");
  if (options.issue) {
    await closeResolvedIssue({ title: issueTitle });
  }
  process.exit(0);
}

const body = issueBody(mismatches);
console.error(body);

if (options.issue) {
  await createOrUpdateIssue({ title: issueTitle, body });
}

process.exit(1);

function parseArgs(args) {
  const parsed = { issue: false };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--docs-dir") {
      parsed.docsDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    if (arg === "--live-dir") {
      parsed.liveDir = requireValue({ args, index, arg });
      index += 1;
      continue;
    }

    if (arg === "--issue") {
      parsed.issue = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function requireValue({ args, index, arg }) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Expected value after ${arg}`);
  }

  return value;
}

function assertFile(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing OpenAPI snapshot: ${path}`);
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
  }

  return response.json();
}

function assertOpenApi31(source, document) {
  if (document.openapi !== "3.1.0") {
    throw new Error(`${source} must be OpenAPI 3.1.0, got ${document.openapi}`);
  }
}

function firstDifference(left, right) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }

  return {
    index,
    snapshot: left.slice(Math.max(0, index - 80), index + 160),
    live: right.slice(Math.max(0, index - 80), index + 160),
  };
}

function issueBody(items) {
  return [
    "The live OpenAPI document differs from the committed snapshot.",
    "",
    ...items.flatMap((item) => [
      `## ${item.name}`,
      `Live: ${item.liveUrl}`,
      `Snapshot: ${item.snapshotPath}`,
      `First differing byte: ${item.detail.index}`,
      "",
      "Snapshot excerpt:",
      "```json",
      item.detail.snapshot,
      "```",
      "",
      "Live excerpt:",
      "```json",
      item.detail.live,
      "```",
      "",
    ]),
  ].join("\n");
}

async function createOrUpdateIssue({ title, body }) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required when --issue is set");
  }

  const [owner, repo] = repository.split("/");
  const existing = await githubJson(
    `/repos/${owner}/${repo}/issues?state=open&labels=spec-drift&per_page=100`,
    { token },
  );
  const issue = existing.find((item) => item.title === title && !item.pull_request);

  if (issue) {
    await githubJson(`/repos/${owner}/${repo}/issues/${issue.number}/comments`, {
      token,
      method: "POST",
      body: { body },
    });
    console.log(`Updated existing spec drift issue #${issue.number}`);
    return;
  }

  try {
    await githubJson(`/repos/${owner}/${repo}/labels`, {
      token,
      method: "POST",
      body: {
        name: "spec-drift",
        color: "b60205",
        description: "Live OpenAPI output differs from the committed snapshot",
      },
      tolerateStatus: 422,
    });

    const created = await githubJson(`/repos/${owner}/${repo}/issues`, {
      token,
      method: "POST",
      body: {
        title,
        body,
        labels: ["spec-drift"],
      },
    });
    console.log(`Created spec drift issue #${created.number}`);
  } catch (error) {
    throw new Error(`Failed to create spec drift issue: ${error.message}`);
  }
}

async function closeResolvedIssue({ title }) {
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;

  if (!token || !repository) {
    throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required when --issue is set");
  }

  const [owner, repo] = repository.split("/");
  const existing = await githubJson(
    `/repos/${owner}/${repo}/issues?state=open&labels=spec-drift&per_page=100`,
    { token },
  );
  const issue = existing.find((item) => item.title === title && !item.pull_request);
  if (!issue) {
    return;
  }

  await githubJson(`/repos/${owner}/${repo}/issues/${issue.number}`, {
    token,
    method: "PATCH",
    body: { state: "closed", state_reason: "completed" },
  });
  console.log(`Closed resolved spec drift issue #${issue.number}`);
}

async function githubJson(path, { token, method = "GET", body, tolerateStatus } = {}) {
  const githubApiUrl = (process.env.GITHUB_API_URL ?? "https://api.github.com").replace(/\/$/, "");
  const response = await fetch(`${githubApiUrl}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === tolerateStatus) {
    return undefined;
  }

  if (!response.ok) {
    throw new Error(`GitHub API ${method} ${path} failed: HTTP ${response.status} ${await response.text()}`);
  }

  return response.status === 204 ? undefined : response.json();
}

function stableStringify(value) {
  return JSON.stringify(sortKeys(value), null, 2);
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeys(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortKeys(child)]),
  );
}
