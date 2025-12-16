// src/jobs/startAllApps.js
import { jobs } from "../anypointClient.js";

async function main() {
  console.log("Starting all CloudHub 2.0 applications...");

  // Example filter: start only apps whose names start with "demo-"
  const filterFn = (app) => {
    const name = app.name || app.id || app.applicationName || "";
    return name.startsWith("demo-");
  };

  const result = await jobs.startAll({ filterFn });
  console.log("Start-all summary:", JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
