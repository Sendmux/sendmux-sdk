import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputRoot = join(root, ".tmp", "php-codegen");
const generatedSourceDirs = ["mailbox", "management", "sending"].map((name) =>
  join("packages", "php", name, "src"),
);

const surfaces = [
  {
    name: "sending",
    composerName: "sendmux/sending",
    namespace: "Sendmux\\Sending",
    spec: ".codegen/openapi-sending.openapi-generator.codegen.json",
    tags: ["Emails"],
    keySurface: "Root",
  },
  {
    name: "mailbox",
    composerName: "sendmux/mailbox",
    namespace: "Sendmux\\Mailbox",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: ["Mailbox API"],
    keySurface: "Mailbox",
  },
  {
    name: "management",
    composerName: "sendmux/management",
    namespace: "Sendmux\\Management",
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
    keySurface: "Root",
  },
];

run("pnpm", ["normalize:codegen"]);
rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

for (const surface of surfaces) {
  const packageDir = join(root, "packages", "php", surface.name);
  const generatedRoot = join(outputRoot, surface.name);
  const inputSpec = writeFilteredSpec(surface);

  run("pnpm", [
    "openapi-generator-cli",
    "generate",
    "-g",
    "php-nextgen",
    "-i",
    inputSpec,
    "-o",
    generatedRoot,
    `--additional-properties=${[
      `composerPackageName=${surface.composerName}`,
      `invokerPackage=${surface.namespace.replaceAll("\\", "\\\\")}`,
      "srcBasePath=src",
      "artifactVersion=1.0.0",
      "hideGenerationTimestamp=true",
      "enumUnknownDefaultCase=true",
      "disallowAdditionalPropertiesIfNotPresent=false",
    ].join(",")}`,
    "--global-property=models,supportingFiles,apis,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false",
  ]);

  rmSync(join(packageDir, "src"), { force: true, recursive: true });
  cpSync(join(generatedRoot, "src"), join(packageDir, "src"), { recursive: true });
  writeClientFactory(surface, packageDir);
}

formatGeneratedPhp();
console.log("Generated PHP SDK packages");

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

function writeClientFactory(surface, packageDir) {
  const apiDir = join(packageDir, "src", "Api");
  const apiClasses = readdirSync(apiDir)
    .filter((file) => file.endsWith(".php"))
    .map((file) => basename(file, ".php"))
    .sort();

  const useApiClasses = apiClasses.map((apiClass) => `use ${surface.namespace}\\Api\\${apiClass};`).join("\n");
  const methods = apiClasses.map((apiClass) => createApiFactoryMethod(apiClass)).join("\n");

  writeFileSync(
    join(packageDir, "src", "ClientFactory.php"),
    `<?php

declare(strict_types=1);

namespace ${surface.namespace};

${useApiClasses}
use GuzzleHttp\\Client;
use GuzzleHttp\\ClientInterface;
use GuzzleHttp\\HandlerStack;
use Sendmux\\Core\\ApiKeySurface;
use Sendmux\\Core\\Auth;
use Sendmux\\Core\\RetryMiddleware;
use Sendmux\\Core\\RetryOptions;

final class ClientFactory
{
    public static function configuration(string $apiKey, ?string $baseUrl = null): Configuration
    {
        $configuration = new Configuration();
        if ($baseUrl !== null && $baseUrl !== '') {
            $configuration->setHost($baseUrl);
        }

        /** @var Configuration $configured */
        $configured = Auth::configureBearer($configuration, $apiKey, ApiKeySurface::${surface.keySurface});
        return $configured;
    }

    public static function httpClient(?RetryOptions $retryOptions = null): ClientInterface
    {
        $stack = HandlerStack::create();
        $stack->push(RetryMiddleware::create($retryOptions), 'sendmux_retry');

        return new Client(['handler' => $stack]);
    }

${methods}
}
`,
  );
}

function createApiFactoryMethod(apiClass) {
  return `    public static function create${apiClass}(
        string $apiKey,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): ${apiClass} {
        return new ${apiClass}(
            self::httpClient($retryOptions),
            self::configuration($apiKey, $baseUrl)
        );
    }
`;
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function formatGeneratedPhp() {
  ensurePhpCodeSniffer();

  const result = spawnSync(
    "vendor/bin/phpcbf",
    ["-d", "memory_limit=512M", "--standard=phpcs.xml", ...generatedSourceDirs],
    { cwd: root, encoding: "utf8", stdio: "inherit" },
  );

  if (result.status !== 0) {
    console.log("PHPCBF completed with generated-code leftovers; PHPCS enforces the accepted ruleset.");
  }
}

function ensurePhpCodeSniffer() {
  if (existsSync(join(root, "vendor", "bin", "phpcbf"))) {
    return;
  }

  const composer = existsSync(join(root, "composer.phar")) ? ["php", "composer.phar"] : ["composer"];
  const [command, ...args] = composer;
  run(command, [...args, "install", "--no-interaction", "--no-progress"]);
}
