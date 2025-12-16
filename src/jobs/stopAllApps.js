// src/jobs/stopAllApps.js
import { jobs } from "../anypointClient.js";

function parseArgs() {
  const args = process.argv.slice(2);
  let pattern = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--app" && args[i + 1]) {
      pattern = args[i + 1];
      i++;
    }
  }

  return { pattern };
}

async function main() {
  const { pattern } = parseArgs();
  console.log(
    pattern
      ? `Stopping CloudHub 2.0 apps matching pattern: ${pattern}`
      : "Stopping ALL CloudHub 2.0 apps (no pattern passed)."
  );

  const result = await jobs.stopMatching({ pattern });
  console.log("Stop-matching summary:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
