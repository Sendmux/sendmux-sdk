export function tarExtractArgs({ targetDir, tarball }, options = {}) {
  const platform = options.platform ?? process.platform;
  const args = ["-xzf", tarball, "-C", targetDir];

  if (platform === "win32") {
    return ["--force-local", ...args];
  }

  return args;
}
