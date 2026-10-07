import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";

function runImport(command, args, env = process.env) {
  const result = spawnSync(command, args, { encoding: "utf8", env, timeout: 30_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("PHP preserves the old folder-delete model class for existing callers", () => {
  runImport("php", ["-r", String.raw`
require 'vendor/autoload.php';
$data = new Sendmux\Mailbox\Model\MailboxFolderDeletedResponseAllOfData(['deleted' => true, 'id' => 'fld_compat']);
if (!$data instanceof Sendmux\Mailbox\Model\MailboxDraftDeleteResponseAllOfData) throw new RuntimeException('Old model has a different type');
$response = new Sendmux\Mailbox\Model\MailboxFolderDeletedResponse(['data' => $data]);
if ($response->getData() !== $data || json_decode(json_encode($data), true) !== ['deleted' => true, 'id' => 'fld_compat']) throw new RuntimeException('Old model no longer round-trips');
`]);
});

test("Python preserves root and models imports of the old folder-delete model", () => {
  runImport(".tmp/python-venv/bin/python", ["-c", String.raw`
import warnings
with warnings.catch_warnings(record=True) as captured:
    warnings.simplefilter('always', DeprecationWarning)
    from sendmux_mailbox import MailboxFolderDeletedResponseAllOfData
    from sendmux_mailbox.models import MailboxFolderDeletedResponseAllOfData as ModelsAlias
from sendmux_mailbox import MailboxDraftDeleteResponseAllOfData, MailboxFolderDeletedResponse
assert MailboxFolderDeletedResponseAllOfData is ModelsAlias is MailboxDraftDeleteResponseAllOfData
assert any(issubclass(item.category, DeprecationWarning) for item in captured)
data = MailboxFolderDeletedResponseAllOfData.from_dict({'deleted': True, 'id': 'fld_compat'})
assert data.to_dict() == {'deleted': True, 'id': 'fld_compat'}
assert MailboxFolderDeletedResponse.model_fields['data'].annotation is type(data)
`], { ...process.env, PYTHONPATH: "packages/python/mailbox" });
});

test("Ruby preserves the old folder-delete model constant for existing callers", () => {
  const hasRbenv = existsSync(`${process.env.HOME}/.rbenv/bin/rbenv`) || existsSync("/opt/homebrew/bin/rbenv");
  runImport(hasRbenv ? "rbenv" : "bundle", [...(hasRbenv ? ["exec", "bundle", "exec"] : ["exec"]), "ruby", "-e", String.raw`
require 'sendmux/mailbox'
Warning[:deprecated] = true
models = Sendmux::Mailbox::Generated
legacy = models::MailboxFolderDeletedResponseAllOfData
raise 'Old model has a different type' unless legacy.equal?(models::MailboxDraftDeleteResponseAllOfData)
data = legacy.build_from_hash(deleted: true, id: 'fld_compat')
raise 'Old model no longer round-trips' unless data.to_hash == { deleted: true, id: 'fld_compat' }
raise 'Response field changed type' unless models::MailboxFolderDeletedResponse.openapi_types[:data].to_s == data.class.name.split('::').last
`]);
});

test("Python preserves the deprecated folder-delete model deep import", () => {
  runImport(".tmp/python-venv/bin/python", ["-c", String.raw`
import warnings
with warnings.catch_warnings(record=True) as captured:
    warnings.simplefilter('always', DeprecationWarning)
    from sendmux_mailbox.models.mailbox_folder_deleted_response_all_of_data import MailboxFolderDeletedResponseAllOfData
from sendmux_mailbox import MailboxDraftDeleteResponseAllOfData
assert MailboxFolderDeletedResponseAllOfData is MailboxDraftDeleteResponseAllOfData
assert any(issubclass(item.category, DeprecationWarning) for item in captured)
assert MailboxFolderDeletedResponseAllOfData.from_dict({'deleted': True, 'id': 'fld_compat'}).to_dict() == {'deleted': True, 'id': 'fld_compat'}
`], { ...process.env, PYTHONPATH: "packages/python/mailbox" });
});
