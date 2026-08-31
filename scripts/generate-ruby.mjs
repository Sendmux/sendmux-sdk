import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputRoot = join(root, ".tmp", "ruby-codegen");

const surfaces = [
  {
    name: "sending",
    moduleName: "Sending",
    gemName: "sendmux-sending",
    generatedGemName: "sendmux_sending_generated",
    spec: ".codegen/openapi-sending.openapi-generator.codegen.json",
    tags: ["Attachments", "Emails", "Meta"],
    keySurface: "SENDING",
    defaultBaseUrl: "https://smtp.sendmux.ai/api/v1",
    modelNameMappings: [],
  },
  {
    name: "mailbox",
    moduleName: "Mailbox",
    gemName: "sendmux-mailbox",
    generatedGemName: "sendmux_mailbox_generated",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: ["Mailbox API"],
    keySurface: "MAILBOX",
    defaultBaseUrl: "https://app.sendmux.ai/api/v1",
    modelNameMappings: ["ApiError=ApiErrorResponse"],
  },
  {
    name: "management",
    moduleName: "Management",
    gemName: "sendmux-management",
    generatedGemName: "sendmux_management_generated",
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
    keySurface: "ROOT",
    defaultBaseUrl: "https://app.sendmux.ai/api/v1",
    modelNameMappings: ["ApiError=ApiErrorResponse"],
  },
];

run("pnpm", ["normalize:codegen"]);
rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

for (const surface of surfaces) {
  const packageDir = join(root, "packages", "ruby", surface.name);
  const generatedRoot = join(outputRoot, surface.name);
  const inputSpec = writeFilteredSpec(surface);

  const generatorArgs = [
    "openapi-generator-cli",
    "generate",
    "-g",
    "ruby",
    "-i",
    inputSpec,
    "-o",
    generatedRoot,
    `--additional-properties=${[
      `gemName=${surface.generatedGemName}`,
      `moduleName=Sendmux::${surface.moduleName}::Generated`,
      "gemVersion=1.0.0",
      "gemLicense=MIT",
      "gemHomepage=https://github.com/Sendmux/sendmux-sdk",
      "hideGenerationTimestamp=true",
      "library=faraday",
      "enumUnknownDefaultCase=true",
      "disallowAdditionalPropertiesIfNotPresent=false",
    ].join(",")}`,
    "--global-property=models,supportingFiles,apis,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false",
  ];
  if (surface.modelNameMappings.length > 0) {
    generatorArgs.push("--model-name-mappings", surface.modelNameMappings.join(","));
  }

  run("pnpm", generatorArgs);

  rmSync(join(packageDir, "lib", `${surface.generatedGemName}.rb`), { force: true });
  rmSync(join(packageDir, "lib", surface.generatedGemName), { force: true, recursive: true });
  cpSync(join(generatedRoot, "lib", `${surface.generatedGemName}.rb`), join(packageDir, "lib", `${surface.generatedGemName}.rb`));
  cpSync(join(generatedRoot, "lib", surface.generatedGemName), join(packageDir, "lib", surface.generatedGemName), {
    recursive: true,
  });
  patchGeneratedApiClientHeaders(join(packageDir, "lib", surface.generatedGemName, "api_client.rb"));
  if (surface.name === "management") {
    patchGeneratedManagementMailboxEmailAnchors(
      join(packageDir, "lib", surface.generatedGemName, "models", "management_create_mailbox_request.rb"),
    );
  }
  stripTrailingWhitespace(join(packageDir, "lib", `${surface.generatedGemName}.rb`));
  stripTrailingWhitespace(join(packageDir, "lib", surface.generatedGemName));
  writeSurfaceClient(surface, packageDir);
}

console.log("Generated Ruby SDK packages");

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
  writeFileSync(outputPath, `${JSON.stringify(pruneComponents({ ...source, paths }), null, 2)}\n`);
  return outputPath;
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

function writeSurfaceClient(surface, packageDir) {
  const apiDir = join(packageDir, "lib", surface.generatedGemName, "api");
  const apiClasses = readdirSync(apiDir)
    .filter((file) => file.endsWith(".rb"))
    .map((file) => apiClassName(join(apiDir, file), basename(file, ".rb")))
    .sort();

  const accessors = apiClasses.map((apiClass) => createAccessor(apiClass)).join("\n\n");

  writeFileSync(
    join(packageDir, "lib", "sendmux", surface.name, "client.rb"),
    `# frozen_string_literal: true

module Sendmux
  module ${surface.moduleName}
    DEFAULT_BASE_URL = '${surface.defaultBaseUrl}'

    class ApiClient < Generated::ApiClient
      def call_api(...)
        super
      rescue Generated::ApiError => e
        raise Sendmux::Core::ErrorMapper.map(e)
      end
    end

    class Client
      attr_reader :api_client, :configuration

      def initialize(api_key:, base_url: DEFAULT_BASE_URL, retry_options: nil)
        @configuration = Sendmux::Core::Auth.configure_bearer(
          Generated::Configuration.new,
          api_key,
          Sendmux::Core::ApiKeySurface::${surface.keySurface},
          base_url: base_url
        )
        Sendmux::Core::Retry.configure(@configuration, retry_options)
        @api_client = ApiClient.new(@configuration)
      end

${indent(accessors, 6)}
    end
  end
end
`,
  );
}

function createAccessor(apiClass) {
  const method = apiClass.replace(/Api$/, "").replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
  return `def ${method}
  @${method} ||= Generated::${apiClass}.new(@api_client)
end`;
}

function apiClassName(path, fallback) {
  const source = readFileSync(path, "utf8");
  const match = source.match(/class\s+([A-Za-z0-9_]+)\b/);
  return match ? match[1] : toPascal(fallback);
}

function indent(value, spaces) {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : line))
    .join("\n");
}

function toPascal(value) {
  return value
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function stripTrailingWhitespace(path) {
  const stats = statSync(path);
  if (stats.isDirectory()) {
    for (const entry of readdirSync(path)) {
      stripTrailingWhitespace(join(path, entry));
    }
    return;
  }

  if (!path.endsWith(".rb")) {
    return;
  }

  const source = readFileSync(path, "utf8");
  const stripped = source.replace(/[ \t]+$/gm, "");
  if (stripped !== source) {
    writeFileSync(path, stripped);
  }
}

function patchGeneratedApiClientHeaders(apiClientPath) {
  const source = readFileSync(apiClientPath, "utf8");
  const headerAssignment = "      request.headers = header_params\n      request.body = req_body\n";
  const patchedHeaderAssignment = "      request.headers = stringify_header_params(header_params)\n      request.body = req_body\n";
  if (!source.includes(headerAssignment)) {
    throw new Error(`Could not find generated Ruby header assignment in ${apiClientPath}`);
  }

  const methodInsertionPoint = "    # Builds the HTTP request body\n";
  const stringifyMethod = `    def stringify_header_params(header_params)
      header_params.each_with_object({}) do |(key, value), result|
        result[key] = value.nil? ? value : value.to_s
      end
    end

`;
  if (!source.includes(methodInsertionPoint)) {
    throw new Error(`Could not find generated Ruby request body method in ${apiClientPath}`);
  }

  writeFileSync(
    apiClientPath,
    source.replace(headerAssignment, patchedHeaderAssignment).replace(methodInsertionPoint, stringifyMethod + methodInsertionPoint),
  );
}

function patchGeneratedManagementMailboxEmailAnchors(modelPath) {
  const source = readFileSync(modelPath, "utf8");
  const anchoredPattern = /Regexp\.new\(\/\^((?:\\.|[^/\n])*)\$\/\)/g;
  const matches = source.match(anchoredPattern) ?? [];
  if (matches.length !== 3) {
    throw new Error(`Expected three anchored email validators in ${modelPath}; found ${matches.length}`);
  }

  writeFileSync(
    modelPath,
    source.replace(anchoredPattern, (_match, body) => `Regexp.new(/\\A${body}\\z/)`),
  );
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
