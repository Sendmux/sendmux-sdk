import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const composer = existsSync(join(root, "composer.phar")) ? "php composer.phar" : "composer";
const packages = ["core", "sending", "mailbox", "management", "sdk"];

checkGeneratedClientCorrections();
checkGeneratedMailboxBodyParamOrder();
checkGeneratedSendingBinaryUploadContentLength();

runShell(`${composer} install --no-interaction --no-progress`);

for (const name of packages) {
  runShell(`${composer} validate --strict packages/php/${name}/composer.json`);
}

runShell("find packages/php -name '*.php' -print0 | xargs -0 -n 1 php -l");
runShell("vendor/bin/phpcs -d memory_limit=512M --standard=phpcs.xml");
runShell("vendor/bin/phpstan analyse --configuration=phpstan.neon --level=max --memory-limit=1G");
runShell("vendor/bin/phpunit --configuration phpunit.xml.dist");

function runShell(command) {
  const result = spawnSync(command, {
    cwd: root,
    encoding: "utf8",
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed with exit code ${result.status}`);
  }
}

function checkGeneratedClientCorrections() {
  const apiRoot = join(root, "packages", "php");
  for (const filePath of listPhpApiFiles(apiRoot)) {
    const source = readFileSync(filePath, "utf8");

    if (source.includes("$response = $exception->getResponse();")) {
      throw new Error(`Generated PHP async handler assumes an exception response: ${filePath}`);
    }

    const conditionalOperationCount = countMatches(source, "$headerParams['If-None-Match']");
    if (conditionalOperationCount === 0) {
      continue;
    }

    const syncNotModifiedCount = countMatches(source, "case 304:");
    const asyncNotModifiedCount = countMatches(source, "$response->getStatusCode() === 304");
    if (syncNotModifiedCount < conditionalOperationCount || asyncNotModifiedCount < conditionalOperationCount) {
      throw new Error(`Generated PHP conditional GET lacks 304 handling: ${filePath}`);
    }
  }
}

function checkGeneratedMailboxBodyParamOrder() {
  const filePath = join(root, "packages", "php", "mailbox", "src", "Api", "MailboxAPIApi.php");
  const source = readFileSync(filePath, "utf8");
  const operations = [
    {
      method: "mailboxBatchDeleteMessages",
      bodyParam: "$batch_delete_mailbox_messages_body",
    },
    {
      method: "mailboxBatchDeleteMessagesWithHttpInfo",
      bodyParam: "$batch_delete_mailbox_messages_body",
    },
    {
      method: "mailboxBatchDeleteMessagesAsync",
      bodyParam: "$batch_delete_mailbox_messages_body",
    },
    {
      method: "mailboxBatchDeleteMessagesAsyncWithHttpInfo",
      bodyParam: "$batch_delete_mailbox_messages_body",
    },
    {
      method: "mailboxBatchDeleteMessagesRequest",
      bodyParam: "$batch_delete_mailbox_messages_body",
    },
    {
      method: "mailboxBatchUpdateMessages",
      bodyParam: "$batch_update_mailbox_messages_body",
    },
    {
      method: "mailboxBatchUpdateMessagesWithHttpInfo",
      bodyParam: "$batch_update_mailbox_messages_body",
    },
    {
      method: "mailboxBatchUpdateMessagesAsync",
      bodyParam: "$batch_update_mailbox_messages_body",
    },
    {
      method: "mailboxBatchUpdateMessagesAsyncWithHttpInfo",
      bodyParam: "$batch_update_mailbox_messages_body",
    },
    {
      method: "mailboxBatchUpdateMessagesRequest",
      bodyParam: "$batch_update_mailbox_messages_body",
    },
  ];

  for (const operation of operations) {
    assertOrder({
      source,
      filePath,
      anchor: `function ${operation.method}(`,
      first: operation.bodyParam,
      second: "$mailbox_id",
    });
  }
}

function checkGeneratedSendingBinaryUploadContentLength() {
  const filePath = join(root, "packages", "php", "sending", "src", "Api", "AttachmentsApi.php");
  const source = readFileSync(filePath, "utf8");
  for (const operation of [
    "sendingCompleteAttachmentUpload",
    "sendingUploadAttachment",
  ]) {
    const requestMethod = source.match(new RegExp(`function ${operation}Request\\([\\s\\S]*?\\n    \\}`))?.[0];
    if (!requestMethod) {
      throw new Error(`Generated PHP method ${operation}Request is missing in ${filePath}`);
    }
    if (!requestMethod.includes("$content_length")) {
      throw new Error(`Generated PHP method ${operation}Request must accept required $content_length in ${filePath}`);
    }
    if (!requestMethod.includes("$headerParams['Content-Length']")) {
      throw new Error(`Generated PHP method ${operation}Request must send Content-Length in ${filePath}`);
    }
  }
}

function listPhpApiFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listPhpApiFiles(path);
    }
    return entry.isFile() && path.includes("/src/Api/") && entry.name.endsWith(".php") ? [path] : [];
  });
}

function countMatches(source, needle) {
  return source.split(needle).length - 1;
}

function assertOrder({ source, filePath, anchor, first, second }) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex === -1) {
    throw new Error(`Missing generated PHP method ${anchor} in ${filePath}`);
  }

  const firstIndex = source.indexOf(first, anchorIndex);
  const secondIndex = source.indexOf(second, anchorIndex);
  if (firstIndex === -1 || secondIndex === -1) {
    throw new Error(`Generated PHP method ${anchor} is missing ${first} or ${second} in ${filePath}`);
  }
  if (secondIndex < firstIndex) {
    throw new Error(`Generated PHP method ${anchor} places ${second} before ${first} in ${filePath}`);
  }
}
