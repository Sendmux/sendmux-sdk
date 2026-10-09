from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]


def replace(path: Path, before: str, after: str) -> None:
    source = path.read_text()
    assert source.count(before) == 1, f"Expected one mutation target: {path}"
    path.write_text(source.replace(before, after))


mode = sys.argv[1]
if mode == "validation":
    replace(root / "packages/python/mcp/sendmux_mcp/server.py", "validate_output=True,", "validate_output=False,")
    replace(root / "packages/python/mcp/sendmux_mcp/server.py", "middleware: list[Middleware] = [StructuredOutputValidationMiddleware()]", "middleware: list[Middleware] = []")
elif mode == "permission":
    replace(root / "packages/python/mcp/sendmux_mcp/permissions.py", '"mailbox_get_sender_choices": ("email.send",),', '"mailbox_get_sender_choices": (),')
elif mode == "drop-choices":
    path = root / "packages/ts/mailbox/src/generated/sdk.gen.ts"
    source = path.read_text()
    start = source.index("export const mailboxGetSenderChoices =")
    end = source.index("});", start) + 2
    replace(path, source[start:end], source[start:end] + ".then((response) => { if (response.data) Reflect.deleteProperty(response.data.data, 'reply_to'); return response; })")
elif mode == "rust-drop-choices":
    replace(root / "rust/src/mailbox.rs", '        self.transport.get_json(path).await\n', '        self.transport.get_json(path).await.map(|mut response: Response<serde_json::Value>| { response.data.as_object_mut().unwrap().remove("reply_to"); response })\n')
else:
    raise AssertionError(f"Unknown mutation: {mode}")
