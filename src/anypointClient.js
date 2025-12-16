// src/anypointClient.js
import { spawn } from "node:child_process";
import dotenv from "dotenv";

dotenv.config();

const BASE_CMD =
  process.env.ANYPOINT_CLI_CMD || "./node_modules/.bin/anypoint-cli-v4";

function ensureBearer() {
  const bearer = process.env.ANYPOINT_BEARER_TOKEN || process.env.ANYPOINT_BEARER;
  if (!bearer) {
    throw new Error("ANYPOINT_BEARER_TOKEN (or ANYPOINT_BEARER) is not set.");
  }
  return bearer;
}

function runCli(args, options = {}) {
  const bearer = ensureBearer();
  const orgId = process.env.ANYPOINT_ORG_ID;
  const envName = process.env.ANYPOINT_ENVIRONMENT;

  const finalArgs = [...args, "--bearer", bearer];

  if (orgId) {
    finalArgs.push("--organization", orgId);
  }
  if (envName) {
    finalArgs.push("--environment", envName);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(BASE_CMD, finalArgs, {
      shell: false, // important for Windows
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

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        const err = new Error(
          `anypoint-cli-v4 exited with code ${code}\n${stderr}`
        );
        // surface captured stderr
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

// keep your buildAppNameFilter as-is
export function buildAppNameFilter(pattern) {
  if (!pattern) {
    return () => true;
  }

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
    const name = app.name || app.id || app.applicationName || "";
    return regex.test(name);
  };
}

// CloudHub 2.0 helpers (same commands as before)
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

  async startApp(idOrName) {
    const { stdout } = await runCli([
      "runtime-mgr:application:start",
      idOrName
    ]);
    return stdout;
  },

  async stopApp(idOrName) {
    const { stdout } = await runCli([
      "runtime-mgr:application:stop",
      idOrName
    ]);
    return stdout;
  }
};

export const jobs = {
  async listApplications() {
    return cloudhub2.listApps();
  },

  async startMatching({ pattern } = {}) {
    const apps = await this.listApplications();
    const list = Array.isArray(apps) ? apps : apps.items || apps.data || [];

    const filterFn = buildAppNameFilter(pattern);
    const failures = [];
    let matched = 0;

    for (const app of list) {
      const name = app.name || app.id || app.applicationName;
      if (!name) continue;
      if (!filterFn(app)) continue;

      matched++;
      console.log(`Starting app: ${name}`);
      try {
        await cloudhub2.startApp(name);
      } catch (e) {
        console.error(`Failed to start ${name}: ${e.message}`);
        failures.push({ name, error: e.message });
      }
    }

    return { total: list.length, matched, failures };
  },

  async stopMatching({ pattern } = {}) {
    const apps = await this.listApplications();
    const list = Array.isArray(apps) ? apps : apps.items || apps.data || [];

    const filterFn = buildAppNameFilter(pattern);
    const failures = [];
    let matched = 0;

    for (const app of list) {
      const name = app.name || app.id || app.applicationName;
      if (!name) continue;
      if (!filterFn(app)) continue;

      matched++;
      console.log(`Stopping app: ${name}`);
      try {
        await cloudhub2.stopApp(name);
      } catch (e) {
        console.error(`Failed to stop ${name}: ${e.message}`);
        failures.push({ name, error: e.message });
      }
    }

    return { total: list.length, matched, failures };
  }
};
