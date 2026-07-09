#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflowPath = ".github/workflows/snap.yml";
const workflow = readFileSync(workflowPath, "utf8");
const snapReadme = readFileSync("snap/README.md", "utf8");

assert.match(workflow, /^name: Snap$/m, "Snap workflow must have a stable name.");
assert.match(workflow, /pull_request:[\s\S]*?paths:/, "PR builds must be limited to Snap-related paths.");
assert.match(workflow, /push:[\s\S]*?branches:[\s\S]*?- main/, "Main pushes must run the Snap workflow.");
assert.match(workflow, /workflow_dispatch:/, "Snap workflow must support manual build runs.");
assert.match(workflow, /permissions:[\s\S]*?contents: read/, "Snap workflow must use read-only repository permissions.");
assert.match(
  workflow,
  /concurrency:[\s\S]*?group: snap-\$\{\{ github\.ref \}\}[\s\S]*?cancel-in-progress: false/,
  "Snap workflow must serialise per ref without cancelling in-flight store uploads.",
);
assert.match(workflow, /ubuntu-24\.04-arm/, "Snap workflow must include a native arm64 runner.");
assert.match(workflow, /- arch: amd64/, "Snap workflow must explicitly include amd64 in the build matrix.");
assert.match(workflow, /- arch: arm64/, "Snap workflow must explicitly include arm64 in the build matrix.");
assert.match(
  workflow,
  /snapcraft-args: --build-for=\$\{\{ matrix\.arch \}\}/,
  "Snap workflow must pass the selected matrix architecture to Snapcraft.",
);
assert.match(workflow, /path: snap/, "Snapcraft action must build from the snap project directory.");
assert.match(
  workflow,
  /SNAPCRAFT_STORE_CREDENTIALS: \$\{\{ secrets\.SNAPCRAFT_STORE_CREDENTIALS \}\}/,
  "Snap Store credentials must come from the repository secret expected by snapcore/action-publish.",
);
assert.match(workflow, /release: edge/, "Snap workflow must publish only to edge.");
assert.doesNotMatch(workflow, /release: stable/, "Stable Snap promotion must remain manual.");

const publishStep = stepBlock("Publish snap to edge");
assert.match(
  publishStep.text,
  /github\.ref == 'refs\/heads\/main'/,
  "Snap publishing must be limited to the main branch.",
);
assert.match(
  publishStep.text,
  /github\.event_name == 'push' \|\| inputs\.publish_edge == true/,
  "Snap publishing must happen on main pushes or explicit manual publish runs.",
);
assert.match(
  publishStep.text,
  /env\.SNAPCRAFT_STORE_CREDENTIALS != ''/,
  "Snap publishing must fail closed when store credentials are absent.",
);

assert.match(
  snapReadme,
  /--acls=package_access,package_push,package_update,package_release/,
  "Snap credential docs must keep --acls joined with its value to avoid shell line-break mistakes.",
);
assert.match(
  snapReadme,
  /test -s "\$secret_file"/,
  "Snap credential docs must prove the exported login file is non-empty before setting the GitHub secret.",
);
assert.match(
  snapReadme,
  /gh secret list --repo Sendmux\/sendmux-sdk/,
  "Snap credential docs must require verifying the GitHub secret update timestamp.",
);

console.log("Snap workflow tests passed.");

function stepBlock(name) {
  const pattern = new RegExp(`^      - name: ${escapeRegExp(name)}\\n`, "m");
  const match = pattern.exec(workflow);
  assert(match, `Missing Snap workflow step: ${name}`);

  const start = match.index;
  const next = workflow.slice(start + match[0].length).search(/^      - name: /m);
  const end = next === -1 ? workflow.length : start + match[0].length + next;

  return {
    text: workflow.slice(start, end),
  };
}

function escapeRegExp(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
