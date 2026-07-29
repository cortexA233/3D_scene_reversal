const DEFAULT_THRESHOLDS = Object.freeze({
  maximumMeanAbsoluteChannelError: 2.5,
  maximumP95AbsoluteChannelError: 8,
});

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

export function downsampleRgbaBox(pixels, width, height, factor) {
  if (!Number.isInteger(factor) || factor < 1) {
    throw new RangeError("downsample factor must be a positive integer");
  }
  if (width % factor !== 0 || height % factor !== 0) {
    throw new RangeError("source dimensions must be divisible by the factor");
  }
  const outputWidth = width / factor;
  const outputHeight = height / factor;
  const output = new Uint8Array(outputWidth * outputHeight * 4);
  const sampleCount = factor * factor;
  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const sums = [0, 0, 0, 0];
      for (let offsetY = 0; offsetY < factor; offsetY += 1) {
        for (let offsetX = 0; offsetX < factor; offsetX += 1) {
          const sourceOffset =
            ((y * factor + offsetY) * width + x * factor + offsetX) * 4;
          for (let channel = 0; channel < 4; channel += 1) {
            sums[channel] += pixels[sourceOffset + channel];
          }
        }
      }
      const outputOffset = (y * outputWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        output[outputOffset + channel] = Math.round(sums[channel] / sampleCount);
      }
    }
  }
  return output;
}

function isInteriorForeground(pixels, width, height, x, y) {
  if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) return false;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const offset = ((y + offsetY) * width + x + offsetX) * 4;
      if (pixels[offset] < 128) return false;
    }
  }
  return true;
}

export function evaluateScaleConsistency({
  highAlbedo,
  highWidth,
  highHeight,
  lowAlbedo,
  lowSilhouette,
  lowWidth,
  lowHeight,
}) {
  if (highWidth / lowWidth !== highHeight / lowHeight) {
    throw new RangeError("high and low captures must use one integer scale factor");
  }
  const factor = highWidth / lowWidth;
  const downsampled = downsampleRgbaBox(
    highAlbedo,
    highWidth,
    highHeight,
    factor,
  );
  const errors = [];
  let comparedPixels = 0;
  for (let y = 0; y < lowHeight; y += 1) {
    for (let x = 0; x < lowWidth; x += 1) {
      if (!isInteriorForeground(lowSilhouette, lowWidth, lowHeight, x, y)) continue;
      const offset = (y * lowWidth + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        errors.push(Math.abs(lowAlbedo[offset + channel] - downsampled[offset + channel]));
      }
      comparedPixels += 1;
    }
  }
  if (comparedPixels === 0) {
    throw new Error("scale-consistency comparison has no interior foreground pixels");
  }
  return {
    comparedPixels,
    meanAbsoluteChannelError:
      errors.reduce((sum, value) => sum + value, 0) / errors.length,
    p95AbsoluteChannelError: percentile(errors, 0.95),
  };
}

export async function runMaterialAliasingCheck({
  harness,
  viewIds = ["low-045", "low-135", "high-045"],
  highSize = 512,
  lowSize = 128,
  thresholds = DEFAULT_THRESHOLDS,
}) {
  const views = viewIds.map((viewId) => {
    const highAlbedo = harness.captureAtSize({
      viewId,
      passId: "albedo",
      target: "replacement",
      size: highSize,
    });
    const lowAlbedo = harness.captureAtSize({
      viewId,
      passId: "albedo",
      target: "replacement",
      size: lowSize,
    });
    const lowSilhouette = harness.captureAtSize({
      viewId,
      passId: "silhouette",
      target: "replacement",
      size: lowSize,
    });
    return {
      viewId,
      ...evaluateScaleConsistency({
        highAlbedo: highAlbedo.pixels,
        highWidth: highAlbedo.width,
        highHeight: highAlbedo.height,
        lowAlbedo: lowAlbedo.pixels,
        lowSilhouette: lowSilhouette.pixels,
        lowWidth: lowAlbedo.width,
        lowHeight: lowAlbedo.height,
      }),
    };
  });
  const aggregate = {
    worstMeanAbsoluteChannelError: Math.max(
      ...views.map((view) => view.meanAbsoluteChannelError),
    ),
    worstP95AbsoluteChannelError: Math.max(
      ...views.map((view) => view.p95AbsoluteChannelError),
    ),
  };
  const failures = [];
  if (
    aggregate.worstMeanAbsoluteChannelError >
    thresholds.maximumMeanAbsoluteChannelError
  ) {
    failures.push("mean-scale-inconsistency");
  }
  if (
    aggregate.worstP95AbsoluteChannelError >
    thresholds.maximumP95AbsoluteChannelError
  ) {
    failures.push("p95-scale-inconsistency");
  }
  return {
    schemaVersion: "material-scale-consistency-v1",
    captureSizes: { high: highSize, low: lowSize },
    thresholds,
    views,
    aggregate,
    passed: failures.length === 0,
    failures,
  };
}
