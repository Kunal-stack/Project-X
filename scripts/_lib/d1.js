import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { projectRoot } from "./dev-vars.js";

function hasArg(name) {
  return process.argv.includes(name);
}

export function getScriptArgs() {
  return process.argv
    .slice(2)
    .filter((arg) => arg !== "--local" && arg !== "--remote");
}

export function getD1Target() {
  if (hasArg("--remote") || process.env.KUNAL_D1_TARGET === "remote") {
    return "remote";
  }

  return "local";
}

export function getD1TargetLabel() {
  return getD1Target() === "remote" ? "remote D1" : "local D1";
}

function getWranglerBaseArgs() {
  const args = ["wrangler", "d1", "execute", "DB"];

  if (getD1Target() === "remote") {
    args.push("--remote");
  } else {
    args.push("--local", "--persist-to", ".wrangler/state");
  }

  args.push("--json", "-y");
  return args;
}

function runWrangler(args) {
  const output = execFileSync("npx", args, {
    cwd: projectRoot,
    encoding: "utf8"
  });

  return output.trim();
}

function parseD1Json(output) {
  let parsed;

  try {
    parsed = JSON.parse(output);
  } catch {
    const lines = output.split(/\r?\n/);
    const jsonStartIndex = lines.findIndex((line) => {
      const trimmed = line.trim();
      return trimmed.startsWith("{") || trimmed.startsWith("[");
    });

    if (jsonStartIndex === -1) {
      throw new Error(`Unable to parse Wrangler D1 output as JSON:\n${output}`);
    }

    parsed = JSON.parse(lines.slice(jsonStartIndex).join("\n"));
  }

  return Array.isArray(parsed) ? parsed[0] : parsed;
}

export function executeD1Command(sql) {
  const output = runWrangler([...getWranglerBaseArgs(), "--command", sql]);
  return parseD1Json(output);
}

export function executeD1SqlFile(sql) {
  const tempDir = mkdtempSync(join(tmpdir(), "kunal-d1-"));
  const filePath = join(tempDir, "command.sql");

  try {
    writeFileSync(filePath, sql);
    const output = runWrangler([...getWranglerBaseArgs(), "--file", filePath]);
    return parseD1Json(output);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function executeD1Statements(statements, options = {}) {
  const chunkSize = options.chunkSize || (getD1Target() === "remote" ? 25 : statements.length);
  const chunks = [];

  for (let index = 0; index < statements.length; index += chunkSize) {
    chunks.push(statements.slice(index, index + chunkSize));
  }

  for (const chunk of chunks) {
    const sql =
      getD1Target() === "remote"
        ? chunk.join("\n")
        : ["BEGIN TRANSACTION;", ...chunk, "COMMIT;"].join("\n");

    executeD1SqlFile(sql);
  }
}

export function sqlQuote(value) {
  if (value === null || value === undefined) {
    return "NULL";
  }

  return `'${String(value).replace(/'/g, "''")}'`;
}

export function sqlJson(value) {
  return sqlQuote(JSON.stringify(value));
}
