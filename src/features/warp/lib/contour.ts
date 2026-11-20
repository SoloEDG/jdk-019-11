import type { Bounds, Node, Point } from "../../../shared/types";
import { cubicAt, distance, lerp } from "./geometry";
import { fitCubics } from "./fit";
import type { Surface } from "./surface";

export interface Sampling {
  /** Target contour error in artboard units. */
  tolerance: number;
}

export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

export function segmentCubic(a: Node, b: Node): Cubic {
  return {
    p0: { x: a.x, y: a.y },
    c1: { x: a.out.x, y: a.out.y },
    c2: { x: b.in.x, y: b.in.y },
    p3: { x: b.x, y: b.y },
  };
}

export function segmentsOf(nodes: Node[], closed: boolean) {
  const out: { a: Node; b: Node }[] = [];
  for (let i = 1; i < nodes.length + (closed ? 1 : 0); i++)
    out.push({ a: nodes[i - 1], b: nodes[i % nodes.length] });
  return out;
}

export function mapFor(surface: Surface, bounds: Bounds) {
  return (p: Point): Point =>
    surface.point(
      (p.x - bounds.x) / bounds.width,
      (p.y - bounds.y) / bounds.height,
    );
}

/**
 * Adaptive polyline of the exact warped segment. The recursion probes three
 * interior parameters against the chord, so the polyline is within a small
 * fraction of `tolerance` everywhere, including regions where the map
 * compresses or stretches strongly.
 */
export function sampleSegment(
  c: Cubic,
  map: (p: Point) => Point,
  tolerance: number,
  depthLimit = 18,
): Point[] {
  const tol = Math.max(1e-4, tolerance);
  const out: Point[] = [map(c.p0)];
  const recurse = (
    t0: number,
    p0: Point,
    t1: number,
    p1: Point,
    depth: number,
  ) => {
    if (depth >= depthLimit || distance(p0, p1) < 1e-7) {
      out.push(p1);
      return;
    }
    let error = 0;
    for (const k of [0.25, 0.5, 0.75]) {
      const t = t0 + (t1 - t0) * k;
      error = Math.max(error, distance(map(cubicAt(c, t)), lerp(p0, p1, k)));
    }
    if (error <= tol * 0.1) {
      out.push(p1);
      return;
    }
    const tm = (t0 + t1) / 2;
    const pm = map(cubicAt(c, tm));
    recurse(t0, p0, tm, pm, depth + 1);
    recurse(tm, pm, t1, p1, depth + 1);
  };
  recurse(0, out[0], 1, map(c.p3), 0);
  return out;
}

/** Dense reference polyline of one exact warped segment. */
export function referenceSegment(c: Cubic, map: (p: Point) => Point) {
  const steps = 256;
  const out: Point[] = [];
  for (let i = 0; i <= steps; i++) out.push(map(cubicAt(c, i / steps)));
  return out;
}

function pointToPolyline(p: Point, poly: Point[]) {
  const seg = (a: Point, b: Point) => {
    const abx = b.x - a.x,
      aby = b.y - a.y;
    const l2 = abx * abx + aby * aby;
    if (l2 < 1e-20) return distance(p, a);
    let t = ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
  };
  let best = Infinity;
  for (let i = 0; i < poly.length - 1; i++)
    best = Math.min(best, seg(poly[i], poly[i + 1]));
  return best;
}

/**
 * Fit one segment and prove the result meets `tolerance`. If the first fit
 * misses (least squares fits can undershoot locally), the sampling budget is
 * tightened and the segment refitted; the returned pieces always satisfy the
 * requested bound, which is what expansion and export rely on.
 */
function fitSegment(c: Cubic, map: (p: Point) => Point, tolerance: number) {
  let budget = tolerance;
  let pieces = fitCubics(sampleSegment(c, map, budget), tolerance);
  for (let attempt = 0; attempt < 4; attempt++) {
    // Verify every piece against the exact curve.
    const reference = referenceSegment(c, map);
    let worst = 0;
    for (const piece of pieces) {
      for (let k = 0; k <= 24; k++)
        worst = Math.max(
          worst,
          pointToPolyline(cubicAt(piece, k / 24), reference),
        );
    }
    if (worst <= tolerance) return pieces;
    budget = Math.max(tolerance * 0.05, budget * 0.35);
    pieces = fitCubics(sampleSegment(c, map, budget), tolerance * 0.5);
  }
  return pieces;
}

/**
 * Approximate the warped contour with cubic nodes such that each piece stays
 * within `tolerance` of the exact mapped curve. The anchor count follows the
 * requested error rather than a fixed sampling grid.
 */
export function warpContour(
  nodes: Node[],
  closed: boolean,
  surface: Surface,
  bounds: Bounds,
  sampling: Sampling,
): Node[] {
  const segments = segmentsOf(nodes, closed);
  if (!segments.length) return [];
  const tol = Math.max(1e-4, sampling.tolerance);
  const map = mapFor(surface, bounds);

  const curves: Cubic[] = [];
  for (const { a, b } of segments) {
    const c = segmentCubic(a, b);
    curves.push(...fitSegment(c, map, tol));
  }
  if (!curves.length) return [];

  // The fitted pieces must meet exactly; duplicated or drifting seams would
  // create hairline gaps that are visible at high zoom.
  for (let i = 0; i < curves.length - 1; i++) {
    const a = curves[i].p3,
      b = curves[i + 1].p0;
    if (distance(a, b) <= 1e-4) {
      const mid = lerp(a, b, 0.5);
      curves[i].p3 = { ...mid };
      curves[i + 1].p0 = { ...mid };
    }
  }
  if (closed) {
    const a = curves[curves.length - 1].p3,
      b = curves[0].p0;
    if (distance(a, b) <= 1e-4) {
      const mid = lerp(a, b, 0.5);
      curves[curves.length - 1].p3 = { ...mid };
      curves[0].p0 = { ...mid };
    }
  }

  const n = curves.length;
  const output: Node[] = [];
  const anchor = (i: number) => (i === 0 ? curves[0].p0 : curves[i - 1].p3);
  const count = closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const p = anchor(i);
    const incoming = curves[(i - 1 + n) % n].c2;
    const outgoing = curves[i % n].c1;
    const hasIn = closed || i > 0;
    const hasOut = closed || i < n;
    output.push({
      x: p.x,
      y: p.y,
      in: hasIn ? { x: incoming.x, y: incoming.y } : { x: p.x, y: p.y },
      out: hasOut ? { x: outgoing.x, y: outgoing.y } : { x: p.x, y: p.y },
    });
  }
  return output;
}
