/**
 * Scene pass protocol.
 *
 * Every blocking pass must be captured through the exact frozen camera
 * matrices, at the Normative Scene Capture size and device scale, at a declared
 * Frozen Observation Clock moment, with each subject rendered by its own
 * materials and lights.
 *
 * This is what makes a comparison mean anything: a candidate that reframes
 * itself, a run that borrows the reference's lighting, or a reference capture
 * that has been altered all fail here rather than producing a flattering
 * number downstream.
 */

export const PROTOCOL_TOLERANCE = 1e-5;
export const REQUIRED_CAMERAS = 6;

export function verifyScenePassProtocol({ report, contract }) {
  const errors = [];
  const expectedFramebuffer = JSON.stringify(contract.capture.framebuffer);

  if (JSON.stringify(report?.capture?.framebuffer) !== expectedFramebuffer) {
    errors.push(
      `capture framebuffer ${JSON.stringify(report?.capture?.framebuffer)} is not the Normative Scene Capture ${expectedFramebuffer}`,
    );
  }
  if (report?.capture?.deviceScaleFactor !== contract.capture.deviceScaleFactor) {
    errors.push(
      `device scale factor ${report?.capture?.deviceScaleFactor} is not ${contract.capture.deviceScaleFactor}`,
    );
  }
  if (report?.capture?.momentMs !== contract.clock.primaryMomentMs) {
    errors.push(
      `passes were captured at moment ${report?.capture?.momentMs} rather than the frozen ${contract.clock.primaryMomentMs}`,
    );
  }
  if (!Array.isArray(report?.protocol) || report.protocol.length !== REQUIRED_CAMERAS) {
    errors.push(`the frozen Scene Evaluation Camera Set has ${REQUIRED_CAMERAS} cameras`);
  }
  for (const row of report?.protocol ?? []) {
    if (!(row.viewMatrixDelta <= PROTOCOL_TOLERANCE)) {
      errors.push(
        `${row.camera}: view matrix differs from the frozen set by ${row.viewMatrixDelta}`,
      );
    }
    if (!(row.projectionMatrixDelta <= PROTOCOL_TOLERANCE)) {
      errors.push(
        `${row.camera}: projection matrix differs from the frozen set by ${row.projectionMatrixDelta}`,
      );
    }
    if (JSON.stringify(row.framebuffer) !== expectedFramebuffer) {
      errors.push(`${row.camera}: framebuffer ${JSON.stringify(row.framebuffer)} drifted`);
    }
    if (row.near !== contract.cameras.authoredOverview.near) {
      errors.push(`${row.camera}: near plane ${row.near} drifted`);
    }
    if (row.far !== contract.cameras.authoredOverview.far) {
      errors.push(`${row.camera}: far plane ${row.far} drifted`);
    }
    if (
      row.referenceViewMatrixDelta !== undefined &&
      !(row.referenceViewMatrixDelta <= PROTOCOL_TOLERANCE)
    ) {
      errors.push(
        `${row.camera}: the native reference capture used a different framing, off by ${row.referenceViewMatrixDelta}`,
      );
    }
  }
  if (report?.subjects?.sharedLighting) {
    errors.push("appearance evidence must not give both subjects the same injected lighting");
  }
  if (report?.subjects?.referenceMutated) {
    errors.push("the Immutable Reference Capture was modified during the run");
  }
  if (report?.subjects?.candidateReframed) {
    errors.push("the candidate was framed from itself rather than from the frozen cameras");
  }
  return errors;
}
