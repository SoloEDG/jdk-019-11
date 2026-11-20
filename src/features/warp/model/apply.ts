import { doc } from "../../../shared/document";
import type { Node, Shape, WarpSpace } from "../../../shared/types";
import { warpContour } from "../lib/contour";
import { maxDeviation, measureApproximation } from "../lib/measure";
import { isIdentity, surfaceFor } from "../lib/surface";

/** Guaranteed for expansion and SVG export, regardless of preview setting. */
export const EXPORT_TOLERANCE = 0.05;
export const DISPLAY_MIN_TOLERANCE = 0.02;
export const DISPLAY_MAX_TOLERANCE = 1.2;

/**
 * Preview resolution. It uses exactly the accuracy the user chose — the same
 * tolerance expansion and export bake — and additionally refines when the
 * artboard is magnified, so zooming in reveals more detail instead of
 * enlarging an approximation. The two can only differ by a fraction of a
 * screen pixel at the zoom where the difference appears.
 */
export function previewTolerance(space: WarpSpace, zoom: number) {
  const cap = EXPORT_TOLERANCE / Math.min(2, Math.max(0.2, zoom));
  return Math.min(space.detail, cap);
}

/** Expanded paths are exact enough to export at any zoom. */
export function bakedTolerance(space: WarpSpace) {
  return Math.min(space.detail, EXPORT_TOLERANCE);
}

export function spaceOf(shape: Shape): WarpSpace | undefined {
  if (!shape.warp) return undefined;
  return doc.warps.find((w) => w.id === shape.warp!.space);
}

export function isExpanded(shape: Shape) {
  return !!shape.warp?.baked;
}

/** Nodes the user should manipulate for this shape. */
export function editableNodes(shape: Shape): Node[] {
  return shape.warp?.baked ?? shape.nodes;
}

/**
 * The outline that is painted. A live effect is recomputed from the master
 * nodes on demand; an expanded effect paints the baked approximation. Both
 * routes use the same warp space, so the artwork never drifts between states.
 */
export function outline(shape: Shape, tolerance?: number): Node[] {
  if (!shape.warp) return shape.nodes;
  if (shape.warp.baked) return shape.warp.baked;
  return approximate(shape, tolerance ?? spaceOf(shape)?.detail ?? 0.15);
}

export function exportOutline(shape: Shape): Node[] {
  if (!shape.warp) return shape.nodes;
  if (shape.warp.baked) return shape.warp.baked;
  return approximate(shape, EXPORT_TOLERANCE);
}

function approximate(shape: Shape, tolerance: number) {
  const space = spaceOf(shape);
  if (!space) return shape.nodes;
  if (isIdentity(space)) return shape.nodes;
  const surface = surfaceFor(space);
  if (!surface) return shape.nodes;
  return warpContour(shape.nodes, shape.closed, surface, space.bounds, {
    tolerance: Math.min(tolerance, space.detail),
  });
}

export function approximationFor(shape: Shape, tolerance?: number) {
  const space = spaceOf(shape);
  if (!space) return undefined;
  const surface = surfaceFor(space);
  if (!surface) return undefined;
  if (shape.warp?.baked) {
    return {
      nodes: shape.warp.baked,
      points: shape.warp.baked.length,
      error: maxDeviation(
        shape.nodes,
        shape.closed,
        shape.warp.baked,
        surface,
        space.bounds,
      ),
    };
  }
  return measureApproximation(
    shape.nodes,
    shape.closed,
    surface,
    space.bounds,
    Math.min(tolerance ?? space.detail, space.detail),
  );
}
