import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./ci-consumers.mjs";

assert.equal(process.platform, "win32", "Job accounting observation requires actual Windows");
const scripts = dirname(fileURLToPath(import.meta.url));
const temp = resolve(scripts, "../.tmp");
const evidence = resolve(process.argv[2] ?? join(temp, "windows-job-accounting"));
assert(!existsSync(evidence), "Preserve prior observation evidence");
mkdirSync(evidence, { recursive: true });
console.log(JSON.stringify({ evidence, owner_pid: process.pid }));

// Diagnostic-only additions to owned copies. The real classification is stored
// before any observation; no query result changes termination or its grace.
const nativeObservation = `
    public class MemberObservation {
        public long pid;
        public uint wait, exit_code;
        public int open_error, wait_error, exit_error, image_error, close_error;
        public string image;
    }
    public class JobObservation {
        public uint assigned, listed;
        public int query_error;
        public long started, finished;
        public MemberObservation[] members;
    }
    [DllImport("kernel32.dll", EntryPoint="QueryInformationJobObject", SetLastError=true)]
    static extern bool QueryIds(IntPtr job, int kind, IntPtr info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool GetExitCodeProcess(IntPtr handle, out uint code);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, System.Text.StringBuilder name, ref uint size);
    public static JobObservation Observe(IntPtr job) {
        JobObservation result = new JobObservation();
        result.started = System.Diagnostics.Stopwatch.GetTimestamp();
        // Native layout: two DWORDs, then ULONG_PTR IDs. A partial list/error is
        // retained, not retried or interpreted as process absence.
        int size = 8 + 64 * IntPtr.Size;
        IntPtr buffer = Marshal.AllocHGlobal(size);
        try {
            for (int offset = 0; offset < size; offset += 4) Marshal.WriteInt32(buffer, offset, 0);
            if (!QueryIds(job, 3, buffer, (uint)size, IntPtr.Zero)) result.query_error = Marshal.GetLastWin32Error();
            result.assigned = (uint)Marshal.ReadInt32(buffer, 0);
            result.listed = (uint)Marshal.ReadInt32(buffer, 4);
            int count = (int)Math.Min(result.listed, 64u);
            result.members = new MemberObservation[count];
            for (int index = 0; index < count; index++) {
                MemberObservation member = new MemberObservation();
                result.members[index] = member;
                member.pid = Marshal.ReadIntPtr(buffer, 8 + index * IntPtr.Size).ToInt64();
                IntPtr process = OpenProcess(0x101000, false, (uint)member.pid); // SYNCHRONIZE | QUERY_LIMITED_INFORMATION
                if (process == IntPtr.Zero) { member.open_error = Marshal.GetLastWin32Error(); continue; }
                try {
                    member.wait = WaitForSingleObject(process, 0);
                    if (member.wait == 0xffffffff) member.wait_error = Marshal.GetLastWin32Error();
                    if (!GetExitCodeProcess(process, out member.exit_code)) member.exit_error = Marshal.GetLastWin32Error();
                    uint length = 32768;
                    System.Text.StringBuilder image = new System.Text.StringBuilder((int)length);
                    if (QueryFullProcessImageName(process, 0, image, ref length)) member.image = System.IO.Path.GetFileName(image.ToString());
                    else member.image_error = Marshal.GetLastWin32Error();
                } finally { if (!CloseHandle(process)) member.close_error = Marshal.GetLastWin32Error(); }
            }
        } finally { Marshal.FreeHGlobal(buffer); }
        result.finished = System.Diagnostics.Stopwatch.GetTimestamp();
        return result;
    }
`;

const files = ["ci-consumers.mjs", "windows-consumer-owner.mjs", "windows-consumer-command.mjs", "windows-consumer-job.ps1", "diagnose-windows-consumer-ownership.mjs"];
const results = [];
for (let iteration = 0; iteration < 4; iteration++) {
  for (const control of ["healthy", "lost-stdout"]) {
    const directory = mkdtempSync(join(temp, "windows-job-observation-"));
    const record = { iteration, control, directory };
    results.push(record);
    console.log(JSON.stringify({ workspace: directory, owner_pid: process.pid, iteration, control }));
    let cleanupConfirmed = false;
    try {
      for (const file of files) copyFileSync(join(scripts, file), join(directory, file));
      const replaceOnce = (file, from, to) => {
        const original = readFileSync(file, "utf8");
        assert.equal(original.split(from).length, 2, "Observation insertion must match exactly once");
        writeFileSync(file, original.replace(from, to));
      };
      const observations = join(evidence, `${iteration}-${control}.jsonl`);
      const owner = join(directory, "windows-consumer-job.ps1");
      replaceOnce(owner, "public static class ConsumerJob {", `public static class ConsumerJob {${nativeObservation}`);
      replaceOnce(owner, "    $orphan = !$interrupted -and ([ConsumerJob]::Active($job) -gt 0)", `
    $decisionActive = $null
    if (!$interrupted) { $decisionActive = [ConsumerJob]::Active($job) }
    $orphan = !$interrupted -and ($decisionActive -gt 0)
    $observation = @{ job = $config.job; controller = $PID; bootstrap = $bootstrap.Id
        interrupted = $interrupted; original_orphan = $orphan; decision_active = $decisionActive
        utc = [DateTime]::UtcNow.ToString('o'); ticks = [Diagnostics.Stopwatch]::GetTimestamp() }
    try {
        $observation.bootstrap_has_exited = $bootstrap.HasExited
        $observation.bootstrap_wait = [ConsumerJob]::WaitForSingleObject($bootstrap.Handle, 0)
        $observation.snapshot = [ConsumerJob]::Observe($job)
        $observation.active_after = [ConsumerJob]::Active($job)
        $observation.bootstrap_wait_after = [ConsumerJob]::WaitForSingleObject($bootstrap.Handle, 0)
    } catch { $observation.observer_error_type = $_.Exception.GetType().FullName }
    [IO.File]::AppendAllText('${observations.replaceAll("'", "''")}', ($observation | ConvertTo-Json -Depth 8 -Compress) + [Environment]::NewLine)
`);
      if (control === "lost-stdout") {
        replaceOnce(join(directory, "windows-consumer-command.mjs"), 'stdio: "inherit"', 'stdio: ["ignore", "ignore", "inherit"]');
      }
      const diagnosticEvidence = join(directory, "evidence");
      try {
        await run(process.execPath, [join(directory, "diagnose-windows-consumer-ownership.mjs"), diagnosticEvidence]);
        record.command = "success";
      } catch (error) { record.command = "failure"; record.error = error.message; }
      record.rows = JSON.parse(readFileSync(join(diagnosticEvidence, "results.json"), "utf8"));
      writeFileSync(join(evidence, "results.json"), JSON.stringify(results, null, 2));
      assert.equal(record.rows.length, 3);
      assert(record.rows.every((row) => row.paths_absent && !row.cleanup_error), "Do not discard unconfirmed fixture ownership");
      assert(record.rows.slice(1).every((row) => row.verdict === "passed"), "Preserve original orphan/deadline controls");
      // Failures remain failures in the receipt. This is evidence collection,
      // not a replacement for the unchanged diagnostic/sensitivity assertions.
      assert(existsSync(observations), "Controller observation receipt must exist");
      assert.equal(readFileSync(observations, "utf8").trim().split(/\r?\n/).map(JSON.parse).length, 3);
      if (record.error) assert.match(record.error, /exit 1, interrupted=false|Command left an owned descendant; Windows Job terminated/, "Retain copies after uncertain outer ownership");
      cleanupConfirmed = true;
    } finally {
      if (cleanupConfirmed) {
        rmSync(directory, { recursive: true });
        assert(!existsSync(directory));
        record.copy_removed = true;
        console.log(JSON.stringify({ removed_workspace: directory }));
      } else {
        record.copy_retained = true;
        console.error(JSON.stringify({ retained_workspace: directory }));
      }
      writeFileSync(join(evidence, "results.json"), JSON.stringify(results, null, 2));
    }
  }
}
