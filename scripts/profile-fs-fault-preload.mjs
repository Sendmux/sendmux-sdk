import filesystem from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";

const specification = JSON.parse(process.env.SENDMUX_TEST_PROFILE_FS_FAULT ?? "null");

if (specification) {
  const original = filesystem[specification.operation];
  if (typeof original !== "function") {
    throw new Error(`Unsupported profile filesystem fault operation: ${specification.operation}`);
  }

  const receipt = {
    code: specification.code,
    first_injected_at_ms: null,
    injected: 0,
    matched: 0,
    native_errors: 0,
    operation: specification.operation,
    pid: process.pid,
    succeeded: 0,
  };
  const persistReceipt = () => {
    writeFileSync(specification.receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
      mode: 0o600,
    });
  };

  filesystem[specification.operation] = async (...args) => {
    if (!(await matches(args))) return original(...args);

    receipt.matched += 1;
    if (receipt.injected < specification.failures) {
      receipt.injected += 1;
      receipt.first_injected_at_ms ??= Date.now();
      persistReceipt();
      const error = new Error(
        `${specification.code}: injected ${specification.operation} denial at the profile filesystem boundary`,
      );
      error.code = specification.code;
      error.syscall = specification.operation;
      error.path = String(args[0]);
      if (specification.operation === "rename") error.dest = String(args[1]);
      throw error;
    }

    try {
      const result = await original(...args);
      receipt.succeeded += 1;
      persistReceipt();
      return result;
    } catch (error) {
      receipt.native_errors += 1;
      receipt.last_native_error_code = error?.code ?? null;
      persistReceipt();
      throw error;
    }
  };

  syncBuiltinESMExports();

  async function matches(args) {
    const selectedPath = String(
      specification.operation === "rename" ? args[1] : args[0],
    );
    if (selectedPath !== specification.path) return false;
    if (!specification.candidate) return true;

    try {
      const candidate = JSON.parse(await filesystem.readFile(args[0], "utf8"));
      const profile = candidate.profiles?.[specification.candidate.profileName];
      return Object.entries(specification.candidate).every(([key, value]) =>
        key === "profileName" ? true : profile?.[key] === value,
      );
    } catch {
      return false;
    }
  }
}
