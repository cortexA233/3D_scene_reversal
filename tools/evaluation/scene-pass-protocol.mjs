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

/**
 * The camera half of the protocol: capture size, device scale, frozen moment,
 * camera count, and per-camera matrix and clipping fidelity.
 *
 * The calibration run has to satisfy exactly this and violate one of the subject
 * rules below — it mutates the reference on purpose — so the two halves are
 * separate functions rather than one that calibration would have to be excused
 * from.
 */
export function verifyFrozenCameraProtocol({ report, contract }) {
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
  return errors;
}

export function verifyScenePassProtocol({ report, contract }) {
  const errors = verifyFrozenCameraProtocol({ report, contract });
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

/**
 * The calibration run's protocol.
 *
 * Calibration is the one place that mutates the reference, because a threshold
 * for a rendered metric has to come from rendered damage. What makes that
 * legitimate is not a promise: the run declares the damage, snapshots what it
 * touches, and proves the restore put the scene back — both numerically and by
 * re-capturing a frame and comparing it to the undamaged one byte for byte. A
 * run that cannot prove its own restore is not evidence, because every later
 * control in the same session would be measuring against a damaged baseline.
 */
export function verifyCalibrationCaptureProtocol({ report, contract }) {
  const errors = verifyFrozenCameraProtocol({ report, contract });
  const mutation = report?.mutation;
  if (mutation?.declared !== true) {
    errors.push("the calibration run did not declare that it mutates the reference");
  }
  if (mutation?.restored !== true) {
    errors.push("the calibration run did not restore the reference after its damage");
  }
  if (mutation?.restoreVerified !== true) {
    errors.push(
      `the restore was not verified against the pre-damage snapshot: ${
        mutation?.restoreFailures?.join("; ") ?? "no audit was recorded"
      }`,
    );
  }
  if (mutation?.restoredFrameIdentical !== true) {
    errors.push(
      "the frame re-captured after restoring is not identical to the undamaged frame, so later controls measured against a damaged baseline",
    );
  }
  if (report?.subjects?.candidateModulesLoaded?.length > 0) {
    errors.push(
      `the calibration page loaded candidate modules: ${report.subjects.candidateModulesLoaded.join(", ")}`,
    );
  }
  return errors;
}
