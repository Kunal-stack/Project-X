import { executeD1Command, getD1TargetLabel, getScriptArgs, sqlQuote } from "./_lib/d1.js";

function main() {
  const args = getScriptArgs();
  const targetStatus = args[0];
  const ids = args.slice(1);

  if (!targetStatus || ids.length === 0) {
    console.error("Usage: node scripts/set-candidate-status.js <approved|rejected|pending> <candidate-id> [more-ids]");
    process.exit(1);
  }

  const allowedStatuses = new Set(["approved", "rejected", "pending"]);

  if (!allowedStatuses.has(targetStatus)) {
    console.error(`Unsupported status: ${targetStatus}`);
    process.exit(1);
  }

  executeD1Command(
    `UPDATE memory_candidates
     SET status = ${sqlQuote(targetStatus)},
         updated_at = unixepoch()
     WHERE id IN (${ids.map((id) => sqlQuote(id)).join(", ")});`
  );

  console.log(
    `Updated ${ids.length} candidate(s) to status "${targetStatus}" in ${getD1TargetLabel()}.`
  );
}

main();
