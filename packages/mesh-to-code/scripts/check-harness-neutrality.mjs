import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const PACKAGE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const CLI = path.join(PACKAGE_ROOT, "bin", "mesh-reverse.mjs");

/**
 * Neutrality is enforced by checks rather than by intent:
 *
 *  1. SKILL.md names no harness-specific tool or mechanism.
 *  2. Every Decision Point publishes numeric evidence; imagery stays optional.
 *  3. The full pipeline runs with the mock decider in an environment with no
 *     agent harness installed.
 */

/**
 * Tool and mechanism names that would tie the contract to one harness. Product
 * names are listed separately from tool names so a diagnostic message can say
 * which rule a hit broke.
 */
const HARNESS_TOOL_NAMES = [
  "AskUserQuestion",
  "BashTool",
  "Bash tool",
  "Edit tool",
  "MultiEdit",
  "NotebookEdit",
  "Read tool",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Write tool",
  "apply_patch",
  "developer message",
  "function_call",
  "hooks",
  "mcp",
  "shell tool",
  "slash command",
  "subagent",
  "system prompt",
  "tool_use",
];

const HARNESS_PRODUCT_NAMES = [
  "AGENTS.md",
  "CLAUDE.md",
  "Claude Code",
  "Codex",
  "Copilot",
  "Cursor",
  "GEMINI.md",
  "Gemini CLI",
  "Windsurf",
  ".claude",
  ".codex",
  ".cursor",
];

/** Environment variables an agent harness may export, scrubbed before the run. */
const HARNESS_ENVIRONMENT_PREFIXES = [
  "CLAUDE",
  "ANTHROPIC",
  "CODEX",
  "OPENAI",
  "CURSOR",
  "COPILOT",
  "GEMINI",
  "AIDER",
  "WINDSURF",
];

const failures = [];
const notes = [];

const skill = await readFile(path.join(PACKAGE_ROOT, "SKILL.md"), "utf8");
for (const [rule, names] of [
  ["harness-specific tool", HARNESS_TOOL_NAMES],
  ["harness product", HARNESS_PRODUCT_NAMES],
]) {
  for (const name of names) {
    if (new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(skill)) {
      failures.push(`SKILL.md names the ${rule} "${name}"`);
    }
  }
}
notes.push(`SKILL.md scanned for ${HARNESS_TOOL_NAMES.length + HARNESS_PRODUCT_NAMES.length} harness-specific names`);

const scrubbedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter(
    ([key]) =>
      !HARNESS_ENVIRONMENT_PREFIXES.some((prefix) => key.toUpperCase().startsWith(prefix)),
  ),
);
const scrubbedCount =
  Object.keys(process.env).length - Object.keys(scrubbedEnvironment).length;
notes.push(`scrubbed ${scrubbedCount} harness environment variable(s) before running`);

const workspace = await mkdtemp(path.join(tmpdir(), "mesh-to-code-neutrality-"));
try {
  const runCli = (args) =>
    execFile(process.execPath, [CLI, ...args], {
      cwd: workspace,
      env: scrubbedEnvironment,
      maxBuffer: 32 * 1024 * 1024,
    }).then(
      (result) => ({ code: 0, ...result }),
      (error) => ({ code: error.code ?? 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" }),
    );

  const fixture = path.join(workspace, "unit.obj");
  const mockOut = path.join(workspace, "mock");
  const suspendedOut = path.join(workspace, "suspended");

  const generated = await runCli(["fixture", "--kind", "lathe-profile", "--out", fixture]);
  if (generated.code !== 0) failures.push(`fixture generation failed: ${generated.stderr}`);

  const mockRun = await runCli([
    "run",
    "--input",
    fixture,
    "--out",
    mockOut,
    "--decider",
    "mock",
    "--inline",
  ]);
  if (mockRun.code !== 0) {
    failures.push(`mock pipeline exited ${mockRun.code}: ${mockRun.stderr}`);
  } else {
    notes.push("full pipeline completed with the mock decider and no harness present");
  }

  // A text-only decider: answer the published evidence by writing a file, with
  // no imagery consulted and nothing harness-specific involved.
  const suspended = await runCli(["run", "--input", fixture, "--out", suspendedOut]);
  if (suspended.code !== 2) {
    failures.push(`expected suspension exit code 2, got ${suspended.code}`);
  }
  const pendingFile = path.join(suspendedOut, "state", "pending-decision.json");
  const pending = JSON.parse(await readFile(pendingFile, "utf8"));
  if (!Array.isArray(pending.imagery) || pending.imagery.length !== 0) {
    failures.push("pending decision required imagery, so a text-only decider is blocked");
  }
  const nonNumeric = Object.entries(pending.evidence).filter(
    ([, value]) => typeof value !== "number" && typeof value !== "object",
  );
  if (nonNumeric.length > 0) {
    failures.push(
      `pending evidence carried non-numeric top-level fields: ${nonNumeric
        .map(([key]) => key)
        .join(", ")}`,
    );
  }
  await writeFile(
    path.join(suspendedOut, "state", "decision.json"),
    `${JSON.stringify(
      {
        schemaVersion: "mesh-to-code-decision-v1",
        runId: pending.runId,
        round: pending.round,
        decisionPoint: pending.decisionPoint,
        response: {
          units: [
            {
              unitId: "unit-0",
              components: pending.evidence.components.map(
                (component) => component.componentIndex,
              ),
            },
          ],
        },
        decider: { kind: "text-only-file-writer" },
      },
      null,
      2,
    )}\n`,
  );
  const resumed = await runCli([
    "run",
    "--input",
    fixture,
    "--out",
    suspendedOut,
    "--resume",
    "--inline",
  ]);
  if (resumed.code !== 0) {
    failures.push(`resumed run exited ${resumed.code}: ${resumed.stderr}`);
  } else {
    notes.push("a text-only decider answered by writing one file and the run resumed");
  }

  for (const relative of ["runtime/recipe.js", "runtime/generator.js", "evidence/evidence.json"]) {
    await readFile(path.join(mockOut, relative), "utf8");
  }
} finally {
  await rm(workspace, { recursive: true, force: true });
}

for (const note of notes) process.stdout.write(`  · ${note}\n`);
if (failures.length > 0) {
  process.stderr.write(`harness neutrality: FAIL\n`);
  for (const failure of failures) process.stderr.write(`  × ${failure}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("harness neutrality: PASS\n");
}
