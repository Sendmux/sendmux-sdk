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
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const profileFilesystemFaultPreload = fileURLToPath(
  new URL("./profile-fs-fault-preload.mjs", import.meta.url),
);

// Windows PowerShell must rebuild its module paths when launched through Node.
const windowsPowerShellEnv = Object.fromEntries(
  Object.entries(process.env).filter(([name]) => name.toUpperCase() !== "PSMODULEPATH"),
);

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

async function waitForAgentRegistrationPair(state, profileName) {
  if (
    state.agentRegistrations.filter(
      (candidate) => candidate.profileName === profileName,
    ).length >= 2
  ) {
    state.releaseAgentRegistrationPair();
  }
  let timer;
  try {
    return await Promise.race([
      state.agentRegistrationPairReady.then(() => true),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(false), 5_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
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
  let releaseAgentRegistrationPair;
  const agentRegistrationPairReady = new Promise((resolve) => {
    releaseAgentRegistrationPair = resolve;
  });
  const state = {
    directory: null,
    defaultConfigDir,
    children: new Set(),
    requests: [],
    registrations: [],
    agentRegistrations: [],
    agentRegistrationPairReady,
    releaseAgentRegistrationPair,
    authorization: null,
    refreshes: 0,
    revoked: [],
    mode: "normal",
    authorizationLifetime: 900,
    refreshDelay: 0,
    oauthRefreshOwnershipFault: null,
    oauthRefreshOwnershipSnapshot: null,
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
      const address = server.address();
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      assert.equal(server.listening, false);
      console.log(JSON.stringify({
        resource: "oauth_fixture_server",
        state: "closed",
        port: typeof address === "object" && address ? address.port : null,
      }));
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
        if (state.oauthRefreshOwnershipFault) {
          state.oauthRefreshOwnershipSnapshot = await snapshotFaultReceipt(
            state.oauthRefreshOwnershipFault,
            "oauth_refresh",
          );
        }
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
    } else if (
      url.pathname === "/agent-auth/agent/identity" &&
      req.method === "POST"
    ) {
      const registration = JSON.parse(raw);
      const profileName = registration.mailbox_local_part;
      const stored = JSON.parse(await readFile(state.configPath, "utf8"))
        .profiles[profileName];
      if (
        stored?.state !== "registering" ||
        stored.idempotencyKey !== req.headers["idempotency-key"] ||
        stored.idempotencyKey !== registration.idempotency_key
      ) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "registration was not reserved before network" }));
        return;
      }
      state.agentRegistrations.push({
        idempotencyKey: req.headers["idempotency-key"],
        profileName,
      });
      if (
        profileName === "profile-fs-agent" &&
        !(await waitForAgentRegistrationPair(state, profileName))
      ) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: "concurrent registration request did not arrive" }));
        return;
      }
      res.statusCode = 201;
      res.end(
        JSON.stringify({
          access_token: "smx_agent_profile_fs_testkey1234567890",
          mailbox: {
            email: `${profileName}@myagent.mx`,
            status: "provisioning",
          },
          registration_id: "areg_profile_fs",
        }),
      );
    } else if (
      url.pathname === "/api/v1/mailbox/me" &&
      req.method === "GET"
    ) {
      res.end(JSON.stringify({ ok: true, data: { status: "active" }, meta: {} }));
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
  console.log(JSON.stringify({
    resource: "oauth_fixture_server",
    state: "listening",
    port: server.address().port,
  }));
  return state;
}

async function cli(t, state, args, authorize = false, options = {}) {
  const filesystemFault = options.filesystemFault;
  const env = {
    ...process.env,
    HOME: state.directory,
    XDG_CONFIG_HOME: join(state.directory, ".config"),
    SENDMUX_API_KEY: "",
    SENDMUX_ACCESS_TOKEN: "",
    SENDMUX_PROFILE: "",
    SENDMUX_BASE_URL: `${state.issuer}/api/v1`,
    ...(filesystemFault
      ? { SENDMUX_TEST_PROFILE_FS_FAULT: JSON.stringify(filesystemFault) }
      : {}),
  };
  delete env.SENDMUX_CONFIG_DIR;
  if (state.defaultConfigDir) delete env.XDG_CONFIG_HOME;
  const child = spawn(
    process.execPath,
    [
      ...(filesystemFault
        ? ["--import", pathToFileURL(profileFilesystemFaultPreload).href]
        : state.preload
          ? ["--import", pathToFileURL(state.preload).href]
          : []),
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
  let timedOut = false;
  const timeout = options.timeoutMs
    ? setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs)
    : null;
  const [code] = await closed;
  if (timeout) clearTimeout(timeout);
  return {
    code,
    stdout,
    stderr,
    callbackResponse,
    closedAtMs: Date.now(),
    timedOut,
  };
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

async function seedExpiredOAuthProfile(t, state) {
  state.authorizationLifetime = 1;
  assert.equal((await login(t, state)).code, 0);
  const config = JSON.parse(await readFile(state.configPath, "utf8"));
  config.profiles.native.expiresAt = 0;
  config.profiles.other = { apiKey: "smx_mbx_other", type: "api_key" };
  await writeFile(state.configPath, `${JSON.stringify(config, null, 2)}\n`);
  return await readFile(state.configPath, "utf8");
}

function profileFilesystemFault(state, label, specification) {
  return {
    ...specification,
    failures: specification.failures ?? 1,
    receiptPath: join(state.directory, `profile-fs-${label}.json`),
  };
}

async function readFaultReceipt(fault) {
  const receipt = await loadFaultReceipt(fault);
  console.log(JSON.stringify({
    resource: "profile_filesystem_fault",
    receipt,
    receipt_path: fault.receiptPath,
  }));
  return receipt;
}

async function loadFaultReceipt(fault) {
  return JSON.parse(await readFile(fault.receiptPath, "utf8"));
}

async function snapshotFaultReceipt(fault, boundary) {
  const receipt = await loadFaultReceipt(fault).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  console.log(JSON.stringify({
    boundary,
    receipt,
    request_observed: true,
    resource: "profile_filesystem_ownership_boundary",
  }));
  return receipt;
}

async function readOptionalFaultReceipt(fault) {
  try {
    return await readFaultReceipt(fault);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function assertRecoveredFault(fault) {
  const receipt = await readFaultReceipt(fault);
  assert.equal(receipt.injected, 1, "selected filesystem denial did not occur");
  assert.ok(receipt.matched >= 2, "filesystem boundary was not retried");
  assert.ok(receipt.succeeded >= 1, "filesystem boundary never succeeded after denial");
  if (receipt.operation === "open") {
    assert.ok(
      receipt.exclusive_open_succeeded >= 1,
      "exclusive filesystem open never succeeded after denial",
    );
  }
}

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

if (process.platform === "win32") {
  test("Windows recovers an obstructed OAuth reservation without losing concurrent requests", async (t) => {
    const state = await fixture(t);
    await seedExpiredOAuthProfile(t, state);
    const faults = [1, 2].map((index) =>
      profileFilesystemFault(state, `oauth-reservation-${index}`, {
        candidate: {
          accessToken: "native_access_0",
          profileName: "native",
          state: "refreshing",
        },
        code: "EPERM",
        operation: "rename",
        path: state.configPath,
      }),
    );
    const results = await Promise.all(
      faults.map((filesystemFault) =>
        cli(
          t,
          state,
          ["management:get-connection", "--profile", "native", "--json"],
          false,
          { filesystemFault },
        ),
      ),
    );
    const receipts = await Promise.all(faults.map(readOptionalFaultReceipt));
    const obstructed = receipts
      .map((receipt, index) => ({ index, receipt }))
      .filter(({ receipt }) => receipt?.injected === 1);
    assert.ok(obstructed.length > 0, "neither concurrent participant reached the selected denial");
    for (const { index, receipt } of obstructed) {
      assert.equal(results[index].code, 0, "the obstructed participant did not recover");
      assert.ok(receipt.matched >= 2, "the obstructed replacement was not retried");
      assert.ok(receipt.succeeded >= 1, "the obstructed replacement never succeeded");
    }
    for (const result of results) assert.equal(result.code, 0, result.stderr);

    assert.equal(state.refreshes, 1);
    const protectedRequests = state.requests.filter(
      (request) => request.path === "/api/v1/me",
    );
    assert.equal(protectedRequests.length, 2);
    assert.ok(
      protectedRequests.every(
        (request) => request.authorization === "Bearer native_access_1",
      ),
    );
    const config = JSON.parse(await readFile(state.configPath, "utf8"));
    assert.equal(config.profiles.native.refreshToken, "native_refresh_1");
    assert.equal(config.profiles.native.state, "active");
    assert.equal(config.profiles.other.apiKey, "smx_mbx_other");
  });

  test("Windows recovers config replacement denial after OAuth token rotation without replay", async (t) => {
    const state = await fixture(t);
    await seedExpiredOAuthProfile(t, state);
    const filesystemFault = profileFilesystemFault(
      state,
      "oauth-rotated-persistence",
      {
        candidate: {
          accessToken: "native_access_1",
          profileName: "native",
          state: "active",
        },
        code: "EACCES",
        operation: "rename",
        path: state.configPath,
      },
    );
    const result = await cli(
      t,
      state,
      ["management:get-connection", "--profile", "native", "--json"],
      false,
      { filesystemFault },
    );
    await assertRecoveredFault(filesystemFault);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(state.refreshes, 1, "rotated refresh token was replayed");
    const protectedRequests = state.requests.filter(
      (request) => request.path === "/api/v1/me",
    );
    assert.deepEqual(
      protectedRequests.map((request) => request.authorization),
      ["Bearer native_access_1"],
    );
    const config = JSON.parse(await readFile(state.configPath, "utf8"));
    assert.equal(config.profiles.native.refreshToken, "native_refresh_1");
    assert.equal(config.profiles.native.state, "active");
    assert.equal(config.profiles.other.apiKey, "smx_mbx_other");
  });

  test("Windows waits for a successful OAuth config lock open before refreshing", async (t) => {
    const state = await fixture(t);
    await seedExpiredOAuthProfile(t, state);
    const filesystemFault = profileFilesystemFault(state, "oauth-config-lock", {
      code: "EBUSY",
      openFlags: "wx",
      operation: "open",
      path: `${state.configPath}.lock`,
    });
    state.oauthRefreshOwnershipFault = filesystemFault;
    const result = await cli(
      t,
      state,
      ["management:get-connection", "--profile", "native", "--json"],
      false,
      { filesystemFault },
    );
    assert.ok(
      state.oauthRefreshOwnershipSnapshot?.exclusive_open_succeeded >= 1,
      "OAuth refresh request began before successful exclusive config lock ownership",
    );
    await assertRecoveredFault(filesystemFault);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(state.refreshes, 1);
    assert.equal(
      state.requests.filter((request) => request.path === "/api/v1/me").length,
      1,
    );
  });

  test("Windows agent registration waits for real intent-lock ownership without extra attempts", async (t) => {
    const state = await fixture(t);
    await mkdir(dirname(state.configPath), { mode: 0o700, recursive: true });
    await writeFile(
      state.configPath,
      `${JSON.stringify({
        defaultProfile: "other",
        profiles: { other: { apiKey: "smx_mbx_other", type: "api_key" } },
      }, null, 2)}\n`,
    );
    const profileName = "profile-fs-agent";
    const intentLockPath = join(
      dirname(state.configPath),
      `agent-registration-${createHash("sha256").update(profileName).digest("hex")}.json.lock`,
    );
    const faults = [1, 2].map((index) =>
      profileFilesystemFault(state, `agent-intent-lock-${index}`, {
        code: "EPERM",
        openFlags: "wx",
        operation: "open",
        path: intentLockPath,
      }),
    );
    const results = await Promise.all(
      faults.map((filesystemFault) =>
        cli(
          t,
          state,
          [
            "agent:register",
            profileName,
            "--base-url",
            state.issuer,
            "--mailbox-local-part",
            profileName,
            "--json",
          ],
          false,
          { filesystemFault },
        ),
      ),
    );
    await Promise.all(faults.map(assertRecoveredFault));
    for (const result of results) assert.equal(result.code, 0, result.stderr);

    assert.equal(state.agentRegistrations.length, 2, "registration was retried after lock recovery");
    const keys = state.agentRegistrations.map(({ idempotencyKey }) => idempotencyKey);
    assert.ok(keys.every((key) => typeof key === "string" && key.length > 0));
    assert.equal(new Set(keys).size, 1, "concurrent registration lost its logical identity");
    assert.deepEqual(
      results.map((result) => JSON.parse(result.stdout).data.registration_id),
      ["areg_profile_fs", "areg_profile_fs"],
    );
    const config = JSON.parse(await readFile(state.configPath, "utf8"));
    assert.equal(config.profiles[profileName].state, "active");
    assert.equal(config.profiles[profileName].idempotencyKey, keys[0]);
    assert.equal(config.profiles.other.apiKey, "smx_mbx_other");
  });

  test("Windows bounds persistent OAuth reservation replacement denial before HTTP", {
    timeout: 20_000,
  }, async (t) => {
    const state = await fixture(t);
    const originalConfig = await seedExpiredOAuthProfile(t, state);
    const requestsBefore = state.requests.length;
    const filesystemFault = profileFilesystemFault(state, "oauth-reservation-persistent", {
      candidate: {
        accessToken: "native_access_0",
        profileName: "native",
        state: "refreshing",
      },
      code: "EPERM",
      failures: 1_000,
      operation: "rename",
      path: state.configPath,
    });
    const result = await cli(
      t,
      state,
      ["management:get-connection", "--profile", "native", "--json"],
      false,
      { filesystemFault, timeoutMs: 15_000 },
    );
    const receipt = await readFaultReceipt(filesystemFault);
    const boundaryElapsedMs = result.closedAtMs - receipt.first_injected_at_ms;

    assert.notEqual(result.code, 0, "persistent reservation denial unexpectedly succeeded");
    assert.equal(result.timedOut, false, "reservation denial exceeded the CLI test deadline");
    assert.ok(receipt.injected > 1, "persistent reservation denial was not retried");
    assert.equal(
      receipt.succeeded,
      0,
      "persistent reservation denial unexpectedly replaced config",
    );
    assert.equal(state.requests.length, requestsBefore, "reservation denial reached the network");
    assert.equal(await readFile(state.configPath, "utf8"), originalConfig);
    assert.ok(
      boundaryElapsedMs >= 0 && boundaryElapsedMs < 5_000,
      `persistent reservation denial escaped its replacement budget: ${boundaryElapsedMs}ms`,
    );
  });

  test("Windows denies agent registration when intent-lock access stays obstructed", {
    timeout: 20_000,
  }, async (t) => {
    const state = await fixture(t);
    await mkdir(dirname(state.configPath), { mode: 0o700, recursive: true });
    const originalConfig = `${JSON.stringify({
      defaultProfile: "other",
      profiles: { other: { apiKey: "smx_mbx_other", type: "api_key" } },
    }, null, 2)}\n`;
    await writeFile(state.configPath, originalConfig);
    const profileName = "profile-fs-agent-denied";
    const intentLockPath = join(
      dirname(state.configPath),
      `agent-registration-${createHash("sha256").update(profileName).digest("hex")}.json.lock`,
    );
    const filesystemFault = profileFilesystemFault(state, "agent-intent-lock-persistent", {
      code: "EPERM",
      failures: 1_000,
      openFlags: "wx",
      operation: "open",
      path: intentLockPath,
    });
    const result = await cli(
      t,
      state,
      [
        "agent:register",
        profileName,
        "--base-url",
        state.issuer,
        "--mailbox-local-part",
        profileName,
        "--json",
      ],
      false,
      { filesystemFault, timeoutMs: 15_000 },
    );
    const receipt = await readFaultReceipt(filesystemFault);
    const boundaryElapsedMs = result.closedAtMs - receipt.first_injected_at_ms;

    assert.notEqual(result.code, 0, "persistent intent-lock denial unexpectedly succeeded");
    assert.equal(result.timedOut, false, "intent-lock denial exceeded the CLI test deadline");
    assert.ok(receipt.injected > 1, "persistent intent-lock denial was not retried");
    assert.equal(
      receipt.exclusive_open_succeeded,
      0,
      "intent-lock ownership was granted after persistent denial",
    );
    assert.equal(
      state.agentRegistrations.length,
      0,
      "registration POST occurred without intent-lock ownership",
    );
    assert.equal(await readFile(state.configPath, "utf8"), originalConfig);
    await assert.rejects(access(intentLockPath), { code: "ENOENT" });
    assert.ok(
      boundaryElapsedMs >= 8_000 && boundaryElapsedMs < 15_000,
      `persistent intent-lock denial escaped its acquisition budget: ${boundaryElapsedMs}ms`,
    );
  });

  test("Windows never replays a spent OAuth token after persistent post-token replacement denial", {
    timeout: 20_000,
  }, async (t) => {
    const state = await fixture(t);
    await seedExpiredOAuthProfile(t, state);
    const filesystemFault = profileFilesystemFault(state, "oauth-rotated-persistence-persistent", {
      candidate: {
        accessToken: "native_access_1",
        profileName: "native",
        state: "active",
      },
      code: "EACCES",
      failures: 1_000,
      operation: "rename",
      path: state.configPath,
    });
    const first = await cli(
      t,
      state,
      ["management:get-connection", "--profile", "native", "--json"],
      false,
      { filesystemFault, timeoutMs: 15_000 },
    );
    const receipt = await readFaultReceipt(filesystemFault);
    const second = await cli(
      t,
      state,
      ["management:get-connection", "--profile", "native", "--json"],
      false,
      { timeoutMs: 15_000 },
    );

    assert.notEqual(first.code, 0, "persistent post-token denial unexpectedly succeeded");
    assert.equal(first.timedOut, false, "post-token denial exceeded the CLI test deadline");
    assert.notEqual(second.code, 0, "a spent refresh token remained eligible for replay");
    assert.equal(second.timedOut, false, "post-denial invocation exceeded the CLI test deadline");
    assert.ok(receipt.injected > 1, "persistent post-token denial was not retried");
    assert.equal(
      receipt.succeeded,
      0,
      "persistent post-token denial unexpectedly persisted rotated tokens",
    );
    assert.equal(state.refreshes, 1, "the spent refresh token was replayed");
    assert.equal(
      state.requests.filter(
        (request) => request.path === "/oauth/token" && request.body.includes("grant_type=refresh_token"),
      ).length,
      1,
    );
    assert.equal(
      state.requests.filter((request) => request.path === "/api/v1/me").length,
      0,
    );
    assert.equal(
      JSON.parse(await readFile(state.configPath, "utf8")).profiles.native.state,
      "reauthorize",
    );
  });
}

test("profile lock acquisition applies one deadline across missing names and Windows access denial", {
  timeout: 20_000,
}, async (t) => {
  const state = await fixture(t);
  await mkdir(dirname(state.configPath), { mode: 0o700, recursive: true });
  const originalConfig = `${JSON.stringify({
    defaultProfile: "other",
    profiles: { other: { apiKey: "smx_mbx_other", type: "api_key" } },
  }, null, 2)}\n`;
  await writeFile(state.configPath, originalConfig);
  const profileName = "profile-fs-agent-alternating";
  const intentLockPath = join(
    dirname(state.configPath),
    `agent-registration-${createHash("sha256").update(profileName).digest("hex")}.json.lock`,
  );
  const filesystemFault = profileFilesystemFault(state, "agent-intent-lock-deadline", {
    codes: process.platform === "win32" ? ["EEXIST", "EACCES"] : ["EEXIST"],
    failures: Number.MAX_SAFE_INTEGER,
    openFlags: "wx",
    operation: "open",
    path: intentLockPath,
  });
  const result = await cli(
    t,
    state,
    [
      "agent:register",
      profileName,
      "--base-url",
      state.issuer,
      "--mailbox-local-part",
      profileName,
      "--json",
    ],
    false,
    { filesystemFault, timeoutMs: 15_000 },
  );
  const receipt = await readFaultReceipt(filesystemFault);
  const boundaryElapsedMs = result.closedAtMs - receipt.first_injected_at_ms;

  assert.notEqual(result.code, 0, "lock failures unexpectedly granted ownership");
  assert.equal(result.timedOut, false, "lock failures bypassed the runtime deadline");
  assert.ok(receipt.injected_by_code.EEXIST > 0, "contention was not injected");
  if (process.platform === "win32") {
    assert.ok(receipt.injected_by_code.EACCES > 0, "access denial was not injected");
  }
  assert.ok(
    receipt.injected < filesystemFault.failures,
    "lock failures exhausted before the deadline",
  );
  assert.equal(receipt.exclusive_open_succeeded, 0, "lock failures granted ownership");
  assert.equal(state.agentRegistrations.length, 0, "lock failures reached registration POST");
  assert.equal(await readFile(state.configPath, "utf8"), originalConfig);
  assert.ok(
    boundaryElapsedMs >= 8_000 && boundaryElapsedMs < 15_000,
    `lock failures escaped the shared acquisition deadline: ${boundaryElapsedMs}ms`,
  );
});

test("non-retry profile filesystem errors fail at the selected boundary without network progress", async (t) => {
  const state = await fixture(t);
  const originalConfig = await seedExpiredOAuthProfile(t, state);
  const cases = [
    { code: "ENOSPC", label: "nonretry-enospc" },
    ...(process.platform === "win32"
      ? []
      : ["EPERM", "EACCES", "EBUSY"].map((code) => ({
          code,
          label: `posix-${code.toLowerCase()}`,
        }))),
  ];

  for (const selected of cases) {
    const requestsBefore = state.requests.length;
    const filesystemFault = profileFilesystemFault(state, selected.label, {
      candidate: {
        accessToken: "native_access_0",
        profileName: "native",
        state: "refreshing",
      },
      code: selected.code,
      operation: "rename",
      path: state.configPath,
    });
    const result = await cli(
      t,
      state,
      ["management:get-connection", "--profile", "native", "--json"],
      false,
      { filesystemFault },
    );
    assert.notEqual(result.code, 0, `${selected.code} unexpectedly retried`);
    assert.equal(state.requests.length, requestsBefore, `${selected.code} reached the network`);
    assert.equal(await readFile(state.configPath, "utf8"), originalConfig);
    const receipt = await readFaultReceipt(filesystemFault);
    assert.equal(receipt.code, selected.code);
    assert.equal(receipt.injected, 1);
    assert.equal(receipt.matched, 1, `${selected.code} was retried`);
    assert.equal(receipt.succeeded, 0);
    const boundaryElapsedMs = result.closedAtMs - receipt.first_injected_at_ms;
    assert.ok(
      boundaryElapsedMs >= 0 && boundaryElapsedMs < 2_000,
      `${selected.code} did not fail within the immediate boundary tolerance: ${boundaryElapsedMs}ms`,
    );
    console.log(JSON.stringify({
      boundary_elapsed_ms: boundaryElapsedMs,
      code: selected.code,
      profile_filesystem_fault: "immediate_failure",
    }));
  }
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
