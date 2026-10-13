from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
mode = sys.argv[1]


def replace(path: Path, before: str, after: str) -> None:
    source = path.read_text()
    assert source.count(before) == 1, f"Expected one mutation target: {path}"
    path.write_text(source.replace(before, after))


if mode == "validation":
    replace(root / "packages/python/mcp/sendmux_mcp/server.py", "validate_output=True,", "validate_output=False,")
    replace(root / "packages/python/mcp/sendmux_mcp/server.py", "middleware: list[Middleware] = [StructuredOutputValidationMiddleware()]", "middleware: list[Middleware] = []")
elif mode == "drop-limit":
    path = root / "packages/ts/mailbox/src/generated/sdk.gen.ts"
    source = path.read_text()
    start = source.index("export const mailboxGetSession =")
    end = source.index("});", start) + 2
    replace(path, source[start:end], source[start:end] + ".then((response) => { if (response.data) Reflect.deleteProperty(response.data.data.limits, 'draft_schedule_days_max'); return response; })")
elif mode == "php-required":
    replace(root / "packages/php/mailbox/src/Model/MailboxSessionLimits.php", "        if ($this->container['draft_schedule_days_max'] === null) {\n            $invalidProperties[] = \"'draft_schedule_days_max' can't be null\";\n        }\n", "")
else:
    raise AssertionError(f"Unknown mutation: {mode}")
