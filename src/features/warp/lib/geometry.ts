import type { Point } from "../../../shared/types";

export interface Cubic {
  p0: Point;
  c1: Point;
  c2: Point;
  p3: Point;
}

export const clone = (p: Point): Point => ({ x: p.x, y: p.y });
export const add = (a: Point, b: Point): Point => ({
  x: a.x + b.x,
  y: a.y + b.y,
});
export const sub = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
export const scale = (a: Point, k: number): Point => ({
  x: a.x * k,
  y: a.y * k,
});
export const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
export const distance = (a: Point, b: Point) =>
  Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
export function normalize(p: Point): Point {
  const l = Math.hypot(p.x, p.y);
  return l < 1e-12 ? { x: 0, y: 0 } : { x: p.x / l, y: p.y / l };
}

export function cubicAt(c: Cubic, t: number): Point {
  const s = 1 - t;
  const b0 = s * s * s,
    b1 = 3 * s * s * t,
    b2 = 3 * s * t * t,
    b3 = t * t * t;
  return {
    x: b0 * c.p0.x + b1 * c.c1.x + b2 * c.c2.x + b3 * c.p3.x,
    y: b0 * c.p0.y + b1 * c.c1.y + b2 * c.c2.y + b3 * c.p3.y,
  };
}

export function cubicDerivative(c: Cubic, t: number): Point {
  const s = 1 - t;
  const b0 = 3 * s * s,
    b1 = 6 * s * t,
    b2 = 3 * t * t;
  return {
    x: b0 * (c.c1.x - c.p0.x) + b1 * (c.c2.x - c.c1.x) + b2 * (c.p3.x - c.c2.x),
    y: b0 * (c.c1.y - c.p0.y) + b1 * (c.c2.y - c.c1.y) + b2 * (c.p3.y - c.c2.y),
  };
}

export function cubicSecondDerivative(c: Cubic, t: number): Point {
  const s = 1 - t;
  return {
    x:
      6 * s * (c.c2.x - 2 * c.c1.x + c.p0.x) +
      6 * t * (c.p3.x - 2 * c.c2.x + c.c1.x),
    y:
      6 * s * (c.c2.y - 2 * c.c1.y + c.p0.y) +
      6 * t * (c.p3.y - 2 * c.c2.y + c.c1.y),
  };
}

export function lineCubic(a: Point, b: Point): Cubic {
  const d = scale(sub(b, a), 1 / 3);
  return {
    p0: clone(a),
    c1: add(a, d),
    c2: sub(b, d),
    p3: clone(b),
  };
}

export function distanceToSegment(p: Point, a: Point, b: Point) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 < 1e-20) return distance(p, a);
  let t = dot(sub(p, a), ab) / l2;
  t = Math.max(0, Math.min(1, t));
  return distance(p, add(a, scale(ab, t)));
}

export function dedupe(points: Point[], eps = 1e-7) {
  const out: Point[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (!last || distance(last, p) > eps) out.push(p);
  }
  return out;
}
