import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const composer = existsSync(join(root, "composer.phar")) ? "php composer.phar" : "composer";
const packages = ["core", "sending", "mailbox", "management", "sdk"];

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
