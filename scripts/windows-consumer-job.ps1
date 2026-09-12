param([Parameter(Mandatory=$true)][string]$Request, [switch]$JoinJob)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json

# This is the Windows OS adapter, not a PID-tree discovery heuristic. The Job
# disallows breakaway and remains owned outside the command's process tree.
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class ConsumerJob {
    [StructLayout(LayoutKind.Sequential)] struct BasicLimits {
        public long ProcessTime, JobTime;
        public uint Flags;
        public UIntPtr MinimumWorkingSet, MaximumWorkingSet;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)] struct ExtendedLimits {
        public BasicLimits Basic;
        public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes;
        public UIntPtr ProcessMemory, JobMemory, PeakProcessMemory, PeakJobMemory;
    }
    [StructLayout(LayoutKind.Sequential)] struct Accounting {
        public long UserTime, KernelTime, PeriodUserTime, PeriodKernelTime;
        public uint PageFaults, TotalProcesses, ActiveProcesses, TerminatedProcesses;
    }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern IntPtr OpenJobObject(uint access, bool inherit, string name);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimits limits, uint size);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool QueryInformationJobObject(IntPtr job, int kind, out Accounting info, uint size, IntPtr returned);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll", SetLastError=true)]
    static extern bool TerminateJobObject(IntPtr job, uint code);
    [DllImport("kernel32.dll", SetLastError=true)]
    public static extern bool CloseHandle(IntPtr handle);
    static void Check(bool success) { if (!success) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    public static IntPtr Create(string name) {
        IntPtr job = CreateJobObject(IntPtr.Zero, name);
        Check(job != IntPtr.Zero);
        try {
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.Flags = 0x2000; // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE; no breakaway.
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
            return job;
        } catch { CloseHandle(job); throw; }
    }
    public static void Join(string name) {
        IntPtr job = OpenJobObject(1, false, name); // JOB_OBJECT_ASSIGN_PROCESS
        Check(job != IntPtr.Zero);
        try { Check(AssignProcessToJobObject(job, new IntPtr(-1))); }
        finally { CloseHandle(job); }
    }
    public static uint Active(IntPtr job) {
        Accounting info;
        Check(QueryInformationJobObject(job, 1, out info, (uint)Marshal.SizeOf(typeof(Accounting)), IntPtr.Zero));
        return info.ActiveProcesses;
    }
    public static void Terminate(IntPtr job) { Check(TerminateJobObject(job, 1)); }
}
'@

if ($JoinJob) {
    # Assignment occurs before the first command/bridge can run or spawn anything.
    [ConsumerJob]::Join($config.job)
    if (Test-Path -LiteralPath $config.stop) { exit 1 }
    & $config.node $config.bridge $Request
    exit $LASTEXITCODE
}

$job = [ConsumerJob]::Create($config.job)
$bootstrap = $null
try {
    $scriptPath = $PSCommandPath.Replace("'", "''")
    $requestPath = $Request.Replace("'", "''")
    $source = "& '$scriptPath' -Request '$requestPath' -JoinJob"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($source))
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = Join-Path $PSHOME 'powershell.exe'
    $start.Arguments = "-NoProfile -NonInteractive -EncodedCommand $encoded"
    $start.UseShellExecute = $false
    $bootstrap = [Diagnostics.Process]::Start($start)
    [Console]::Error.WriteLine(('{"child_pid":' + $bootstrap.Id + ',"command":"windows-job-bootstrap"}'))
    $interrupted = $false
    while (!$bootstrap.HasExited) {
        if (Test-Path -LiteralPath $config.stop) { $interrupted = $true; break }
        Start-Sleep -Milliseconds 20
    }
    $orphan = !$interrupted -and ([ConsumerJob]::Active($job) -gt 0)
    if ($interrupted -or $orphan) { [ConsumerJob]::Terminate($job) }
    $deadline = [DateTime]::UtcNow.AddMilliseconds(2000)
    while (([ConsumerJob]::Active($job) -gt 0) -or !$bootstrap.HasExited) {
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Windows Job shutdown unconfirmed' }
        Start-Sleep -Milliseconds 20
    }
    $result = @{
        job = $config.job; controller = $PID; active_processes = 0
        bootstrap = $bootstrap.Id; exit_code = $bootstrap.ExitCode
        interrupted = $interrupted; orphan = $orphan
    }
    [IO.File]::WriteAllText($config.result, ($result | ConvertTo-Json -Compress))
    [Console]::Error.WriteLine(('{"child_closed":' + $bootstrap.Id + '}'))
    if ($interrupted -or $orphan) { exit 1 }
    exit $bootstrap.ExitCode
} finally {
    # Missing completion receipt is never cleanup proof, even with kill-on-close.
    if (![ConsumerJob]::CloseHandle($job)) { throw 'Windows Job handle close failed' }
    if ($bootstrap) { $bootstrap.Dispose() }
}
