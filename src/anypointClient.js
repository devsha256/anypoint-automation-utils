// src/anypointClient.js
import { exec } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);

const BASE_CMD =
  process.env.ANYPOINT_CLI_CMD || "./node_modules/.bin/anypoint-cli-v4";

function ensureBearer() {
  const bearer = process.env.ANYPOINT_BEARER_TOKEN || process.env.ANYPOINT_BEARER;
  if (!bearer) {
    throw new Error("ANYPOINT_BEARER_TOKEN (or ANYPOINT_BEARER) is not set.");
  }
  return bearer;
}

async function runCli(args, options = {}) {
  const bearer = ensureBearer();
  const orgId = process.env.ANYPOINT_ORG_ID;
  const envName = process.env.ANYPOINT_ENVIRONMENT;

  const fullArgs = [...args, "--bearer", `"${bearer}"`];

  if (orgId) {
    fullArgs.push("--organization", `"${orgId}"`);
  }
  if (envName) {
    fullArgs.push("--environment", `"${envName}"`);
  }

  const cmd = `${BASE_CMD} ${fullArgs.join(" ")}`;

  const { stdout, stderr } = await execAsync(cmd, {
    shell: true,
    ...options
  });

  if (stderr && stderr.trim()) {
    console.error("[Anypoint CLI stderr]", stderr);
  }

  return { stdout, stderr };
}

function tryParseJson(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

/**
 * Build a predicate from a pattern string.
 * Examples:
 *  "*eapi-dev"  -> matches names ending with "eapi-dev"
 *  "eapi-*-dev" -> typical wildcard
 *  ".*-prod$"   -> treated as regex
 */
export function buildAppNameFilter(pattern) {
  if (!pattern) {
    return () => true;
  }

  // If pattern looks like a regex (contains ^, $, or unescaped . or |), use it directly
  const looksLikeRegex = /[\^\$\|\+\?\(\)\[\]\\]/.test(pattern);
  let regex;

  if (looksLikeRegex) {
    regex = new RegExp(pattern);
  } else {
    // Treat as wildcard: * -> .*, ? -> .
    const escaped = pattern.replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&");
    const wildcard = escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".");
    regex = new RegExp(`^${wildcard}$`);
  }

  return (app) => {
    const name = app.name || app.id || app.applicationName || "";
    return regex.test(name);
  };
}

/**
 * CloudHub 2.0 helpers using runtime-mgr:application:* command group.[web:22][web:40]
 * These commands support listing all apps and starting/stopping them.[web:40]
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

/**
 * High-level jobs for CloudHub 2.0.
 */
export const jobs = {
  async listApplications() {
    return cloudhub2.listApps();
  },

  /**
   * Start all apps whose names match a pattern.
   * @param {string} pattern - wildcard/regex for app name (e.g. "*eapi-dev").
   */
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

  /**
   * Stop all apps whose names match a pattern.
   * @param {string} pattern - wildcard/regex for app name.
   */
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
