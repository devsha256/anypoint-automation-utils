// src/jobs/listApps.js
import { jobs } from "../anypointClient.js";

async function main() {
  console.log("Listing CloudHub 2.0 applications...");
  const apps = await jobs.listApplications();
  console.log(JSON.stringify(apps, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
