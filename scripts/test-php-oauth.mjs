import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const connection = {
  ok: true,
  data: {
    team: { id: "team_test", name: "Test team" },
    credential: { id: "grant_test", type: "oauth", name: null },
    label: "Test team", permissions: [], mailboxes: [],
  },
  meta: { request_id: "req_test" },
};

async function runPhp(source, env) {
  const result = exec("php", [], { env: { ...process.env, ...env }, timeout: 10_000 });
  result.child.stdin.end(`<?php\nrequire 'vendor/autoload.php';\n${source}`);
  return result;
}

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}/api/v1`);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    assert.equal(server.listening, false);
  }
}

for (const [surface, api, operation, path] of [
  ["Sending", "MetaApi", "sendingGetConnection", "/api/v1/me"],
  ["Mailbox", "MailboxAPIApi", "mailboxGetConnection", "/api/v1/mailbox/connection"],
  ["Management", "ConnectionApi", "managementGetConnection", "/api/v1/me"],
]) {
  for (const mode of ["static", "provider"]) {
    test(`PHP ${surface} ${mode} token authenticates sync and async requests`, async () => {
      const requests = [];
      await withServer((request, response) => {
        requests.push([request.method, request.url, request.headers.authorization]);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(connection));
      }, async (baseUrl) => {
        const { stdout } = await runPhp(`
          $calls = 0;
          $token = getenv('TOKEN_MODE') === 'static' ? 'test.token+/_~==' : function () use (&$calls): string {
              return 'test.token.' . ++$calls;
          };
          $client = Sendmux\\${surface}\\ClientFactory::create${api}WithAccessToken($token, getenv('API_URL'));
          echo $client->${operation}()->getData()->getTeam()->getId(), "\\n";
          echo $client->${operation}Async()->wait()->getData()->getTeam()->getId(), "\\n";
          echo $calls;
        `, { API_URL: baseUrl, TOKEN_MODE: mode });
        assert.equal(stdout, `team_test\nteam_test\n${mode === "provider" ? 2 : 0}`);
        assert.deepEqual(requests, [1, 2].map((n) => [
          "GET", path, `Bearer ${mode === "provider" ? `test.token.${n}` : "test.token+/_~=="}`,
        ]));
      });
    });
  }
}

test("PHP token provider renews on retry and preserves request identity", async () => {
  const tokens = [];
  await withServer((request, response) => {
    tokens.push(request.headers.authorization);
    response.setHeader("Content-Type", "application/json");
    if (tokens.length === 1) {
      response.writeHead(503, { "Retry-After": "0" });
      response.end(JSON.stringify({ ok: false, error: { retryable: true } }));
    } else response.end(JSON.stringify(connection));
  }, async (baseUrl) => {
    const { stdout } = await runPhp(`
      $calls = 0;
      $client = Sendmux\\Sending\\ClientFactory::createMetaApiWithAccessToken(
          function () use (&$calls): string { return 'test.token.' . ++$calls; }, getenv('API_URL')
      );
      echo $client->sendingGetConnection()->getData()->getTeam()->getId();
    `, { API_URL: baseUrl });
    assert.equal(stdout, "team_test");
    assert.deepEqual(tokens, ["Bearer test.token.1", "Bearer test.token.2"]);
  });
});

test("PHP OAuth refuses redirects without disclosing tokens to the target", async () => {
  let targetCalls = 0;
  await withServer((request, response) => {
    targetCalls++;
    response.end(JSON.stringify(connection));
  }, async (targetUrl) => {
    await withServer((request, response) => {
      response.writeHead(302, { Location: targetUrl });
      response.end();
    }, async (baseUrl) => {
      const { stdout } = await runPhp(`
        $client = Sendmux\\Sending\\ClientFactory::createMetaApiWithAccessToken('test.token', getenv('API_URL'));
        try { $client->sendingGetConnection(); }
        catch (Sendmux\\Sending\\ApiException $error) { echo $error->getCode(); }
      `, { API_URL: baseUrl });
      assert.equal(stdout, "302");
      assert.equal(targetCalls, 0);
    });
  });
});

for (const mode of ["static", "provider"]) {
  test(`PHP rejects invalid ${mode} tokens before HTTP without exposing the value`, async () => {
    let calls = 0;
    await withServer((request, response) => {
      calls++;
      response.end(JSON.stringify(connection));
    }, async (baseUrl) => {
      const { stdout } = await runPhp(`
        $results = [];
        foreach (['', "private token", "private\\r\\nInjected: true", "private\\0token", 'private=token'] as $token) {
            try {
                $credential = getenv('TOKEN_MODE') === 'static' ? $token : static fn () => $token;
                $client = Sendmux\\Sending\\ClientFactory::createMetaApiWithAccessToken($credential, getenv('API_URL'));
                $client->sendingGetConnection();
                $results[] = 'accepted';
            } catch (InvalidArgumentException $error) {
                $results[] = $error->getMessage();
            }
        }
        echo json_encode($results);
      `, { API_URL: baseUrl, TOKEN_MODE: mode });
      assert.deepEqual(JSON.parse(stdout), Array(5).fill("Access token must be a non-empty RFC 6750 bearer token"));
      assert.equal(calls, 0);
    });
  });
}
