// An environment for tests that run git: no inherited GIT_* variable (GIT_DIR, GIT_INDEX_FILE and friends
// point git at a repository the test must never touch), and none of the developer's own git configuration.
export function cleanGitEnv(extra = {}) {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) if (!key.startsWith("GIT_")) env[key] = value;
  return { ...env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...extra };
}

// The same, but starting from nothing: only PATH and the git overrides, plus what the caller adds. For tests
// that must control exactly which variables a child process can see.
export function minimalGitEnv(extra = {}) {
  return { PATH: process.env.PATH, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", ...extra };
}
