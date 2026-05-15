import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const projectRoot = resolve(scriptDir, "../..");

function stripOuterQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseEnvFile(content) {
  const values = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();

    values[key] = stripOuterQuotes(value);
  }

  return values;
}

export function loadLocalEnv() {
  const env = { ...process.env };
  const devVarsPath = resolve(projectRoot, ".dev.vars");

  if (!existsSync(devVarsPath)) {
    return env;
  }

  const parsed = parseEnvFile(readFileSync(devVarsPath, "utf8"));
  return { ...env, ...parsed };
}
