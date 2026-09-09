import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  access,
  mkdtemp,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "sendmux-native-oauth-"));
  const state = {
    directory,
    requests: [],
    registrations: [],
    authorization: null,
    refreshes: 0,
    revoked: [],
    mode: "normal",
    authorizationLifetime: 900,
    refreshDelay: 0,
  };
  state.configPath = join(directory, ".config", "sendmux", "config.json");
  const server = createServer(async (req, res) => {
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
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    assert.equal(server.listening, false);
    await rm(directory, { recursive: true, force: true });
    await assert.rejects(access(directory), { code: "ENOENT" });
  });
  return state;
}

async function cli(t, state, args, authorize = false) {
  const child = spawn(
    process.execPath,
    [
      ...(state.preload ? ["--import", state.preload] : []),
      "packages/ts/cli/bin/run.js",
      ...args,
    ],
    {
      env: {
        ...process.env,
        HOME: state.directory,
        XDG_CONFIG_HOME: join(state.directory, ".config"),
        SENDMUX_API_KEY: "",
        SENDMUX_ACCESS_TOKEN: "",
        SENDMUX_PROFILE: "",
        SENDMUX_BASE_URL: `${state.issuer}/api/v1`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "",
    resolveUrl;
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
  const closed = once(child, "close");
  closed.then(() => resolveUrl(null));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null)
      child.kill("SIGTERM");
    await closed;
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
      const callback = redirect.headers.get("location");
      assert.ok(callback);
      if (typeof authorize === "function") await authorize(callback);
      const result = await fetch(callback, {
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(result.status, 200);
    }
  }
  const [code] = await closed;
  return { code, stdout, stderr };
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

test("native login uses S256, validates the callback and saves a protected profile without exposing tokens", async (t) => {
  const state = await fixture(t);
  const result = await login(t, state, async (callback) => {
    const wrong = new URL(callback);
    wrong.searchParams.set("state", "wrong");
    assert.equal((await fetch(wrong)).status, 400);
    const wrongIssuer = new URL(callback);
    wrongIssuer.searchParams.set("iss", "https://untrusted.example");
    assert.equal((await fetch(wrongIssuer)).status, 400);
  });
  assert.equal(result.code, 0, result.stderr);
  const config = JSON.parse(await readFile(state.configPath, "utf8"));
  assert.equal(config.profiles.native.type, "oauth");
  assert.equal(config.profiles.native.accessToken, "native_access_0");
  assert.equal(config.profiles.native.refreshToken, "native_refresh_0");
  assert.equal((await stat(state.configPath)).mode & 0o777, 0o600);
  assert.equal(
    (await stat(join(state.directory, ".config", "sendmux"))).mode & 0o777,
    0o700,
  );
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
  const result = await login(t, state, "terminate");
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
