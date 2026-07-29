import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function waitForServer(server, expectedPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error(`server did not become ready:\n${output}`)),
      timeoutMs,
    );
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(
        /http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s]*/,
      );
      if (!match || new URL(match[0]).pathname !== expectedPath) return;
      clearTimeout(timer);
      resolve(match[0]);
    });
    server.stderr.on("data", (chunk) => {
      output += chunk;
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited before ready (${code}):\n${output}`));
    });
  });
}

async function terminateChild(child, timeoutMs = 2_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  await new Promise((resolve) => {
    const forceTimer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.once("exit", () => {
      clearTimeout(forceTimer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

async function webdriverRequest(endpoint, route, options = {}) {
  const response = await fetch(new URL(route, endpoint), {
    method: options.method ?? "GET",
    headers: options.body ? { "content-type": "application/json" } : {},
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = await response.json();
  if (!response.ok || payload.value?.error) {
    throw new Error(
      `WebDriver ${options.method ?? "GET"} ${route} failed: ${JSON.stringify(payload.value)}`,
    );
  }
  return payload.value;
}

async function waitForDriver(endpoint, driver, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (driver.exitCode !== null) {
      throw new Error(`WebDriver exited before ready (${driver.exitCode})`);
    }
    try {
      await webdriverRequest(endpoint, "/status");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("WebDriver endpoint did not become ready");
}

function capabilities(browserName, browserBinary, profile) {
  if (browserName === "firefox") {
    return {
      alwaysMatch: {
        browserName,
        acceptInsecureCerts: false,
        "moz:firefoxOptions": {
          binary: browserBinary,
          args: ["-profile", profile],
          prefs: {
            "app.normandy.api_url": "",
            "app.update.auto": false,
            "browser.safebrowsing.downloads.remote.enabled": false,
            "browser.shell.checkDefaultBrowser": false,
            "datareporting.healthreport.uploadEnabled": false,
            "network.captive-portal-service.enabled": false,
            "network.connectivity-service.enabled": false,
            "toolkit.telemetry.enabled": false,
          },
        },
      },
    };
  }
  if (browserName === "safari") {
    return {
      alwaysMatch: {
        browserName,
        acceptInsecureCerts: false,
        "safari:automaticInspection": false,
        "safari:automaticProfiling": false,
      },
    };
  }
  throw new Error(`Unsupported native browser: ${browserName}`);
}

/**
 * Run a local evaluation in a real browser window through its vendor WebDriver.
 * Headless and software-rendering switches are intentionally unavailable.
 */
export async function runWebDriverLocalScene({
  browserName,
  browserBinary = null,
  driverBinary,
  driverPort,
  serverPort,
  scenePath,
  query,
  readyState,
  probeExpression,
  timeoutMs = 120_000,
}) {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), `single-mesh-${browserName}-profile-`),
  );
  const server = spawn(
    process.env.PYTHON_BIN ?? "python3",
    [
      "serve.py",
      "--evaluation",
      "--no-open",
      "--quiet",
      "--port",
      String(serverPort),
    ],
    { cwd: PROJECT_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  const driverArguments = browserName === "safari"
    ? ["-p", String(driverPort)]
    : ["--port", String(driverPort), "--host", "127.0.0.1"];
  const driver = spawn(driverBinary, driverArguments, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, NO_PROXY: "127.0.0.1,localhost" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let driverOutput = "";
  driver.stdout.on("data", (chunk) => {
    driverOutput += chunk;
  });
  driver.stderr.on("data", (chunk) => {
    driverOutput += chunk;
  });
  const endpoint = `http://127.0.0.1:${driverPort}`;
  let sessionId = null;
  try {
    const [baseUrl] = await Promise.all([
      waitForServer(server, scenePath, 10_000),
      waitForDriver(endpoint, driver, 10_000),
    ]);
    const session = await webdriverRequest(endpoint, "/session", {
      method: "POST",
      body: { capabilities: capabilities(browserName, browserBinary, profile) },
    });
    sessionId = session.sessionId;
    assert.ok(sessionId, "WebDriver did not return a session id");
    const route = `/session/${sessionId}`;
    const url = `${baseUrl}${query}`;
    await webdriverRequest(endpoint, `${route}/url`, {
      method: "POST",
      body: { url },
    });
    const deadline = Date.now() + timeoutMs;
    let state = null;
    while (Date.now() < deadline) {
      state = await webdriverRequest(endpoint, `${route}/execute/sync`, {
        method: "POST",
        body: { script: `return (${probeExpression});`, args: [] },
      });
      if (state?.state === "error") {
        throw new Error(`page entered error state: ${state.statusText}`);
      }
      if (
        Object.entries(readyState).every(
          ([key, value]) => state?.[key] === value,
        )
      ) {
        const screenshot = await webdriverRequest(
          endpoint,
          `${route}/screenshot`,
        );
        assert.ok(
          Buffer.from(screenshot, "base64").byteLength > 1_000,
          "native browser screenshot is unexpectedly empty",
        );
        return {
          state,
          url,
          browserName,
          capabilities: session.capabilities,
          headless: false,
          softwareRenderingRequested: false,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`native browser page timed out: ${JSON.stringify(state)}`);
  } catch (error) {
    error.message += `\nWebDriver output:\n${driverOutput}`;
    throw error;
  } finally {
    if (sessionId) {
      try {
        await webdriverRequest(endpoint, `/session/${sessionId}`, {
          method: "DELETE",
        });
      } catch {
        // Driver termination below is the final cleanup fallback.
      }
    }
    await Promise.all([terminateChild(driver), terminateChild(server)]);
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}
