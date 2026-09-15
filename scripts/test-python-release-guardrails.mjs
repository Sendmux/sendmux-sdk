import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkPythonMcpDependencyFloors,
  checkPythonSdkDependencyFloors,
  checkPythonSurfaceDependencyFloors,
  readChangedPythonPackages,
} from "./python-release-guardrails.mjs";

const root = mkdtempSync(join(tmpdir(), "sendmux-python-release-"));

try {
  writeFixture({
    manifest: {
      "packages/python/core": "1.2.0",
      "packages/python/mailbox": "1.0.4",
      "packages/python/management": "1.0.4",
      "packages/python/sending": "1.2.0",
    },
    sdkDependencies: [
      '"sendmux-core>=1.2.0,<2.0.0"',
      '"sendmux-mailbox>=1.0.4,<2.0.0"',
      '"sendmux-management>=1.0.4,<2.0.0"',
      '"sendmux-sending>=1.1.0,<2.0.0"',
    ],
    mcpDependencies: ['"sendmux-core>=1.1.0,<2.0.0"'],
  });

  assert.doesNotThrow(() =>
    checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sending"]) }),
  );
  assert.throws(
    () => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sdk"]) }),
    /sendmux-sending >= 1\.2\.0,<2\.0\.0; found >= 1\.1\.0,<2\.0\.0/,
  );
  assert.doesNotThrow(() => checkPythonMcpDependencyFloors({ root, changedPackages: new Set(["core"]) }));
  assert.throws(
    () => checkPythonMcpDependencyFloors({ root, changedPackages: new Set(["mcp"]) }),
    /sendmux-core >= 1\.2\.0,<2\.0\.0; found >= 1\.1\.0,<2\.0\.0/,
  );

  writeFixture({
    manifest: {
      "packages/python/core": "1.2.0",
      "packages/python/mailbox": "1.1.0",
      "packages/python/management": "1.0.4",
      "packages/python/sending": "1.2.0",
    },
    sdkDependencies: [
      '"sendmux-core>=1.2.0,<2.0.0"',
      '"sendmux-mailbox>=1.1.0,<2.0.0"',
      '"sendmux-management>=1.0.4,<2.0.0"',
      '"sendmux-sending>=1.3.0,<2.0.0"',
    ],
    mcpDependencies: ['"sendmux-core>=1.2.0,<2.0.0"'],
  });

  assert.throws(
    () => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sdk"]) }),
    /sendmux-sending >= 1\.2\.0,<2\.0\.0; found >= 1\.3\.0,<2\.0\.0/,
  );

  writeFixture({
    manifest: {
      "packages/python/core": "1.2.0",
      "packages/python/mailbox": "1.1.0",
      "packages/python/management": "1.0.4",
      "packages/python/sending": "1.2.0",
    },
    sdkDependencies: [
      '"sendmux-core>=1.2.0,<2.0.0"',
      '"sendmux-mailbox>=1.1.0,<2.0.0"',
      '"sendmux-management>=1.0.4,<2.0.0"',
      '"sendmux-sending>=1.2.0,<2.0.0"',
    ],
    mcpDependencies: ['"sendmux-core>=1.2.0,<2.0.0"'],
  });

  assert.doesNotThrow(() => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sdk"]) }));
  assert.doesNotThrow(() => checkPythonMcpDependencyFloors({ root, changedPackages: new Set(["mcp"]) }));

  writeFixture({
    manifest: {
      "packages/python/core": "1.2.0",
      "packages/python/mailbox": "2.0.0",
      "packages/python/management": "1.0.4",
      "packages/python/sending": "1.2.0",
    },
    sdkDependencies: [
      '"sendmux-core>=1.2.0,<2.0.0"',
      '"sendmux-mailbox>=2.0.0,<3.0.0"',
      '"sendmux-management>=1.0.4,<2.0.0"',
      '"sendmux-sending>=1.2.0,<2.0.0"',
    ],
    mcpDependencies: ['"sendmux-core>=1.2.0,<2.0.0"'],
  });

  assert.doesNotThrow(() => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sdk"]) }));

  for (const invalidMailboxRange of [
    '"sendmux-mailbox>=2.0.0"',
    '"sendmux-mailbox>=2.0.0,<4.0.0"',
    '"sendmux-mailbox>=2.0.0,<2.0.0"',
  ]) {
    writeFixture({
      manifest: {
        "packages/python/core": "1.2.0",
        "packages/python/mailbox": "2.0.0",
        "packages/python/management": "1.0.4",
        "packages/python/sending": "1.2.0",
      },
      sdkDependencies: [
        '"sendmux-core>=1.2.0,<2.0.0"',
        invalidMailboxRange,
        '"sendmux-management>=1.0.4,<2.0.0"',
        '"sendmux-sending>=1.2.0,<2.0.0"',
      ],
      mcpDependencies: ['"sendmux-core>=1.2.0,<2.0.0"'],
    });
    assert.throws(
      () => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sdk"]) }),
      /sendmux-mailbox with an explicit >= floor and <3\.0\.0 upper bound.*>=2\.0\.0,<3\.0\.0/,
    );
  }

  writeFixture({
    manifest: {
      "packages/python/core": "1.2.0",
      "packages/python/mailbox": "2.0.0",
      "packages/python/management": "1.0.4",
      "packages/python/sending": "1.2.0",
    },
    sdkDependencies: [
      '"sendmux-core>=1.2.0,<2.0.0"',
      '"sendmux-mailbox>=1.1.0,<2.0.0"',
      '"sendmux-management>=1.0.4,<2.0.0"',
      '"sendmux-sending>=1.2.0,<2.0.0"',
    ],
    mcpDependencies: ['"sendmux-core>=1.2.0,<2.0.0"'],
  });

  assert.doesNotThrow(() => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["mailbox"]) }));
  assert.throws(
    () => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sdk"]) }),
    /sendmux-mailbox >= 2\.0\.0,<3\.0\.0; found >= 1\.1\.0,<2\.0\.0/,
  );

  writeFixture({
    manifest: {
      "packages/python/core": "1.2.0",
      "packages/python/mailbox": "1.1.0",
      "packages/python/management": "1.0.4",
      "packages/python/sending": "1.2.0",
    },
    sdkDependencies: [
      '"sendmux-core>=1.2.0,<2.0.0"',
      '"sendmux-mailbox>=1.1.0"',
      '"sendmux-management>=1.0.4,<2.0.0"',
      '"sendmux-sending>=1.2.0,<2.0.0"',
    ],
    mcpDependencies: ['"sendmux-core>=1.2.0,<2.0.0"'],
  });

  assert.throws(
    () => checkPythonSdkDependencyFloors({ root, changedPackages: new Set(["sending"]) }),
    /sendmux-mailbox with an explicit >= floor and <2\.0\.0 upper bound/,
  );

  assert.deepEqual(
    [...readChangedPythonPackages({ env: { PYTHON_CHANGED_PACKAGES: "sending, sdk" } })].sort(),
    ["sdk", "sending"],
  );
  assert.deepEqual(
    [
      ...readChangedPythonPackages({
        env: { PYTHON_PATHS_RELEASED: '["packages/python/mailbox","packages/ts/cli"]' },
      }),
    ],
    ["mailbox"],
  );
  assert.throws(
    () => readChangedPythonPackages({ root, env: { GITHUB_BASE_REF: "main" } }),
    /Could not determine changed files for Python release guardrails/,
  );

  for (const surface of ["sending", "mailbox", "management"]) {
    writeFixture({
      manifest: {
        "packages/python/core": "1.3.1",
        "packages/python/mailbox": "1.1.0",
        "packages/python/management": "1.0.4",
        "packages/python/sending": "1.5.1",
      },
      surfaceCoreDependencies: {
        sending: '"sendmux-core>=1.3.1,<2.0.0"',
        mailbox: '"sendmux-core>=1.3.1,<2.0.0"',
        management: '"sendmux-core>=1.3.1,<2.0.0"',
        [surface]: '"sendmux-core>=1.3.0,<2.0.0"',
      },
    });
    assert.throws(
      () => checkPythonSurfaceDependencyFloors({ root, changedPackages: new Set([surface]) }),
      new RegExp(`${surface}/pyproject\\.toml must require sendmux-core >= 1\\.3\\.1,<2\\.0\\.0`),
    );
    assert.doesNotThrow(() =>
      checkPythonSurfaceDependencyFloors({ root, changedPackages: new Set([surface === "sending" ? "mailbox" : "sending"]) }),
    );

    writeFixture({
      manifest: {
        "packages/python/core": "1.3.1",
        "packages/python/mailbox": "1.1.0",
        "packages/python/management": "1.0.4",
        "packages/python/sending": "1.5.1",
      },
      surfaceCoreDependencies: {
        sending: '"sendmux-core>=1.3.1,<2.0.0"',
        mailbox: '"sendmux-core>=1.3.1,<2.0.0"',
        management: '"sendmux-core>=1.3.1,<2.0.0"',
      },
    });
    assert.doesNotThrow(() =>
      checkPythonSurfaceDependencyFloors({ root, changedPackages: new Set([surface]) }),
    );

    for (const invalidRange of ['"sendmux-core>=1.3.1"', '"sendmux-core>=1.3.1,<3.0.0"']) {
      writeFixture({
        manifest: {
          "packages/python/core": "1.3.1",
          "packages/python/mailbox": "1.1.0",
          "packages/python/management": "1.0.4",
          "packages/python/sending": "1.5.1",
        },
        surfaceCoreDependencies: {
          sending: '"sendmux-core>=1.3.1,<2.0.0"',
          mailbox: '"sendmux-core>=1.3.1,<2.0.0"',
          management: '"sendmux-core>=1.3.1,<2.0.0"',
          [surface]: invalidRange,
        },
      });
      assert.throws(
        () => checkPythonSurfaceDependencyFloors({ root, changedPackages: new Set([surface]) }),
        new RegExp(`${surface}/pyproject\\.toml must require sendmux-core with an explicit >= floor and <2\\.0\\.0 upper bound`),
      );
    }
  }

  console.log("Python release guardrail tests passed.");
} finally {
  rmSync(root, { force: true, recursive: true });
}

function writeFixture({ manifest, sdkDependencies = [], mcpDependencies = [], surfaceCoreDependencies = {} }) {
  mkdirSync(join(root, "packages", "python", "sdk"), { recursive: true });
  mkdirSync(join(root, "packages", "python", "mcp"), { recursive: true });
  for (const surface of ["sending", "mailbox", "management"]) {
    mkdirSync(join(root, "packages", "python", surface), { recursive: true });
    writeFileSync(
      join(root, "packages", "python", surface, "pyproject.toml"),
      `dependencies = [\n  ${surfaceCoreDependencies[surface] ?? '"sendmux-core>=1.2.0,<2.0.0"'}\n]\n`,
    );
  }
  writeFileSync(join(root, ".release-please-manifest.json"), `${JSON.stringify(manifest)}\n`);
  writeFileSync(
    join(root, "packages", "python", "sdk", "pyproject.toml"),
    `dependencies = [\n  ${sdkDependencies.join(",\n  ")}\n]\n`,
  );
  writeFileSync(
    join(root, "packages", "python", "mcp", "pyproject.toml"),
    `dependencies = [\n  ${mcpDependencies.join(",\n  ")}\n]\n`,
  );
}
