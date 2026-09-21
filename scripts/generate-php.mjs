import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import { planDeprecatedModelAliases, reportPendingAliases } from "./deprecated-model-aliases.mjs";

const root = process.cwd();
const outputRoot = join(root, ".tmp", "php-codegen");
const templateDir = join(root, "codegen", "templates", "php-nextgen");
const generatedSourceDirs = ["mailbox", "management", "sending"].map((name) =>
  join("packages", "php", name, "src"),
);

const surfaces = [
  {
    name: "sending",
    artifactVersion: "2.1.1",
    composerName: "sendmux/sending",
    namespace: "Sendmux\\Sending",
    spec: ".codegen/openapi-sending.openapi-generator.codegen.json",
    tags: ["Attachments", "Emails", "Meta"],
    keySurface: "Sending",
  },
  {
    name: "mailbox",
    artifactVersion: "3.0.0",
    composerName: "sendmux/mailbox",
    namespace: "Sendmux\\Mailbox",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: ["Mailbox API"],
    keySurface: "Mailbox",
    // Generated model classes dropped by a schema regeneration that keep loading, as deprecated
    // class aliases under src/Model, until the next planned major. An entry may land ahead of the
    // regeneration that drops its class: the alias is written once the class has left the generated
    // output (scripts/deprecated-model-aliases.mjs). Remove an entry when that major ships.
    // Dropped once the API publishes nullable references as anyOf: [{ $ref }, { type: "null" }].
    deprecatedModelAliases: [
      { deprecated: "MailboxMessageContentResponseAllOfData", replacement: "MailboxMessageContent", removedIn: "sendmux/mailbox 4.0" },
      { deprecated: "MailboxRawBodyResponseAllOfData", replacement: "MailboxRawBody", removedIn: "sendmux/mailbox 4.0" },
      { deprecated: "MailboxSubmissionEnvelopeRcptToInner", replacement: "MailboxSubmissionEnvelopeAddress", removedIn: "sendmux/mailbox 4.0" },
      { deprecated: "MailboxThreadContentResponseAllOfData", replacement: "MailboxMessageContent", removedIn: "sendmux/mailbox 4.0" },
    ],
  },
  {
    name: "management",
    artifactVersion: "2.1.1",
    composerName: "sendmux/management",
    namespace: "Sendmux\\Management",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: [
      "Billing",
      "Connection",
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
    // Dropped once the API publishes nullable references as anyOf: [{ $ref }, { type: "null" }];
    // see the mailbox table for the mechanism.
    deprecatedModelAliases: [
      { deprecated: "MailboxAppPasswordResultCredential", replacement: "MailboxCredential", removedIn: "sendmux/management 3.0" },
      { deprecated: "ProviderCreateBodyQuotasPerDayAnyOf", replacement: "ProviderQuotaRange", removedIn: "sendmux/management 3.0" },
    ],
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
    "-t",
    templateDir,
    `--additional-properties=${[
      `composerPackageName=${surface.composerName}`,
      `invokerPackage=${surface.namespace.replaceAll("\\", "\\\\")}`,
      "srcBasePath=src",
      `artifactVersion=${surface.artifactVersion}`,
      "hideGenerationTimestamp=true",
      "enumUnknownDefaultCase=true",
      "disallowAdditionalPropertiesIfNotPresent=false",
    ].join(",")}`,
    "--global-property=models,supportingFiles,apis,apiTests=false,modelTests=false,apiDocs=false,modelDocs=false",
  ]);

  rmSync(join(packageDir, "src"), { force: true, recursive: true });
  cpSync(join(generatedRoot, "src"), join(packageDir, "src"), { recursive: true });
  patchPrimitiveUnionSerializer(surface, packageDir);
  writeDeprecatedModelAliases(surface, packageDir);
  writeClientFactory(surface, packageDir);
}

formatGeneratedPhp();
console.log("Generated PHP SDK packages");

function writeFilteredSpec(surface) {
  const source = JSON.parse(readFileSync(join(root, surface.spec), "utf8"));
  prepareAttachmentUnion(source);
  prepareDeliveryGroupPrimitiveUnion(source, surface);
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
        nextPathItem[method] = markMailboxChangesResponseUnion(markBodylessSuccessResponses(operation), surface);
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

function markMailboxChangesResponseUnion(operation, surface) {
  if (operation.operationId !== "mailboxGetChanges") return operation;
  const variants = operation.responses["200"].content["application/json"].schema.anyOf;
  const models = variants.map(item => item.$ref.split("/").at(-1));
  if (models.join(",") !== "MailboxChangesResponse,MailboxTypedChangesResponse") throw new Error("Unexpected mailbox changes response union");
  const type = models.map(model => `\\${surface.namespace}\\Model\\${model}`).join("|");
  const errorModels = Object.entries(operation.responses).filter(([status]) => status !== "200").map(([, response]) => response.content?.["application/json"]?.schema?.$ref?.split("/").at(-1)).filter(Boolean);
  const returnType = [type, ...new Set(errorModels.map(model => `\\${surface.namespace}\\Model\\${model}`))].join("|");
  return {
    ...operation,
    "x-sendmux-response-union-type": type,
    "x-sendmux-response-return-type": returnType,
    responses: { ...operation.responses, "200": { ...operation.responses["200"], "x-sendmux-response-union-type": type } },
  };
}

function prepareAttachmentUnion(document) {
  const schemas = document.components?.schemas;
  const attachment = schemas?.Attachment;
  if (!attachment?.anyOf) {
    return;
  }

  const { anyOf, ...metadata } = attachment;
  const variants = anyOf.map((ref) => ({
    ...ref,
    model: ref.$ref.split("/").at(-1),
  }));
  const properties = {};
  for (const { model } of variants) {
    for (const [name, property] of Object.entries(schemas[model].properties)) {
      const { default: variantDefault, ...withoutDefault } = property;
      properties[name] = withoutDefault;
    }
  }

  schemas.Attachment = {
    ...metadata,
    type: "object",
    additionalProperties: false,
    properties,
    "x-sendmux-attachment-union": true,
    "x-sendmux-any-of-variants": variants,
  };
}

function prepareDeliveryGroupPrimitiveUnion(document, surface) {
  if (surface.name !== "sending") {
    return;
  }

  const deliveryGroup = document.components?.schemas?.EmailSendRequest?.properties?.delivery_group;
  const [scalar, list] = deliveryGroup?.oneOf ?? [];
  const expectedPattern = "^dgrp_[a-z0-9][a-z0-9_-]{0,122}$";
  if (
    scalar?.type !== "string"
    || scalar.pattern !== expectedPattern
    || list?.type !== "array"
    || list.items?.type !== "string"
    || list.items.pattern !== expectedPattern
    || list.minItems !== 1
    || list.maxItems !== 50
  ) {
    throw new Error("Unexpected EmailSendRequest delivery_group primitive union");
  }

  deliveryGroup["x-sendmux-primitive-union"] = true;
  deliveryGroup["x-sendmux-primitive-pattern"] = expectedPattern;
  deliveryGroup["x-sendmux-primitive-min-items"] = list.minItems;
  deliveryGroup["x-sendmux-primitive-max-items"] = list.maxItems;
}

function markTrailingSdkParams(document) {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        continue;
      }
      for (const parameter of operation.parameters ?? []) {
        if (operation?.requestBody && parameter?.name === "mailbox_id" && parameter.in === "query") {
          parameter["x-sendmux-trailing-sdk-param"] = true;
        }
        if (operation.operationId === "mailboxGetMessageAttachment" && parameter?.name === "download_token") {
          parameter["x-sendmux-after-content-type"] = true;
        }
      }
    }
  }
  return document;
}

function markBodylessSuccessResponses(operation) {
  if (!operation.responses?.["304"]) {
    return operation;
  }

  return {
    ...operation,
    responses: {
      ...operation.responses,
      304: {
        ...operation.responses["304"],
        "x-sendmux-bodyless-success": true,
      },
    },
  };
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

function patchPrimitiveUnionSerializer(surface, packageDir) {
  if (surface.name !== "sending") {
    return;
  }

  const serializerPath = join(packageDir, "src", "ObjectSerializer.php");
  let serializer = readFileSync(serializerPath, "utf8");
  serializer = replaceOnce(
    serializer,
    `        if (is_scalar($data) || null === $data) {
            return $data;
        }
`,
    `        if (is_scalar($data) || null === $data) {
            return $data;
        }

        if ($data instanceof \\Sendmux\\Sending\\Model\\EmailSendRequestDeliveryGroup) {
            return $data->jsonSerialize();
        }
`,
    serializerPath,
  );
  serializer = replaceOnce(
    serializer,
    `        if (null === $data) {
            return null;
        }
`,
    `        if (null === $data) {
            return null;
        }

        if ($class === \\Sendmux\\Sending\\Model\\EmailSendRequestDeliveryGroup::class) {
            return new \\Sendmux\\Sending\\Model\\EmailSendRequestDeliveryGroup($data);
        }
`,
    serializerPath,
  );
  writeFileSync(serializerPath, serializer);
}

function replaceOnce(source, from, to, filePath) {
  if (!source.includes(from)) {
    throw new Error(`Could not find expected generated snippet in ${filePath}`);
  }
  return source.replace(from, to);
}

function writeDeprecatedModelAliases(surface, packageDir) {
  const aliases = surface.deprecatedModelAliases ?? [];
  if (aliases.length === 0) {
    return;
  }

  const modelDir = join(packageDir, "src", "Model");
  const { active, pending } = planDeprecatedModelAliases({
    aliases,
    isGenerated: (modelName) => existsSync(join(modelDir, `${modelName}.php`)),
    label: modelDir,
  });
  reportPendingAliases({ label: modelDir, pending });

  const namespace = `${surface.namespace}\\Model`;
  for (const { deprecated, replacement, removedIn } of active) {
    writeFileSync(
      join(modelDir, `${deprecated}.php`),
      `<?php

declare(strict_types=1);

// phpcs:disable PSR1.Files.SideEffects

namespace ${namespace};

/*
 * Deprecated name of ${replacement}, kept as a class alias until ${removedIn}.
 */
@trigger_error(
    '${namespace}\\${deprecated} is deprecated; use '
    . '${namespace}\\${replacement}. It will be removed in ${removedIn}.',
    E_USER_DEPRECATED
);
class_alias(${replacement}::class, __NAMESPACE__ . '\\${deprecated}');

if (false) {
    /**
     * @deprecated use ${replacement}
     */
    class ${deprecated} extends ${replacement}
    {
    }
}
`,
    );
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

    /** @param string|callable(): string|null $accessToken */
    public static function httpClient(
        ?RetryOptions $retryOptions = null,
        string|callable|null $accessToken = null
    ): ClientInterface {
        $stack = HandlerStack::create();
        $stack->push(RetryMiddleware::create($retryOptions), 'sendmux_retry');
        if ($accessToken !== null) {
            $stack->push(Auth::accessTokenMiddleware($accessToken), 'sendmux_oauth');
        }

        return new Client(['handler' => $stack, 'allow_redirects' => $accessToken === null]);
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

    /** @param string|callable(): string $accessToken */
    public static function create${apiClass}WithAccessToken(
        string|callable $accessToken,
        ?string $baseUrl = null,
        ?RetryOptions $retryOptions = null
    ): ${apiClass} {
        $configuration = new Configuration();
        if ($baseUrl !== null && $baseUrl !== '') {
            $configuration->setHost($baseUrl);
        }

        return new ${apiClass}(
            self::httpClient($retryOptions, $accessToken),
            $configuration
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
