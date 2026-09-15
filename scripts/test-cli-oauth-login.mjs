import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

// Windows PowerShell must rebuild its module paths when launched through Node.
const windowsPowerShellEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name.toUpperCase() !== "PSMODULEPATH"),
);

const OAUTH_REFRESH_BOUNDARY_PRELOAD = String.raw`
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";

const RESOURCE = "oauth_refresh_boundary";
const VERSION = 1;
const startedAt = process.hrtime.bigint();
let sequence = 0;

const xdgConfigHome = process.env.XDG_CONFIG_HOME;
if (!xdgConfigHome) throw new Error("XDG_CONFIG_HOME is required for OAuth refresh diagnostics.");

const configDirectory = normalizePath(path.resolve(xdgConfigHome, "sendmux"));
const configPath = normalizePath(path.join(configDirectory, "config.json"));
const lockPath = normalizePath(path.join(configDirectory, "config.json.lock"));

function normalizePath(value) {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function classifyPath(value) {
  if (typeof value !== "string") return null;
  const normalized = normalizePath(value);
  if (normalized === configDirectory) return "config_dir";
  if (normalized === configPath) return "config";
  if (normalized === lockPath) return "config_lock";
  if (
    normalizePath(path.dirname(normalized)) === configDirectory &&
    /^config\.json\.\d+\.tmp$/.test(path.basename(normalized))
  )
    return "config_temp";
  return null;
}

function elapsedMilliseconds() {
  return Number((process.hrtime.bigint() - startedAt) / 1_000_000n);
}

function addErrorFields(event, error, includeCause = false) {
  if (typeof error?.name === "string") event.error_name = error.name;
  if (typeof error?.code === "string") event.error_code = error.code;
  if (includeCause && typeof error?.cause?.name === "string")
    event.cause_name = error.cause.name;
  if (includeCause && typeof error?.cause?.code === "string")
    event.cause_code = error.cause.code;
}

function emit(event) {
  try {
    process.stderr.write(
      JSON.stringify({
        resource: RESOURCE,
        version: VERSION,
        pid: process.pid,
        seq: ++sequence,
        elapsed_ms: elapsedMilliseconds(),
        ...event,
      }) + "\n",
    );
  } catch {}
}

async function observeFilesystem(operation, target, details, call) {
  try {
    const result = await call();
    emit({ boundary: "fs", operation, target, ...details, outcome: "success" });
    return result;
  } catch (error) {
    const event = { boundary: "fs", operation, target, ...details, outcome: "error" };
    addErrorFields(event, error);
    emit(event);
    throw error;
  }
}

function wrapLockHandle(handle) {
  const originalClose = handle.close;
  handle.close = function (...args) {
    return observeFilesystem("close", "config_lock", {}, () =>
      Reflect.apply(originalClose, this, args),
    );
  };
  return handle;
}

function patchFilesystem(
  operation,
  classify,
  transform = (value) => value,
  details = () => ({}),
) {
  const original = fs.promises[operation];
  fs.promises[operation] = function (...args) {
    const target = classify(args);
    if (!target) return Reflect.apply(original, this, args);
    return observeFilesystem(operation, target, details(args), () =>
      Promise.resolve(Reflect.apply(original, this, args)).then(transform),
    );
  };
}

patchFilesystem("mkdir", ([value]) =>
  classifyPath(value) === "config_dir" ? "config_dir" : null,
);
patchFilesystem(
  "open",
  ([value]) => (classifyPath(value) === "config_lock" ? "config_lock" : null),
  wrapLockHandle,
  ([, flags]) => (flags === "wx" ? { exclusive: true } : {}),
);
for (const operation of ["stat", "unlink"])
  patchFilesystem(operation, ([value]) =>
    classifyPath(value) === "config_lock" ? "config_lock" : null,
  );
patchFilesystem("readFile", ([value]) =>
  classifyPath(value) === "config" ? "config" : null,
);
for (const operation of ["writeFile", "chmod"])
  patchFilesystem(operation, ([value]) => {
    const target = classifyPath(value);
    return target === "config" || target === "config_temp" ? target : null;
  });
patchFilesystem("rename", ([source, destination]) =>
  classifyPath(source) === "config_temp" && classifyPath(destination) === "config"
    ? "config_temp_to_config"
    : null,
);
syncBuiltinESMExports();

function classifyFetchTarget(input) {
  try {
    const value = typeof Request !== "undefined" && input instanceof Request ? input.url : input;
    const pathname = new URL(value).pathname;
    if (pathname === "/oauth/token") return "oauth_token";
    if (pathname === "/api/v1/me") return "management_api";
  } catch {}
  return "other";
}

function classifyFetchMethod(input, init) {
  const value = init?.method ??
    (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET");
  const method = typeof value === "string" ? value.toUpperCase() : "OTHER";
  return method === "GET" || method === "POST" ? method : "OTHER";
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async function (...args) {
  const target = classifyFetchTarget(args[0]);
  const method = classifyFetchMethod(args[0], args[1]);
  try {
    const response = await Reflect.apply(originalFetch, this, args);
    emit({
      boundary: "fetch",
      operation: "fetch",
      target,
      method,
      outcome: "response",
      status: response.status,
      ok: response.ok,
    });
    return response;
  } catch (error) {
    const event = {
      boundary: "fetch",
      operation: "fetch",
      target,
      method,
      outcome: "error",
    };
    addErrorFields(event, error, true);
    emit(event);
    throw error;
  }
};
`;

async function claimDirectory(path) {
  await mkdir(path);
  const descriptor = await lstat(path);
  assert.ok(descriptor.isDirectory() && !descriptor.isSymbolicLink());
  return { path, dev: descriptor.dev, ino: descriptor.ino };
}

async function removeClaimedDirectory(claim) {
  const descriptor = await lstat(claim.path).catch((error) => {
    throw new Error(`Claimed directory identity is uncertain: ${error.code}`, {
      cause: error,
    });
  });
  assert.ok(
    descriptor.isDirectory() &&
      !descriptor.isSymbolicLink() &&
      descriptor.dev === claim.dev &&
      descriptor.ino === claim.ino,
    "Claimed directory identity changed; retaining it",
  );
  await rm(claim.path, { recursive: true, force: true });
}

async function assertPrivatePath(path, mode) {
  if (process.platform !== "win32") {
    assert.equal((await stat(path)).mode & 0o777, mode);
    return;
  }
  const descriptor = JSON.parse(
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `
      $ErrorActionPreference = 'Stop'
      $acl = Get-Acl -LiteralPath $env:SENDMUX_TEST_ACL_PATH
      $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
      $rules = @($acl.GetAccessRules($true, $true, [System.Security.Principal.SecurityIdentifier]) |
        Where-Object { $_.AccessControlType -eq 'Allow' -and
          ($_.PropagationFlags -band [System.Security.AccessControl.PropagationFlags]::InheritOnly) -eq 0 } |
        ForEach-Object { $_.IdentityReference.Value })
      @{ rules = $rules; user = $user } | ConvertTo-Json -Compress
    `,
      ],
      {
        encoding: "utf8",
        env: { ...windowsPowerShellEnv, SENDMUX_TEST_ACL_PATH: path },
      },
    ),
  );
  assert.ok(
    descriptor.rules.length > 0,
    "Credential path must have an explicit access list",
  );
  const allowed = new Set([descriptor.user, "S-1-5-18", "S-1-5-32-544"]);
  console.log(JSON.stringify({ resource: "credential_acl", path, ...descriptor }));
  assert.deepEqual(
    descriptor.rules.filter((sid) => !allowed.has(sid)),
    [],
    "Credential path grants access outside its owner, SYSTEM and Administrators",
  );
}

async function fixture(t, defaultConfigDir) {
  let defaultConfigClaim = null;
  const state = {
    directory: null,
    defaultConfigDir,
    children: new Set(),
    requests: [],
    registrations: [],
    authorization: null,
    refreshes: 0,
    revoked: [],
    mode: "normal",
    authorizationLifetime: 900,
    refreshDelay: 0,
  };
  let server;
  t.after(async () => {
    for (const record of state.children) {
      if (record.child.exitCode === null && record.child.signalCode === null)
        record.child.kill("SIGTERM");
    }
    await Promise.all([...state.children].map((record) => record.closed));
    assert.equal(state.children.size, 0, "CLI shutdown unconfirmed; retaining credential fixture");
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      assert.equal(server.listening, false);
    }
    if (defaultConfigClaim) {
      await removeClaimedDirectory(defaultConfigClaim);
      await assert.rejects(access(defaultConfigDir), { code: "ENOENT" });
      console.log(JSON.stringify({ resource: "default_config_directory", state: "removed", path: defaultConfigDir }));
    }
    if (state.directory) {
      await rm(state.directory, { recursive: true, force: true });
      await assert.rejects(access(state.directory), { code: "ENOENT" });
      console.log(JSON.stringify({ resource: "temp_directory", state: "removed", path: state.directory }));
    }
  });
  if (defaultConfigDir)
    defaultConfigClaim = await claimDirectory(defaultConfigDir);
  state.directory = await mkdtemp(join(tmpdir(), "sendmux-native-oauth-"));
  console.log(JSON.stringify({ resource: "temp_directory", state: "created", path: state.directory }));
  state.configPath = join(
    defaultConfigDir ?? join(state.directory, ".config", "sendmux"),
    "config.json",
  );
  server = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString();
    const url = new URL(req.url, state.issuer);
    state.requests.push({
      path: url.pathname,
      method: req.method,
      authorization: req.headers.authorization,
      body: raw,
    });
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      res.end(
        JSON.stringify({
          issuer: state.issuer,
          authorization_endpoint: `${state.issuer}/oauth/authorize`,
          token_endpoint: `${state.issuer}/oauth/token`,
          registration_endpoint: `${state.issuer}/oauth/register`,
          revocation_endpoint: `${state.issuer}/oauth/revoke`,
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          authorization_response_iss_parameter_supported: true,
          protected_resources: ["https://sendmux.ai/api"],
          scopes_supported: ["mailbox.read", "email.send"],
        }),
      );
    } else if (url.pathname === "/oauth/register") {
      const metadata = JSON.parse(raw);
      state.registrations.push(metadata);
      res.statusCode = 201;
      res.end(JSON.stringify({ ...metadata, client_id: "native_test_client" }));
    } else if (url.pathname === "/oauth/authorize") {
      state.authorization = url.searchParams;
      const callback = new URL(url.searchParams.get("redirect_uri"));
      callback.searchParams.set("code", "native_test_code");
      callback.searchParams.set("state", url.searchParams.get("state"));
      callback.searchParams.set("iss", state.issuer);
      res.writeHead(302, { Location: callback.href });
      res.end();
    } else if (url.pathname === "/oauth/token") {
      const form = new URLSearchParams(raw);
      if (form.get("grant_type") === "authorization_code") {
        if (state.checkClosedCallback) {
          state.callbackClosed = await fetch(form.get("redirect_uri"), {
            signal: AbortSignal.timeout(1000),
          }).then(
            () => false,
            () => true,
          );
        }
        const challenge = createHash("sha256")
          .update(form.get("code_verifier"))
          .digest("base64url");
        if (challenge !== state.authorization?.get("code_challenge")) {
          res.statusCode = 400;
          res.end("{}");
          return;
        }
      } else {
        if (form.get("refresh_token") !== `native_refresh_${state.refreshes}`) {
          res.statusCode = 400;
          res.end("{}");
          return;
        }
        state.refreshes++;
        if (state.refreshDelay)
          await new Promise((resolve) =>
            setTimeout(resolve, state.refreshDelay),
          );
        if (state.mode === "refresh-ambiguous") {
          req.socket.destroy();
          return;
        }
      }
      res.end(
        JSON.stringify({
          access_token: `native_access_${state.refreshes}`,
          refresh_token: `native_refresh_${state.refreshes}`,
          token_type: "Bearer",
          expires_in:
            form.get("grant_type") === "authorization_code"
              ? state.authorizationLifetime
              : 900,
          scope: "mailbox.read",
        }),
      );
    } else if (url.pathname === "/oauth/revoke") {
      state.revoked.push(new URLSearchParams(raw));
      if (state.mode === "revoke-fails") res.statusCode = 503;
      res.end();
    } else if (url.pathname === "/api/v1/me") {
      res.end(
        JSON.stringify({
          ok: true,
          data: {
            team: { id: "team_native", name: "Native" },
            credential: { id: "grant_native", type: "oauth", name: null },
            label: "Native",
            permissions: ["mailbox.read"],
            mailboxes: [],
          },
          meta: { request_id: "req_native" },
        }),
      );
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  state.issuer = `http://127.0.0.1:${server.address().port}`;
  return state;
}

async function cli(t, state, args, authorize = false) {
  const env = {
    ...process.env,
    HOME: state.directory,
    XDG_CONFIG_HOME: join(state.directory, ".config"),
    SENDMUX_API_KEY: "",
    SENDMUX_ACCESS_TOKEN: "",
    SENDMUX_PROFILE: "",
    SENDMUX_BASE_URL: `${state.issuer}/api/v1`,
  };
  delete env.SENDMUX_CONFIG_DIR;
  if (state.defaultConfigDir) delete env.XDG_CONFIG_HOME;
  const child = spawn(
    process.execPath,
    [
      ...(state.preload ? ["--import", pathToFileURL(state.preload).href] : []),
      "packages/ts/cli/bin/run.js",
      ...args,
    ],
    {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let resolveClosed;
  const closed = new Promise((resolve) => {
    resolveClosed = resolve;
  });
  const record = { child, closed };
  state.children.add(record);
  child.once("error", (error) => {
    record.spawnError = error;
  });
  child.once("close", (code, signal) => {
    state.children.delete(record);
    console.log(JSON.stringify({ resource: "cli_child", state: "closed", pid: child.pid, code, signal }));
    resolveUrl?.(null);
    resolveClosed([code, signal]);
  });
  console.log(JSON.stringify({ resource: "cli_child", state: "spawned", pid: child.pid }));
  let stdout = "",
    stderr = "",
    resolveUrl;
  let callbackResponse;
  const authorizationUrl = new Promise((resolve) => {
    resolveUrl = resolve;
  });
  child.stdout.on("data", (data) => {
    stdout += data;
  });
  child.stderr.on("data", (data) => {
    stderr += data;
    const url = stderr.match(
      /http:\/\/127\.0\.0\.1:\d+\/oauth\/authorize\?[^\s]+/,
    )?.[0];
    if (url) resolveUrl(url);
  });
  if (authorize) {
    const url = await authorizationUrl;
    if (url && (authorize === "terminate" || authorize === "kill")) {
      child.kill(authorize === "kill" ? "SIGKILL" : "SIGTERM");
    } else if (url) {
      const redirect = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
      let callback = redirect.headers.get("location");
      assert.ok(callback);
      if (authorize === "deny") {
        const denied = new URL(callback);
        denied.searchParams.delete("code");
        denied.searchParams.set("error", "access_denied");
        callback = denied.href;
      }
      if (typeof authorize === "function") await authorize(callback);
      const result = await fetch(callback, {
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(result.status, 200);
      callbackResponse = {
        contentType: result.headers.get("content-type"),
        body: await result.text(),
      };
    }
  }
  const [code] = await closed;
  return { pid: child.pid, code, stdout, stderr, callbackResponse };
}

function projectOAuthRefreshBoundaryEvents(stderr) {
  const operations = {
    mkdir: new Set(["config_dir"]),
    open: new Set(["config_lock"]),
    close: new Set(["config_lock"]),
    stat: new Set(["config_lock"]),
    unlink: new Set(["config_lock"]),
    readFile: new Set(["config"]),
    writeFile: new Set(["config", "config_temp"]),
    chmod: new Set(["config", "config_temp"]),
    rename: new Set(["config_temp_to_config"]),
  };
  const projected = [];
  for (const line of stderr.split(/\r?\n/)) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (
      event?.resource !== "oauth_refresh_boundary" ||
      event.version !== 1 ||
      !Number.isInteger(event.pid) ||
      !Number.isInteger(event.seq) ||
      !Number.isInteger(event.elapsed_ms) ||
      !["success", "error", "response"].includes(event.outcome)
    )
      continue;
    const safe = {
      resource: "oauth_refresh_boundary",
      version: 1,
      pid: event.pid,
      seq: event.seq,
      elapsed_ms: event.elapsed_ms,
      boundary: event.boundary,
      operation: event.operation,
      target: event.target,
      outcome: event.outcome,
    };
    if (
      event.boundary === "fs" &&
      operations[event.operation]?.has(event.target) &&
      (event.outcome === "success" || event.outcome === "error")
    ) {
      if (event.operation === "open" && event.exclusive === true) safe.exclusive = true;
      if (typeof event.error_name === "string") safe.error_name = event.error_name;
      if (typeof event.error_code === "string") safe.error_code = event.error_code;
      projected.push(safe);
    } else if (
      event.boundary === "fetch" &&
      event.operation === "fetch" &&
      ["oauth_token", "management_api", "other"].includes(event.target) &&
      ["GET", "POST", "OTHER"].includes(event.method) &&
      (event.outcome === "response" || event.outcome === "error")
    ) {
      safe.method = event.method;
      if (event.outcome === "response") {
        if (!Number.isInteger(event.status) || typeof event.ok !== "boolean") continue;
        safe.status = event.status;
        safe.ok = event.ok;
      } else {
        for (const name of ["error_name", "error_code", "cause_name", "cause_code"])
          if (typeof event[name] === "string") safe[name] = event[name];
      }
      projected.push(safe);
    }
  }
  return projected;
}

function projectOAuthRefreshConcurrencyReceipt(
  results,
  refreshCount,
  requests,
  finalProfile,
) {
  return {
    resource: "oauth_refresh_concurrency_receipt",
    version: 1,
    children: results.map(({ pid, code }) => ({
      pid: Number.isInteger(pid) ? pid : null,
      code: Number.isInteger(code) ? code : null,
    })),
    refresh_count: refreshCount,
    request_counts: {
      oauth_token: requests.filter((request) => request.path === "/oauth/token").length,
      management_api: requests.filter((request) => request.path === "/api/v1/me")
        .length,
    },
    final_profile: finalProfile,
  };
}

async function observeFinalOAuthProfile(configPath) {
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    const profile = config?.profiles?.native;
    const states = new Set([
      "active",
      "refreshing",
      "reauthorize",
      "revoking",
      "authorizing",
    ]);
    return {
      read: "ok",
      type: profile === undefined ? "missing" : profile?.type === "oauth" ? "oauth" : "other",
      state:
        profile?.state === undefined
          ? "missing"
          : states.has(profile.state)
            ? profile.state
            : "other",
    };
  } catch (error) {
    const result = { read: error?.code === "ENOENT" ? "missing" : "error" };
    if (typeof error?.name === "string") result.error_name = error.name;
    if (typeof error?.code === "string") result.error_code = error.code;
    return result;
  }
}

const login = (t, state, authorize = true) =>
  cli(
    t,
    state,
    [
      "auth:login",
      "native",
      "--issuer",
      state.issuer,
      "--scope",
      "mailbox.read",
      "--no-browser",
      "--json",
    ],
    authorize,
  );

for (const [name, authorize, exitCode] of [
  ["accepted", true, 0],
  ["declined", "deny", 1],
]) {
  test(`native ${name} callback renders without another HTTP request after listener shutdown`, async (t) => {
    const state = await fixture(t);
    const result = await login(t, state, authorize);
    assert.equal(result.code, exitCode, result.stderr);
    assert.match(result.callbackResponse.contentType, /^text\/html(?:;|$)/);
    const icons = result.callbackResponse.body.match(/<link\b[^>]*>/gi) ?? [];
    assert.ok(
      icons.some(
        (tag) => /rel="icon"/.test(tag) && /href="data:image\//.test(tag),
      ),
      "callback must declare an inline icon instead of triggering the browser favicon fallback",
    );
    assert.doesNotMatch(
      result.callbackResponse.body,
      /(?:href|src)="(?:https?:|\/)/,
    );
    assert.match(
      result.callbackResponse.body,
      /Authorization received\. You can return to the terminal\./,
    );
    assert.doesNotMatch(
      result.callbackResponse.body,
      /native_test_code|access_denied/,
    );
  });
}

test("native login uses S256, validates the callback and saves a protected profile without exposing tokens", async (t) => {
  let defaultConfigDir;
  if (process.platform === "win32") {
    assert.ok(
      process.env.LOCALAPPDATA,
      "Windows default-path proof requires LOCALAPPDATA",
    );
    defaultConfigDir = join(process.env.LOCALAPPDATA, "sendmux");
    console.log(JSON.stringify({
      windows_default_config: defaultConfigDir,
      node: process.version,
      platform: process.platform,
    }));
  }
  const state = await fixture(t, defaultConfigDir);
  const result = await login(t, state, async (callback) => {
    const wrong = new URL(callback);
    wrong.searchParams.set("state", "wrong");
    assert.equal((await fetch(wrong)).status, 400);
    const wrongIssuer = new URL(callback);
    wrongIssuer.searchParams.set("iss", "https://untrusted.example");
    assert.equal((await fetch(wrongIssuer)).status, 400);
  });
  assert.equal(result.code, 0, result.stderr);
  const checkedConfigPath = defaultConfigDir
    ? join(defaultConfigDir, "config.json")
    : state.configPath;
  const config = JSON.parse(await readFile(checkedConfigPath, "utf8"));
  assert.equal(config.profiles.native.type, "oauth");
  assert.equal(config.profiles.native.accessToken, "native_access_0");
  assert.equal(config.profiles.native.refreshToken, "native_refresh_0");
  await assertPrivatePath(checkedConfigPath, 0o600);
  await assertPrivatePath(
    defaultConfigDir ?? join(state.directory, ".config", "sendmux"),
    0o700,
  );
  if (defaultConfigDir) {
    const canary = join(state.directory, "acl-sensitivity.txt");
    await writeFile(canary, "Inert ACL sensitivity probe\n", { flag: "wx", mode: 0o600 });
    await assertPrivatePath(canary, 0o600);
    const aclEnv = { ...windowsPowerShellEnv, SENDMUX_TEST_ACL_PATH: canary };
    const canaryAcl = (script) => execFileSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference = 'Stop'; ${script}`],
      { encoding: "utf8", env: aclEnv },
    ).trim();
    const describeCanary = `
      $acl = Get-Acl -LiteralPath $env:SENDMUX_TEST_ACL_PATH
      $sid = [System.Security.Principal.SecurityIdentifier]
      @{ sddl = $acl.Sddl; policy = @{
        owner = $acl.GetOwner($sid).Value; group = $acl.GetGroup($sid).Value
        protected = $acl.AreAccessRulesProtected
        rules = @($acl.GetAccessRules($true, $true, $sid) | ForEach-Object {
          @{ sid = $_.IdentityReference.Value; rights = [int]$_.FileSystemRights
             type = [int]$_.AccessControlType; inherited = $_.IsInherited
             inheritance = [int]$_.InheritanceFlags; propagation = [int]$_.PropagationFlags }
        })
      } } | ConvertTo-Json -Depth 5 -Compress
    `;
    const originalAcl = JSON.parse(canaryAcl(describeCanary));
    aclEnv.SENDMUX_TEST_ORIGINAL_ACL = originalAcl.sddl;
    try {
      canaryAcl(`
        $acl = Get-Acl -LiteralPath $env:SENDMUX_TEST_ACL_PATH
        $everyone = [System.Security.Principal.SecurityIdentifier]::new('S-1-1-0')
        $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($everyone, 'Read', 'Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $env:SENDMUX_TEST_ACL_PATH -AclObject $acl
      `);
      await assert.rejects(assertPrivatePath(canary, 0o600), {
        code: "ERR_ASSERTION",
        message: /Credential path grants access outside its owner, SYSTEM and Administrators/,
      });
      console.log(JSON.stringify({ resource: "acl_sensitivity", state: "public_read_rejected", path: canary }));
    } finally {
      canaryAcl(`
        $acl = Get-Acl -LiteralPath $env:SENDMUX_TEST_ACL_PATH
        $acl.SetSecurityDescriptorSddlForm($env:SENDMUX_TEST_ORIGINAL_ACL, [System.Security.AccessControl.AccessControlSections]::Access)
        Set-Acl -LiteralPath $env:SENDMUX_TEST_ACL_PATH -AclObject $acl
      `);
    }
    // Windows can set its auto-inherited marker without changing the access policy.
    assert.deepEqual(
      JSON.parse(canaryAcl(describeCanary)).policy,
      originalAcl.policy,
    );
    await assertPrivatePath(canary, 0o600);
    console.log(JSON.stringify({ resource: "acl_sensitivity", state: "restored", path: canary }));
  }
  assert.equal(state.registrations[0].application_type, "native");
  assert.equal(state.registrations[0].token_endpoint_auth_method, "none");
  assert.equal(state.registrations[0].resource, "https://sendmux.ai/api");
  assert.equal(state.authorization.get("code_challenge_method"), "S256");
  assert.equal(state.authorization.get("resource"), "https://sendmux.ai/api");
  assert.ok(!`${result.stdout}${result.stderr}`.includes("native_access_0"));
  assert.ok(!`${result.stdout}${result.stderr}`.includes("native_refresh_0"));
  const shown = await cli(t, state, ["profiles:show", "native", "--json"]);
  assert.equal(shown.code, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).data.type, "oauth");
  assert.ok(!shown.stdout.includes("native_access_0"));
  const overwritten = await cli(t, state, [
    "profiles:set",
    "native",
    "--api-key",
    "smx_mbx_test",
    "--json",
  ]);
  assert.notEqual(overwritten.code, 0);
  assert.equal(
    JSON.parse(await readFile(state.configPath, "utf8")).profiles.native.type,
    "oauth",
  );
});

test("fixture cleanup retains a directory whose identity changed after ownership was claimed", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "sendmux-ownership-replaced-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const target = join(parent, "sendmux");
  const displaced = join(parent, "owned-original");
  const claim = await claimDirectory(target);
  await rename(target, displaced);
  await mkdir(target);
  await writeFile(join(target, "unrelated.txt"), "retain\n");

  await assert.rejects(removeClaimedDirectory(claim), /identity changed/);
  assert.equal(await readFile(join(target, "unrelated.txt"), "utf8"), "retain\n");
});

test("fixture ownership rejects and retains a pre-existing directory", async (t) => {
  const parent = await mkdtemp(join(tmpdir(), "sendmux-ownership-existing-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const target = join(parent, "sendmux");
  await mkdir(target);
  await writeFile(join(target, "existing.txt"), "retain\n");

  await assert.rejects(claimDirectory(target), { code: "EEXIST" });
  assert.equal(await readFile(join(target, "existing.txt"), "utf8"), "retain\n");
});

test("expired profiles rotate once across concurrent CLI requests", async (t) => {
  const state = await fixture(t);
  state.authorizationLifetime = 1;
  state.refreshDelay = 150;
  assert.equal((await login(t, state)).code, 0);
  state.preload = join(state.directory, "oauth-refresh-boundaries.mjs");
  await writeFile(state.preload, OAUTH_REFRESH_BOUNDARY_PRELOAD);
  const requestStartIndex = state.requests.length;
  const results = await Promise.all(
    [1, 2].map(() =>
      cli(t, state, [
        "management:get-connection",
        "--profile",
        "native",
        "--json",
      ]),
    ),
  );
  const finalProfile = await observeFinalOAuthProfile(state.configPath);
  for (const result of results)
    for (const event of projectOAuthRefreshBoundaryEvents(result.stderr))
      console.log(JSON.stringify(event));
  console.log(
    JSON.stringify(
      projectOAuthRefreshConcurrencyReceipt(
        results,
        state.refreshes,
        state.requests.slice(requestStartIndex),
        finalProfile,
      ),
    ),
  );
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(state.refreshes, 1);
  const apiRequests = state.requests.filter(
    (request) => request.path === "/api/v1/me",
  );
  assert.equal(apiRequests.length, 2);
  assert.ok(
    apiRequests.every(
      (request) => request.authorization === "Bearer native_access_1",
    ),
  );
  const profile = JSON.parse(await readFile(state.configPath, "utf8")).profiles
    .native;
  assert.equal(profile.refreshToken, "native_refresh_1");
  assert.equal(profile.state, "active");
});

test("an ambiguous refresh failure never replays the old refresh token", async (t) => {
  const state = await fixture(t);
  state.authorizationLifetime = 1;
  assert.equal((await login(t, state)).code, 0);
  state.mode = "refresh-ambiguous";
  for (let index = 0; index < 2; index++) {
    const result = await cli(t, state, [
      "management:get-connection",
      "--profile",
      "native",
      "--json",
    ]);
    assert.notEqual(result.code, 0);
    assert.ok(!`${result.stdout}${result.stderr}`.includes("native_refresh_0"));
  }
  assert.equal(state.refreshes, 1);
  assert.equal(
    state.requests.filter((request) => request.path === "/api/v1/me").length,
    0,
  );
});

test("logout retains a failed revocation for retry and removes only the revoked profile", async (t) => {
  const state = await fixture(t);
  assert.equal((await login(t, state)).code, 0);
  state.mode = "revoke-fails";
  const failed = await cli(t, state, ["auth:logout", "native", "--json"]);
  assert.notEqual(failed.code, 0);
  assert.equal(
    JSON.parse(await readFile(state.configPath, "utf8")).profiles.native.type,
    "oauth",
  );
  state.mode = "normal";
  const result = await cli(t, state, ["auth:logout", "native", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(state.revoked.length, 2);
  for (const form of state.revoked) {
    assert.equal(form.get("token"), "native_refresh_0");
    assert.equal(form.get("client_id"), "native_test_client");
  }
  const config = JSON.parse(await readFile(state.configPath, "utf8"));
  assert.equal(config.profiles.native, undefined);
  assert.notEqual(config.defaultProfile, "native");
  assert.ok(!`${result.stdout}${result.stderr}`.includes("native_refresh_0"));
});

test("malformed callback targets are rejected without crashing login", async (t) => {
  const state = await fixture(t);
  const result = await login(t, state, async (callback) => {
    const status = await new Promise((resolve, reject) => {
      const request = httpRequest(callback, { path: "//[" }, (response) => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on("error", reject);
      request.end();
    });
    assert.equal(status, 400);
  });
  assert.equal(result.code, 0, result.stderr);
});

test("cancelled login removes its reservation and closes the callback listener", async (t) => {
  const state = await fixture(t);
  const result = await login(
    t,
    state,
    process.platform === "win32" ? "deny" : "terminate",
  );
  assert.notEqual(result.code, 0);
  const config = JSON.parse(await readFile(state.configPath, "utf8"));
  assert.equal(config.profiles.native, undefined);
  await assert.rejects(
    fetch(state.registrations[0].redirect_uris[0], {
      signal: AbortSignal.timeout(1000),
    }),
  );
});

test("logout clears an interrupted login reservation without replacing other profiles", async (t) => {
  const state = await fixture(t);
  assert.notEqual((await login(t, state, "kill")).code, 0);
  assert.equal(
    (
      await cli(t, state, [
        "profiles:set",
        "other",
        "--api-key",
        "smx_mbx_other",
        "--json",
      ])
    ).code,
    0,
  );
  const result = await cli(t, state, ["auth:logout", "native", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const config = JSON.parse(await readFile(state.configPath, "utf8"));
  assert.equal(config.profiles.native, undefined);
  assert.equal(config.profiles.other.apiKey, "smx_mbx_other");
  assert.equal(state.revoked.length, 0);
});

test("login closes the callback listener before exchanging the code", async (t) => {
  const state = await fixture(t);
  state.checkClosedCallback = true;
  const result = await login(t, state);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(state.callbackClosed, true);
});

test("login uses IPv6 loopback when the IPv4 interface is unavailable", async (t) => {
  const state = await fixture(t);
  state.preload = join(state.directory, "ipv4-unavailable.mjs");
  // Fault injection at the operating-system bind seam; the CLI and HTTP flow remain real.
  await writeFile(
    state.preload,
    `
    import { Server } from 'node:net';
    const listen = Server.prototype.listen;
    Server.prototype.listen = function (...args) {
      if (args[1] === '127.0.0.1') {
        queueMicrotask(() => this.emit('error', Object.assign(new Error('IPv4 unavailable'), { code: 'EAFNOSUPPORT' })));
        return this;
      }
      return listen.apply(this, args);
    };
  `,
  );
  const result = await login(t, state);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(
    new URL(state.registrations[0].redirect_uris[0]).hostname,
    "[::1]",
  );
});
