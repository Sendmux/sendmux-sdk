import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const outputRoot = join(root, ".tmp", "go-codegen");
const ogenVersion = "v1.14.0";

const surfaces = [
  {
    name: "sending",
    spec: ".codegen/openapi-sending.openapi-generator.codegen.json",
    tags: ["Emails", "Meta"],
    defaultBaseUrl: "https://smtp.sendmux.ai/api/v1",
    keySurface: "mailbox",
    description: "Sending API",
  },
  {
    name: "mailbox",
    spec: ".codegen/openapi-app.openapi-generator.codegen.json",
    tags: ["Mailbox API"],
    defaultBaseUrl: "https://app.sendmux.ai/api/v1",
    keySurface: "mailbox",
    description: "Mailbox API",
  },
  {
    name: "management",
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
    defaultBaseUrl: "https://app.sendmux.ai/api/v1",
    keySurface: "root",
    description: "Management API",
  },
];

run("pnpm", ["normalize:codegen"]);
rmSync(outputRoot, { force: true, recursive: true });
mkdirSync(outputRoot, { recursive: true });

for (const surface of surfaces) {
  const packageDir = join(root, "go", surface.name);
  const inputSpec = writeFilteredSpec(surface);

  run("go", [
    "run",
    `github.com/ogen-go/ogen/cmd/ogen@${ogenVersion}`,
    "--target",
    packageDir,
    "--package",
    surface.name,
    "--clean",
    inputSpec,
  ]);

  writeSurfaceFiles(surface, inputSpec);
}

run("go", ["mod", "tidy"], { cwd: join(root, "go") });
console.log("Generated Go SDK packages");

function writeFilteredSpec(surface) {
  // ogen v1.14.0 cannot parse OpenAPI 3.1 type arrays such as
  // type: ["string", "null"], so Go codegen consumes the same transient
  // nullable-downconverted artifact as OpenAPI Generator. The committed
  // snapshots remain the 3.1 source of truth.
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
  writeFileSync(outputPath, `${JSON.stringify(normalizeForOgen(pruneComponents({ ...source, paths })), null, 2)}\n`);
  return outputPath;
}

function normalizeForOgen(value) {
  const harmonized = harmonizeResponseHeaders(value);
  return normalizeOgenNode(stripFalseAdditionalProperties(harmonized), harmonized);
}

function harmonizeResponseHeaders(document) {
  const headersBySchemaRef = new Map();

  forEachResponse(document, (response) => {
    const ref = response.content?.["application/json"]?.schema?.$ref;
    if (!ref || !response.headers) {
      return;
    }

    headersBySchemaRef.set(ref, {
      ...(headersBySchemaRef.get(ref) ?? {}),
      ...response.headers,
    });
  });

  forEachResponse(document, (response) => {
    const ref = response.content?.["application/json"]?.schema?.$ref;
    const headers = headersBySchemaRef.get(ref);
    if (!headers) {
      return;
    }

    response.headers = {
      ...headers,
      ...(response.headers ?? {}),
    };
  });

  return document;
}

function forEachResponse(document, visitor) {
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
        continue;
      }

      for (const response of Object.values(operation.responses ?? {})) {
        visitor(response);
      }
    }
  }
}

function stripFalseAdditionalProperties(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripFalseAdditionalProperties(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "additionalProperties" && child === false) {
      continue;
    }

    if (key === "text/event-stream" && child && typeof child === "object") {
      next[key] = { ...stripFalseAdditionalProperties(child), schema: { format: "binary", type: "string" } };
      continue;
    }

    next[key] = stripFalseAdditionalProperties(child);
  }
  return next;
}

function normalizeOgenNode(value, document) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeOgenNode(item, document));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value.anyOf)) {
    const collapsed = collapseAnyOf(value.anyOf, document);
    if (collapsed) {
      const { anyOf: _anyOf, ...rest } = value;
      return normalizeOgenNode({ ...rest, ...collapsed }, document);
    }
  }

  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, normalizeOgenNode(child, document)]));
}

function collapseAnyOf(branches, document) {
  const resolved = branches.map((branch) => resolveRef(document, branch.$ref) ?? branch);

  if (resolved.every(isPlainObjectSchema)) {
    return mergeObjectBranches(resolved);
  }

  if (resolved.every(isSuccessEnvelopeSchema)) {
    return {
      allOf: [
        { $ref: "#/components/schemas/SuccessEnvelope" },
        {
          properties: {
            data: {},
            meta: { $ref: "#/components/schemas/ResponseMeta" },
          },
          required: ["data"],
          type: "object",
        },
      ],
    };
  }

  return null;
}

function resolveRef(document, ref) {
  if (typeof ref !== "string" || !ref.startsWith("#/")) {
    return null;
  }

  return ref
    .slice(2)
    .split("/")
    .map(decodeURIComponent)
    .reduce((value, part) => value?.[part], document);
}

function isPlainObjectSchema(schema) {
  return Boolean(schema && typeof schema === "object" && schema.type === "object" && schema.properties);
}

function mergeObjectBranches(branches) {
  const properties = {};
  const requiredSets = branches.map((branch) => new Set(branch.required ?? []));
  for (const branch of branches) {
    Object.assign(properties, branch.properties ?? {});
  }

  const required = [...requiredSets[0]].filter((field) => requiredSets.every((set) => set.has(field)));
  return {
    properties,
    ...(required.length > 0 ? { required } : {}),
    type: "object",
  };
}

function isSuccessEnvelopeSchema(schema) {
  return Boolean(
    schema &&
      typeof schema === "object" &&
      Array.isArray(schema.allOf) &&
      schema.allOf.some((item) => item.$ref === "#/components/schemas/SuccessEnvelope"),
  );
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

function writeSurfaceFiles(surface, specPath) {
  const packageDir = join(root, "go", surface.name);

  writeFileSync(
    join(packageDir, "doc.go"),
    `// Package ${surface.name} contains the generated Sendmux ${surface.description} client.
package ${surface.name}

// DefaultBaseURL is the production Sendmux ${surface.description} base URL.
const DefaultBaseURL = "${surface.defaultBaseUrl}"
`,
  );

  writeFileSync(
    join(packageDir, "sendmux_client.go"),
    `package ${surface.name}

import (
\t"context"
\t"net/http"

\t"sendmux.ai/go/core"
)

type securitySource struct {
\tapiKey string
}

func (s securitySource) BearerAuth(_ context.Context, _ OperationName) (BearerAuth, error) {
\treturn BearerAuth{Token: s.apiKey}, nil
}

type sendmuxClientConfig struct {
\tbaseURL      string
\thttpClient   *http.Client
\tretryOptions core.RetryOptions
}

// SendmuxOption configures a Sendmux ${surface.description} client.
type SendmuxOption func(*sendmuxClientConfig)

// WithBaseURL overrides the default Sendmux API base URL.
func WithBaseURL(baseURL string) SendmuxOption {
\treturn func(config *sendmuxClientConfig) {
\t\tif baseURL != "" {
\t\t\tconfig.baseURL = baseURL
\t\t}
\t}
}

// WithHTTPClient sets the base HTTP client wrapped by the retry transport.
func WithHTTPClient(client *http.Client) SendmuxOption {
\treturn func(config *sendmuxClientConfig) {
\t\tif client != nil {
\t\t\tconfig.httpClient = client
\t\t}
\t}
}

// WithRetryOptions sets retry and rate-limit backoff behaviour.
func WithRetryOptions(options core.RetryOptions) SendmuxOption {
\treturn func(config *sendmuxClientConfig) {
\t\tconfig.retryOptions = options
\t}
}

// New returns a Sendmux ${surface.description} client.
func New(apiKey string, opts ...SendmuxOption) (*Client, error) {
\tif err := core.ValidateAPIKey(apiKey, core.KeySurface${packageTitle(surface.keySurface)}); err != nil {
\t\treturn nil, err
\t}

\tconfig := sendmuxClientConfig{
\t\tbaseURL: DefaultBaseURL,
\t}
\tfor _, opt := range opts {
\t\topt(&config)
\t}

\treturn NewClient(
\t\tconfig.baseURL,
\t\tsecuritySource{apiKey: apiKey},
\t\tWithClient(core.NewHTTPClient(config.httpClient, config.retryOptions)),
\t)
}

// OptionalHeader returns a generated optional string header value.
func OptionalHeader(value string) OptString {
\tvar out OptString
\tout.SetTo(value)
\treturn out
}

// IdempotencyKey returns a generated Idempotency-Key header value.
func IdempotencyKey(value string) OptString {
\treturn OptionalHeader(value)
}

// IfMatch returns a generated If-Match header value.
func IfMatch(value string) OptString {
\treturn OptionalHeader(value)
}

// IfNoneMatch returns a generated If-None-Match header value.
func IfNoneMatch(value string) OptString {
\treturn OptionalHeader(value)
}

// APIErrorFromResponse maps a generated error response into a typed API error.
func APIErrorFromResponse(response any, status int) (*core.APIError, bool) {
\treturn core.APIErrorFromResponse(response, status)
}
`,
  );

  writeFileSync(join(packageDir, "error_methods.go"), buildErrorMethods(surface.name, packageDir));
}

function buildErrorMethods(packageName, packageDir) {
  const generatedSchemas = readFileSync(join(packageDir, "oas_schemas_gen.go"), "utf8");
  const entries = [...generatedSchemas.matchAll(/^type ([A-Z]\w+) (ApiError|ErrorResponse)$/gm)].map((match) => {
    return {
      status: inferStatus(match[1]),
      typeName: match[1],
    };
  });

  if (entries.length === 0) {
    return `package ${packageName}\n`;
  }

  const methods = entries
    .map(({ status, typeName }) => {
      return `// APIError maps ${typeName} into the shared typed API error.
func (r *${typeName}) APIError() *core.APIError {
\terr, _ := core.APIErrorFromResponse(r, ${status})
\treturn err
}
`;
    })
    .join("\n");

  return `package ${packageName}

import "sendmux.ai/go/core"

${methods}`;
}

function inferStatus(typeName) {
  const suffixes = {
    BadRequest: 400,
    Unauthorized: 401,
    PaymentRequired: 402,
    Forbidden: 403,
    NotFound: 404,
    Conflict: 409,
    PreconditionFailed: 412,
    RequestEntityTooLarge: 413,
    UnprocessableEntity: 422,
    TooManyRequests: 429,
    InternalServerError: 500,
    BadGateway: 502,
    ServiceUnavailable: 503,
    GatewayTimeout: 504,
  };

  const match = Object.entries(suffixes).find(([suffix]) => typeName.endsWith(suffix));
  return match?.[1] ?? 0;
}

function packageTitle(name) {
  return toPascal(name);
}

function toPascal(value) {
  return String(value)
    .split(/[^A-Za-z0-9]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join("");
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}
