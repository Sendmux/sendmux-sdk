export function tarListArgs(tarball, options = {}) {
  const platform = options.platform ?? process.platform;
  const args = ["-tf", tarball];

  if (platform === "win32") {
    return ["--force-local", ...args];
  }

  return args;
}

export function tarVerboseListArgs(tarball, options = {}) {
  const platform = options.platform ?? process.platform;
  const args = ["-tvf", tarball];

  if (platform === "win32") {
    return ["--force-local", ...args];
  }

  return args;
}

export function invalidTarballEntries({ names, verboseListing }) {
  const symlinks = verboseListing
    .split(/\r?\n/)
    .filter((line) => line.startsWith("l"));
  const pnpmEntries = names
    .split(/\r?\n/)
    .filter((name) => /(^|\/)(?:\.pnpm|pnpm-lock\.yaml)(?:\/|$)/.test(name));

  return {
    pnpmEntries,
    symlinks,
  };
}
