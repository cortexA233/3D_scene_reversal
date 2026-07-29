import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const DEFAULT_PAGE_PROBE = `(() => ({
  state: document.body?.dataset?.state ?? null,
  objectId: document.body?.dataset?.objectId ?? null,
  captureCount: document.body?.dataset?.captureCount ?? null,
  statusText: document.querySelector('#state')?.textContent ?? null,
  manifestCaptures: window.singleMeshEvaluation?.manifest?.captures?.length ?? null,
  captureByteLengthsValid:
    window.singleMeshEvaluation?.manifest?.captures?.length > 0
      ? window.singleMeshEvaluation.manifest.captures.every(
          (capture) => capture.byteLength === 512 * 512 * 4
        )
      : null,
  captureChecksumsValid:
    window.singleMeshEvaluation?.manifest?.captures?.length > 0
      ? window.singleMeshEvaluation.manifest.captures.every(
          (capture) => /^[0-9a-f]{8}$/.test(capture.checksum)
        )
      : null,
  manifestViews: window.singleMeshEvaluation?.manifest?.views?.length ?? null,
  manifestPasses: window.singleMeshEvaluation?.manifest?.passes?.length ?? null,
  replacementIndependentlyFramed:
    window.singleMeshEvaluation?.manifest?.framing?.replacementTransform
      ?.independentlyFramed ?? null
}))()`;

async function firstExisting(paths) {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next known browser location.
    }
  }
  throw new Error("Chrome executable not found; set CHROME_BIN");
}

function waitForServer(server, expectedPath, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => {
      reject(new Error(`server did not become ready:\n${output}`));
    }, timeoutMs);
    server.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/(?:127\.0\.0\.1|localhost):\d+\/[^\s]*/);
      if (!match || new URL(match[0]).pathname !== expectedPath) return;
      clearTimeout(timer);
      resolve(match[0]);
    });
    server.stderr.on("data", (chunk) => {
      output += chunk;
    });
    server.on("exit", (code) => {
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

async function waitForDevToolsPort(profile, browser, timeoutMs) {
  const activePortFile = path.join(profile, "DevToolsActivePort");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (browser.exitCode !== null) {
      throw new Error(`browser exited before DevTools was ready (${browser.exitCode})`);
    }
    try {
      const [port] = (await readFile(activePortFile, "utf8")).trim().split("\n");
      if (/^\d+$/.test(port)) return Number(port);
    } catch {
      // Chrome creates the file only after the debugging endpoint is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("browser DevTools endpoint did not become ready");
}

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners) listener(message);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  onEvent(listener) {
    this.listeners.add(listener);
  }

  close() {
    this.socket.close();
  }
}

async function inspectPage({
  chrome,
  profile,
  url,
  readyState,
  timeoutMs,
  probeExpression,
}) {
  let browserStderr = "";
  const browser = spawn(
    chrome,
    [
      "--headless=new",
      "--no-first-run",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-sync",
      "--metrics-recording-only",
      "--no-report-upload",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
      "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NO_PROXY: "127.0.0.1,localhost" },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  browser.stderr.on("data", (chunk) => {
    browserStderr += chunk;
  });

  let session = null;
  try {
    const port = await waitForDevToolsPort(profile, browser, 10_000);
    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
      { method: "PUT" },
    );
    assert.equal(targetResponse.status, 200);
    const target = await targetResponse.json();
    session = new CdpSession(target.webSocketDebuggerUrl);
    await session.open();

    const requests = [];
    const errors = [];
    session.onEvent((message) => {
      if (message.method === "Network.requestWillBeSent") {
        requests.push(message.params.request.url);
      }
      if (message.method === "Runtime.exceptionThrown") {
        errors.push(message.params.exceptionDetails.text);
      }
      if (
        message.method === "Log.entryAdded" &&
        ["error", "warning"].includes(message.params.entry.level)
      ) {
        errors.push(message.params.entry.text);
      }
    });
    await session.send("Runtime.enable");
    await session.send("Log.enable");
    await session.send("Network.enable");
    await session.send("Page.enable");
    await session.send("Page.navigate", { url });

    const deadline = Date.now() + timeoutMs;
    let lastState = null;
    while (Date.now() < deadline) {
      const result = await session.send("Runtime.evaluate", {
        expression: probeExpression ?? DEFAULT_PAGE_PROBE,
        returnByValue: true,
      });
      lastState = result.result.value;
      if (lastState?.state === "error") {
        throw new Error(`page entered error state: ${lastState.statusText}`);
      }
      if (
        Object.entries(readyState).every(
          ([key, value]) => lastState?.[key] === value,
        )
      ) {
        const screenshot = await session.send("Page.captureScreenshot", {
          format: "png",
        });
        assert.ok(
          Buffer.from(screenshot.data, "base64").byteLength > 1000,
          "browser screenshot is unexpectedly empty",
        );
        const actionableErrors = errors.filter(
          (message) =>
            !/GL Driver Message .*Performance.*ReadPixels/.test(message),
        );
        assert.deepEqual(actionableErrors, []);
        const externalRequests = requests.filter((requestUrl) => {
          const parsed = new URL(requestUrl);
          return ![
            "127.0.0.1",
            "localhost",
          ].includes(parsed.hostname) && !["about:", "data:", "blob:"].includes(parsed.protocol);
        });
        assert.deepEqual(externalRequests, []);
        return { state: lastState, requestCount: requests.length };
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `page timed out before ready: ${JSON.stringify(lastState)}\n${browserStderr}`,
    );
  } finally {
    session?.close();
    await terminateChild(browser);
  }
}

export async function runLocalSceneAutomation({
  label,
  serverFlag,
  path: scenePath,
  query = "",
  readyState,
  timeoutMs = 20_000,
  port = 8390,
  probeExpression = DEFAULT_PAGE_PROBE,
  serverArguments = [],
  threeProbePath = "/vendor/three/build/three.module.js",
}) {
  const chrome = await firstExisting([
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ]);
  const profile = await mkdtemp(
    path.join(os.tmpdir(), `${label.replace(/[^a-z0-9]+/gi, "-")}-smoke-`),
  );
  const sceneArguments = ["serve.py"];
  if (serverFlag) sceneArguments.push(serverFlag);
  sceneArguments.push(
    ...serverArguments,
    "--no-open",
    "--quiet",
    "--port",
    String(port),
  );
  const server = spawn(
    process.env.PYTHON_BIN ?? "python3",
    sceneArguments,
    { cwd: PROJECT_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  try {
    const baseUrl = await waitForServer(server, scenePath, 10_000);
    const url = `${baseUrl}${query}`;
    const [pageResponse, threeResponse] = await Promise.all([
      fetch(url),
      threeProbePath ? fetch(new URL(threeProbePath, url)) : null,
    ]);
    assert.equal(pageResponse.status, 200);
    if (threeResponse) assert.equal(threeResponse.status, 200);
    const result = await inspectPage({
      chrome,
      profile,
      url,
      readyState,
      timeoutMs,
      probeExpression,
    });
    return { ...result, url };
  } finally {
    await terminateChild(server);
    await rm(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  }
}

export async function smokeLocalScene(options) {
  const result = await runLocalSceneAutomation(options);
  process.stdout.write(
    `${options.label} smoke: OK (${result.requestCount} local requests, ${result.url})\n`,
  );
  return result;
}
