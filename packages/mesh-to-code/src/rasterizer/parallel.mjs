import { availableParallelism } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";

const WORKER_ENTRY = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "worker.mjs",
);

export function availableWorkerCount() {
  return Math.max(1, availableParallelism() - 1);
}

/**
 * Rasterize several beam candidates at once using Node's built-in
 * `worker_threads`. No dependency is added: the pool, the task queue, and the
 * transfer list are all standard library.
 *
 * Results come back keyed by candidate id rather than by completion order, so
 * the output is independent of how the operating system happened to schedule the
 * pool — a parallel run and a serial run produce the same bytes in the same
 * order.
 */
export async function rasterizeCandidatesInParallel({
  candidates,
  poses,
  size,
  workerCount = availableWorkerCount(),
}) {
  if (candidates.length === 0) return [];
  const poolSize = Math.max(1, Math.min(workerCount, candidates.length));
  const workers = [];
  const results = new Map();
  const queue = candidates.map((candidate, index) => ({ index, candidate }));

  try {
    await new Promise((resolve, reject) => {
      let outstanding = 0;
      let failed = false;

      const dispatch = (worker) => {
        const task = queue.shift();
        if (!task) {
          if (outstanding === 0 && !failed) resolve();
          return;
        }
        outstanding += 1;
        const positions = Float64Array.from(task.candidate.geometry.positions);
        const normals =
          task.candidate.geometry.normals === null
            ? null
            : Float64Array.from(task.candidate.geometry.normals);
        const indices = Uint32Array.from(task.candidate.geometry.indices);
        const transfer = [positions.buffer, indices.buffer];
        if (normals) transfer.push(normals.buffer);
        worker.postMessage(
          {
            taskId: task.index,
            positions: positions.buffer,
            normals: normals ? normals.buffer : null,
            indices: indices.buffer,
          },
          transfer,
        );
      };

      for (let index = 0; index < poolSize; index += 1) {
        const worker = new Worker(WORKER_ENTRY, {
          workerData: { poses, width: size, height: size },
        });
        workers.push(worker);
        worker.on("message", (message) => {
          outstanding -= 1;
          if (message.failure) {
            failed = true;
            reject(new Error(`rasterizer worker failed: ${message.failure}`));
            return;
          }
          results.set(message.taskId, message.views);
          dispatch(worker);
          if (outstanding === 0 && queue.length === 0 && !failed) resolve();
        });
        worker.on("error", (error) => {
          failed = true;
          reject(error);
        });
      }
      for (const worker of workers) dispatch(worker);
    });
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }

  return candidates.map((candidate, index) => ({
    candidateId: candidate.candidateId,
    views: (results.get(index) ?? []).map((view) => ({
      viewId: view.viewId,
      buffers: {
        width: size,
        height: size,
        silhouette: new Uint8Array(view.silhouette),
        depth: new Uint8Array(view.depth),
        worldNormal: new Uint8Array(view.worldNormal),
      },
    })),
  }));
}
