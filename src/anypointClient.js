// src/anypointClient.js
import { exec } from "node:child_process";
import { promisify } from "node:util";
import dotenv from "dotenv";

dotenv.config();

const execAsync = promisify(exec);

/**
 * Base command: local anypoint-cli-v4 binary, overridable via env.
 * NPM package exposes the CLI with flags like --bearer and CloudHub 2.0 commands.[web:2][web:26]
 */
const BASE_CMD = process.env.ANYPOINT_CLI_CMD || "./node_modules/.bin/anypoint-cli-v4";

function ensureBearer() {
  const bearer = process.env.ANYPOINT_BEARER_TOKEN || process.env.ANYPOINT_BEARER;
  if (!bearer) {
    throw new Error("ANYPOINT_BEARER_TOKEN (or ANYPOINT_BEARER) is not set.");
  }
  return bearer;
}

/**
 * Run Anypoint CLI with bearer token and common flags (org, env).
 * CloudHub 2.0 commands support listing, starting, stopping applications, and more.[web:26]
 */
async function runCli(args, options = {}) {
  const bearer = ensureBearer();
  const orgId = process.env.ANYPOINT_ORG_ID;
  const envName = process.env.ANYPOINT_ENVIRONMENT;

  const fullArgs = [
    ...args,
    "--bearer",
    `"${bearer}"`
  ];

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
 * CloudHub 2.0 helper.
 * Uses the CloudHub 2.0 command group from the CLI command list.[web:26]
 */
export const cloudhub2 = {
  /**
   * List CloudHub 2.0 applications in the organization.
   * Uses: cloudhub2:applications:list --output json.[web:26]
   */
  async listApps() {
    const { stdout } = await runCli([
      "cloudhub2:applications:list",
      "--output",
      "json"
    ]);
    const json = tryParseJson(stdout);
    return json ?? stdout;
  },

  /**
   * Start a CloudHub 2.0 application by ID or name.
   * Uses: cloudhub2:applications:start <app>.[web:26]
   */
  async startApp(idOrName) {
    const { stdout } = await runCli([
      "cloudhub2:applications:start",
      idOrName
    ]);
    return stdout;
  },

  /**
   * Stop a CloudHub 2.0 application by ID or name.
   * Uses: cloudhub2:applications:stop <app>.[web:26]
   */
  async stopApp(idOrName) {
    const { stdout } = await runCli([
      "cloudhub2:applications:stop",
      idOrName
    ]);
    return stdout;
  }
};

/**
 * Higher-level automation jobs for CloudHub 2.0.
 */
export const jobs = {
  /**
   * Get list of CloudHub 2.0 applications.
   */
  async listApplications() {
    return cloudhub2.listApps();
  },

  /**
   * Start all CloudHub 2.0 apps, optionally filtered.
   * filterFn(app) => boolean; if provided, only apps where it returns true are started.
   */
  async startAll({ filterFn = null } = {}) {
    const apps = await this.listApplications();
    const list = Array.isArray(apps) ? apps : apps.items || apps.data || [];

    const failures = [];

    for (const app of list) {
      const name = app.name || app.id || app.applicationName;
      if (!name) continue;
      if (filterFn && !filterFn(app)) continue;

      console.log(`Starting app: ${name}`);
      try {
        await cloudhub2.startApp(name);
      } catch (e) {
        console.error(`Failed to start ${name}: ${e.message}`);
        failures.push({ name, error: e.message });
      }
    }

    return { total: list.length, failures };
  },

  /**
   * Stop all CloudHub 2.0 apps, optionally filtered.
   * filterFn(app) => boolean; if provided, only apps where it returns true are stopped.
   */
  async stopAll({ filterFn = null } = {}) {
    const apps = await this.listApplications();
    const list = Array.isArray(apps) ? apps : apps.items || apps.data || [];

    const failures = [];

    for (const app of list) {
      const name = app.name || app.id || app.applicationName;
      if (!name) continue;
      if (filterFn && !filterFn(app)) continue;

      console.log(`Stopping app: ${name}`);
      try {
        await cloudhub2.stopApp(name);
      } catch (e) {
        console.error(`Failed to stop ${name}: ${e.message}`);
        failures.push({ name, error: e.message });
      }
    }

    return { total: list.length, failures };
  }
};
