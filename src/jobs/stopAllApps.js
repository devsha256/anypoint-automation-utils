// src/jobs/stopAllApps.js
import { jobs } from "../anypointClient.js";

async function main() {
  console.log("Stopping all CloudHub 2.0 applications...");

  // Example filter: stop everything except apps labeled "always-on"
  const filterFn = (app) => {
    const labels = app.labels || app.tags || [];
    return !labels.includes("always-on");
  };

  const result = await jobs.stopAll({ filterFn });
  console.log("Stop-all summary:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
