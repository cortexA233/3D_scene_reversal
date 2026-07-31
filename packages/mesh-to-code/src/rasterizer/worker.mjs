import { parentPort, workerData } from "node:worker_threads";

import { rasterizeView } from "./rasterize.mjs";

/**
 * One beam candidate per task. Buffers are returned as transferable
 * `ArrayBuffer`s so the parent takes ownership without a structured-clone copy.
 */
if (!parentPort) {
  throw new Error("this module is a worker entry point and needs a parent port");
}

const { poses, width, height } = workerData;

parentPort.on("message", (message) => {
  if (message.type === "close") {
    parentPort.close();
    return;
  }
  const { taskId, positions, normals, indices } = message;
  try {
    const views = poses.map((pose) => {
      const buffers = rasterizeView({
        positions: new Float64Array(positions),
        normals: normals === null ? null : new Float64Array(normals),
        indices: new Uint32Array(indices),
        pose,
        width,
        height,
      });
      return {
        viewId: pose.id,
        silhouette: buffers.silhouette.buffer,
        depth: buffers.depth.buffer,
        worldNormal: buffers.worldNormal.buffer,
      };
    });
    parentPort.postMessage(
      { taskId, views },
      views.flatMap((view) => [view.silhouette, view.depth, view.worldNormal]),
    );
  } catch (error) {
    parentPort.postMessage({
      taskId,
      failure: error instanceof Error ? error.message : String(error),
    });
  }
});
