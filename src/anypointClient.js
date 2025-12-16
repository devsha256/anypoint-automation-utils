// src/anypointClient.js
import dotenv from "dotenv";
import spawn from "cross-spawn"; // cross-platform spawn wrapper[web:2]

dotenv.config();

function ensureBearer() {
  const bearer = process.env.ANYPOINT_BEARER_TOKEN || process.env.ANYPOINT_BEARER;
  if (!bearer) {
    throw new Error("ANYPOINT_BEARER_TOKEN (or ANYPOINT_BEARER) is not set.");
  }
  return bearer;
}

/**
 * Run Anypoint CLI via `npx anypoint-cli-v4 ...`
 * This works on Windows and Unix when anypoint-cli-v4 is a local dependency.[web:2][web:88]
 */
function runCli(args, options = {}) {
  const bearer = ensureBearer();
  const orgId = process.env.ANYPOINT_ORG_ID;
  const envName = process.env.ANYPOINT_ENVIRONMENT;

  const cliArgs = [
    "anypoint-cli-v4",
    ...args,
    "--bearer",
    bearer
  ];

  if (orgId) {
    cliArgs.push("--organization", orgId);
  }
  if (envName) {
    cliArgs.push("--environment", envName);
  }

  return new Promise((resolve, reject) => {
    const child = spawn("npx", cliArgs, {
      stdio: ["ignore", "pipe", "pipe"],
      ...options
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (err) => reject(err));

    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(
          `anypoint-cli-v4 exited with code ${code}\n${stderr}`
        );
        err.code = code;
        err.stderr = stderr;
        err.stdout = stdout;
        return reject(err);
      }
      if (stderr.trim()) {
        console.error("[Anypoint CLI stderr]", stderr);
      }
      resolve({ stdout, stderr });
    });
  });
}

function tryParseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/**
 * Build name-based filter from pattern used in --app.
 */
export function buildAppNameFilter(pattern) {
  if (!pattern) return () => true;

  const looksLikeRegex = /[\^\$\|\+\?\(\)\[\]\\]/.test(pattern);
  let regex;

  if (looksLikeRegex) {
    regex = new RegExp(pattern);
  } else {
    const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
    const wildcard = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
    regex = new RegExp(`^${wildcard}$`);
  }

  return (app) => {
    const name = app.name || app.applicationName || "";
    return regex.test(name);
  };
}

/**
 * CloudHub 2.0 helpers using runtime-mgr:application:* commands.[web:1]
 * Note: all operations require <appID>, which comes from runtime-mgr:application:list.[web:1]
 */
export const cloudhub2 = {
  async listApps() {
    const { stdout } = await runCli([
      "runtime-mgr:application:list",
      "--output",
      "json"
    ]);
    const json = tryParseJson(stdout);
    return json ?? stdout;
  },

  async startAppById(appId) {
    const { stdout } = await runCli([
      "runtime-mgr:application:start",
      appId
    ]);
    return stdout;
  },

  async stopAppById(appId) {
    const { stdout } = await runCli([
      "runtime-mgr:application:stop",
      appId
    ]);
    return stdout;
  }
};

export const jobs = {
  async listApplications() {
    return cloudhub2.listApps();
  },

  /**
   * Start all apps whose NAMES match pattern, but pass their IDs to CLI.
   * Pattern is matched against app.name/applicationName; app.id is used for start.[web:1]
   */
  async startMatching({ pattern } = {}) {
    const apps = await this.listApplications();
    const list = Array.isArray(apps) ? apps : apps.items || apps.data || [];

    const filterFn = buildAppNameFilter(pattern);
    const failures = [];
    let matched = 0;

    for (const app of list) {
      const id = app.id; // appID required by CLI[web:1]
      const name = app.name || app.applicationName || id;
      if (!id) continue; // must have ID to call CLI
      if (!filterFn(app)) continue;

      matched++;
      console.log(`Starting app (id=${id}, name=${name})`);
      try {
        await cloudhub2.startAppById(id);
      } catch (e) {
        console.error(`Failed to start id=${id}, name=${name}: ${e.message}`);
        failures.push({ id, name, error: e.message });
      }
    }

    return { total: list.length, matched, failures };
  },

  /**
   * Stop all apps whose NAMES match pattern, but pass their IDs to CLI.
   */
  async stopMatching({ pattern } = {}) {
    const apps = await this.listApplications();
    const list = Array.isArray(apps) ? apps : apps.items || apps.data || [];

    const filterFn = buildAppNameFilter(pattern);
    const failures = [];
    let matched = 0;

    for (const app of list) {
      const id = app.id;
      const name = app.name || app.applicationName || id;
      if (!id) continue;
      if (!filterFn(app)) continue;

      matched++;
      console.log(`Stopping app (id=${id}, name=${name})`);
      try {
        await cloudhub2.stopAppById(id);
      } catch (e) {
        console.error(`Failed to stop id=${id}, name=${name}: ${e.message}`);
        failures.push({ id, name, error: e.message });
      }
    }

    return { total: list.length, matched, failures };
  }
};
