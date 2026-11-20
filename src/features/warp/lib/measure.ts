import type { Bounds, Node, Point } from "../../../shared/types";
import { cubicAt, distanceToSegment } from "./geometry";
import {
  mapFor,
  referenceSegment,
  segmentCubic,
  segmentsOf,
  warpContour,
} from "./contour";
import type { Surface } from "./surface";

/** Dense polyline of the exact warped contour, used as the error reference. */
export function referencePolyline(
  nodes: Node[],
  closed: boolean,
  surface: Surface,
  bounds: Bounds,
): Point[] {
  const map = mapFor(surface, bounds);
  const out: Point[] = [];
  for (const { a, b } of segmentsOf(nodes, closed))
    out.push(...referenceSegment(segmentCubic(a, b), map));
  return out;
}

/**
 * Largest distance from any point of the approximation to the exact warped
 * contour. This is what a viewer can actually see: the drawn path drifting
 * away from where the warp puts it.
 */
export function maxDeviation(
  nodes: Node[],
  closed: boolean,
  approx: Node[],
  surface: Surface,
  bounds: Bounds,
) {
  if (nodes.length < 2 || approx.length < 2) return Infinity;
  const reference = referencePolyline(nodes, closed, surface, bounds);
  let max = 0;
  for (const { a, b } of segmentsOf(approx, closed)) {
    const piece = segmentCubic(a, b);
    for (let i = 0; i <= 24; i++) {
      const p = cubicAt(piece, i / 24);
      let best = Infinity;
      for (let k = 0; k < reference.length - 1; k++)
        best = Math.min(
          best,
          distanceToSegment(p, reference[k], reference[k + 1]),
        );
      if (best > max) max = best;
    }
  }
  return max;
}

export function measureApproximation(
  nodes: Node[],
  closed: boolean,
  surface: Surface,
  bounds: Bounds,
  tolerance: number,
) {
  const approx = warpContour(nodes, closed, surface, bounds, { tolerance });
  return {
    nodes: approx,
    points: approx.length,
    error: maxDeviation(nodes, closed, approx, surface, bounds),
  };
}
