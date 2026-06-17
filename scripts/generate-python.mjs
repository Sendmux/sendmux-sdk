import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputRoot = join(root, ".tmp", "python-codegen");
const templateDir = join(root, "codegen", "templates", "python");

const surfaces = [
  {
    name: "sending",
    projectName: "sendmux-sending",
    packageName: "sendmux_sending",
    spec: ".codegen/openapi-sending.openapi-generator.codegen.json",
    tags: ["Emails", "Meta"],
  },
  {
    name: "mailbox",
    projectName: "sendmux-mailbox",
    packageName: "sendmux_mailbox",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: ["Mailbox API"],
  },
  {
    name: "management",
    projectName: "sendmux-management",
    packageName: "sendmux_management",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: [
      "Billing",
      "Domain Filters",
      "Domains",
      "Emails",
      "Inboxes",
      "Mailbox Filters",
      "Mailboxes",
      "Sending accounts",
      "Webhooks",
    ],
  },
];

run("pnpm", ["normalize:codegen"]);
rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

for (const surface of surfaces) {
  const packageDir = join(root, "packages", "python", surface.name);
  const generatedRoot = join(outputRoot, surface.name);
  const inputSpec = surface.tags ? writeFilteredSpec(surface) : join(root, surface.spec);
  const packageVersion = readProjectVersion(packageDir);

  run("pnpm", [
    "openapi-generator-cli",
    "generate",
    "-g",
    "python",
    "-i",
    inputSpec,
    "-o",
    generatedRoot,
    "-t",
    templateDir,
    `--additional-properties=packageName=${surface.packageName},projectName=${surface.projectName},packageVersion=${packageVersion},generateSourceCodeOnly=true,hideGenerationTimestamp=true`,
    "--global-property=models,supportingFiles,apis,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false",
  ]);

  rmSync(join(packageDir, surface.packageName), { force: true, recursive: true });
  cpSync(join(generatedRoot, surface.packageName), join(packageDir, surface.packageName), { recursive: true });
  writeSurfaceClient(surface);
  linkGeneratedRuntimeVersion(surface, packageDir);
  normalizePythonFiles(join(packageDir, surface.packageName));
}

console.log("Generated Python SDK packages");

function readProjectVersion(packageDir) {
  const pyprojectPath = join(packageDir, "pyproject.toml");
  const pyproject = readFileSync(pyprojectPath, "utf8");
  const match = pyproject.match(/^version = "([^"]+)"$/m);
  if (!match) {
    throw new Error(`Could not read project version from ${pyprojectPath}`);
  }
  return match[1];
}

function writeFilteredSpec(surface) {
  const source = JSON.parse(readFileSync(join(root, surface.spec), "utf8"));
  const allowed = new Set(surface.tags);
  const paths = {};

  for (const [path, pathItem] of Object.entries(source.paths ?? {})) {
    const nextPathItem = {};
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        nextPathItem[method] = operation;
        continue;
      }

      if ((operation.tags ?? []).some((tag) => allowed.has(tag))) {
        nextPathItem[method] = operation;
      }
    }

    if (Object.keys(nextPathItem).some((key) => key !== "parameters")) {
      paths[path] = nextPathItem;
    }
  }

  const outputPath = join(outputRoot, `${surface.name}.openapi-generator.codegen.json`);
  writeFileSync(outputPath, `${JSON.stringify(markTrailingSdkParams(pruneComponents({ ...source, paths })), null, 2)}\n`);
  return outputPath;
}

function markTrailingSdkParams(document) {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        continue;
      }
      if (!operation?.requestBody) {
        continue;
      }
      for (const parameter of operation.parameters ?? []) {
        if (parameter?.name === "mailbox_id" && parameter.in === "query") {
          parameter["x-sendmux-trailing-sdk-param"] = true;
        }
      }
    }
  }
  return document;
}

function pruneComponents(document) {
  const refs = new Set();
  collectRefs(document.paths, refs);

  for (const ref of refs) {
    collectTransitiveRefs(document, ref, refs);
  }

  const components = {};
  for (const ref of refs) {
    const parts = ref.split("/");
    if (parts.length !== 4 || parts[0] !== "#" || parts[1] !== "components") {
      continue;
    }

    const [, , section, encodedName] = parts;
    const name = decodeURIComponent(encodedName);
    const value = document.components?.[section]?.[name];
    if (value === undefined) {
      throw new Error(`Missing component referenced by filtered spec: ${ref}`);
    }

    components[section] ??= {};
    components[section][name] = value;
  }

  if (document.components?.securitySchemes) {
    components.securitySchemes = document.components.securitySchemes;
  }

  return { ...document, components };
}

function collectTransitiveRefs(document, ref, refs) {
  const parts = ref.split("/");
  if (parts.length !== 4 || parts[0] !== "#" || parts[1] !== "components") {
    return;
  }

  const [, , section, encodedName] = parts;
  const name = decodeURIComponent(encodedName);
  const value = document.components?.[section]?.[name];
  if (value === undefined) {
    throw new Error(`Missing component referenced by filtered spec: ${ref}`);
  }

  const before = refs.size;
  collectRefs(value, refs);
  if (refs.size !== before) {
    for (const nextRef of refs) {
      collectTransitiveRefs(document, nextRef, refs);
    }
  }
}

function collectRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const child of value) {
      collectRefs(child, refs);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    return;
  }

  if (typeof value.$ref === "string") {
    refs.add(value.$ref);
  }

  for (const child of Object.values(value)) {
    collectRefs(child, refs);
  }
}

function normalizePythonFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      normalizePythonFiles(path);
      continue;
    }

    if (!path.endsWith(".py")) {
      continue;
    }

    const current = readFileSync(path, "utf8");
    const next = `${current.replace(/[ \t\r\n]*$/u, "")}\n`;
    if (next !== current) {
      writeFileSync(path, next);
    }
  }
}

function writeSurfaceClient(surface) {
  const packageDir = join(root, "packages", "python", surface.name, surface.packageName);
  const className = toPascal(surface.name);
  const keySurface = surface.name === "management" ? "root" : "mailbox";
  const defaultBaseUrl =
    surface.name === "sending" ? "https://smtp.sendmux.ai/api/v1" : "https://app.sendmux.ai/api/v1";

  writeFileSync(
    join(packageDir, "client.py"),
    `from __future__ import annotations

import certifi

from typing import Any, cast

from sendmux_core import RetryOptions, configure_auth, validate_api_key
from sendmux_core.errors import map_api_exception
from sendmux_core.retry import RetryingRestClient

from ${surface.packageName}.api_client import ApiClient
from ${surface.packageName}.configuration import Configuration
from ${surface.packageName}.exceptions import ApiException

DEFAULT_BASE_URL = "${defaultBaseUrl}"


class Sendmux${className}ApiClient(ApiClient):
    def __init__(self, configuration: Configuration, *, retry_options: RetryOptions | None = None) -> None:
        super().__init__(configuration=configuration)
        self.rest_client = cast(Any, RetryingRestClient(self.rest_client, retry_options=retry_options))

    def call_api(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return super().call_api(*args, **kwargs)
        except ApiException as exc:
            raise map_api_exception(exc) from exc

    def response_deserialize(self, *args: Any, **kwargs: Any) -> Any:
        try:
            return super().response_deserialize(*args, **kwargs)
        except ApiException as exc:
            raise map_api_exception(exc) from exc


def create_${surface.name}_client(
    *,
    api_key: str,
    base_url: str | None = None,
    retry_options: RetryOptions | None = None,
) -> Sendmux${className}ApiClient:
    validate_api_key(api_key, surface="${keySurface}")
    configuration = Configuration(host=base_url or DEFAULT_BASE_URL, ssl_ca_cert=certifi.where())
    configure_auth(configuration, api_key=api_key)
    return Sendmux${className}ApiClient(configuration, retry_options=retry_options)


configure_${surface.name} = create_${surface.name}_client
`,
  );

  const initPath = join(packageDir, "__init__.py");
  const existing = readFileSync(initPath, "utf8");
  writeFileSync(
    initPath,
    `${existing}
from ${surface.packageName}.client import (
    DEFAULT_BASE_URL,
    Sendmux${className}ApiClient,
    configure_${surface.name},
    create_${surface.name}_client,
)
`,
  );
}

function linkGeneratedRuntimeVersion(surface, packageDir) {
  const packageRoot = join(packageDir, surface.packageName);
  const apiClientPath = join(packageRoot, "api_client.py");
  const configurationPath = join(packageRoot, "configuration.py");

  let apiClient = readFileSync(apiClientPath, "utf8");
  apiClient = replaceOnce({
    source: apiClient,
    filePath: apiClientPath,
    from: "from pydantic import SecretStr\n\n",
    to: "from pydantic import SecretStr\n\nfrom importlib.metadata import PackageNotFoundError, version as _distribution_version\nfrom pathlib import Path\n\n",
  });
  apiClient = replaceOnce({
    source: apiClient,
    filePath: apiClientPath,
    from: "RequestSerialized = Tuple[str, str, Dict[str, str], Optional[str], List[str]]\n\nclass ApiClient:",
    to: `RequestSerialized = Tuple[str, str, Dict[str, str], Optional[str], List[str]]\n\n\ndef _sdk_package_version() -> str:\n    try:\n        return _distribution_version("${surface.projectName}")\n    except PackageNotFoundError:\n        init_source = Path(__file__).with_name("__init__.py").read_text(encoding="utf-8")\n        version_prefix = '__version__ = "'\n        for line in init_source.splitlines():\n            if line.startswith(version_prefix) and line.endswith('"'):\n                return line[len(version_prefix) : -1]\n        raise RuntimeError("Could not read ${surface.projectName} package version") from None\n\n\nclass ApiClient:`,
  });
  apiClient = apiClient.replace(
    /self\.user_agent = 'OpenAPI-Generator\/[^/']+\/python'/,
    "self.user_agent = f'OpenAPI-Generator/{_sdk_package_version()}/python'",
  );
  writeFileSync(apiClientPath, apiClient);

  let configuration = readFileSync(configurationPath, "utf8");
  configuration = replaceOnce({
    source: configuration,
    filePath: configurationPath,
    from: "import copy\n",
    to: "import copy\nfrom importlib.metadata import PackageNotFoundError, version as _distribution_version\nfrom pathlib import Path\n",
  });
  configuration = replaceOnce({
    source: configuration,
    filePath: configurationPath,
    from: "ServerVariablesT = Dict[str, str]\n\nGenericAuthSetting",
    to: `ServerVariablesT = Dict[str, str]\n\n\ndef _sdk_package_version() -> str:\n    try:\n        return _distribution_version("${surface.projectName}")\n    except PackageNotFoundError:\n        init_source = Path(__file__).with_name("__init__.py").read_text(encoding="utf-8")\n        version_prefix = '__version__ = "'\n        for line in init_source.splitlines():\n            if line.startswith(version_prefix) and line.endswith('"'):\n                return line[len(version_prefix) : -1]\n        raise RuntimeError("Could not read ${surface.projectName} package version") from None\n\n\nGenericAuthSetting`,
  });
  configuration = configuration.replace(
    /"SDK Package Version: [^"]+"\.\\/,
    '"SDK Package Version: {sdk_package_version}".\\',
  );
  configuration = replaceOnce({
    source: configuration,
    filePath: configurationPath,
    from: "format(env=sys.platform, pyversion=sys.version)",
    to: "format(env=sys.platform, pyversion=sys.version, sdk_package_version=_sdk_package_version())",
  });
  writeFileSync(configurationPath, configuration);
}

function replaceOnce({ source, filePath, from, to }) {
  if (!source.includes(from)) {
    throw new Error(`Could not find expected generated snippet in ${filePath}`);
  }
  return source.replace(from, to);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function toPascal(value) {
  return value
    .split(/[-_]/g)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}
