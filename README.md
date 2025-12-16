# Project srouce tree:
anypoint-automation/
  package.json
  .env
  src/
    anypointClient.js
    jobs/
      listApps.js
      startAllApps.js
      stopAllApps.js
  README.md



# Set .env with bearer token, org, env

# List CloudHub 2.0 apps
npm run list-apps

# Start every app whose name ends with eapi-dev
npm run start-all-apps -- --app "*eapi-dev"

# Stop every app whose name starts with eapi-
npm run stop-all-apps -- --app "eapi-*"

# Use a raw regex to stop prod apps
npm run stop-all-apps -- --app ".*-prod$"
