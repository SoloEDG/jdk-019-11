import type { Point } from "../../../shared/types";
import {
  add,
  clone,
  cubicAt,
  cubicDerivative,
  cubicSecondDerivative,
  dedupe,
  distance,
  dot,
  lineCubic,
  normalize,
  scale,
  sub,
  type Cubic,
} from "./geometry";

function chordParameters(points: Point[]) {
  const u = [0];
  for (let i = 1; i < points.length; i++)
    u.push(u[i - 1] + Math.max(1e-9, distance(points[i], points[i - 1])));
  const total = Math.max(1e-9, u[u.length - 1]);
  return u.map((v) => v / total);
}

function tangentAt(points: Point[], start: boolean) {
  const n = points.length;
  const base = points[start ? 0 : n - 1];
  for (let k = 1; k < n; k++) {
    const p = points[start ? k : n - 1 - k];
    if (distance(base, p) > 1e-7) return normalize(sub(p, base));
  }
  return { x: 1, y: 0 };
}

interface Fit {
  curve: Cubic;
  error: number;
  split: number;
}

function generateBezier(
  points: Point[],
  u: number[],
  t1: Point,
  t2: Point,
): Fit {
  const n = points.length;
  const p0 = points[0],
    p3 = points[n - 1];
  const A: [Point, Point][] = [];
  for (let i = 0; i < n; i++) {
    const t = u[i],
      b = 1 - t;
    A.push([scale(t1, 3 * b * b * t), scale(t2, 3 * b * t * t)]);
  }
  let c00 = 0,
    c01 = 0,
    c11 = 0,
    x0 = 0,
    x1 = 0;
  for (let i = 0; i < n; i++) {
    const t = u[i],
      b = 1 - t;
    const b0 = b * b * b,
      b1 = 3 * b * b * t,
      b2 = 3 * b * t * t,
      b3 = t * t * t;
    const tmp = {
      x: points[i].x - (p0.x * (b0 + b1) + p3.x * (b2 + b3)),
      y: points[i].y - (p0.y * (b0 + b1) + p3.y * (b2 + b3)),
    };
    c00 += dot(A[i][0], A[i][0]);
    c01 += dot(A[i][0], A[i][1]);
    c11 += dot(A[i][1], A[i][1]);
    x0 += dot(A[i][0], tmp);
    x1 += dot(A[i][1], tmp);
  }
  const det = c00 * c11 - c01 * c01;
  let alpha = 0,
    beta = 0;
  if (Math.abs(det) > 1e-12) {
    alpha = (x0 * c11 - x1 * c01) / det;
    beta = (c00 * x1 - c01 * x0) / det;
  }
  const chord = distance(p0, p3);
  if (
    !Number.isFinite(alpha) ||
    !Number.isFinite(beta) ||
    alpha < 1e-6 ||
    beta < 1e-6
  ) {
    alpha = beta = Math.max(chord / 3, 1e-6);
  }
  const cap = Math.max(chord * 3, 1e-3);
  alpha = Math.min(alpha, cap);
  beta = Math.min(beta, cap);
  const curve: Cubic = {
    p0: clone(p0),
    c1: add(p0, scale(t1, alpha)),
    c2: add(p3, scale(t2, beta)),
    p3: clone(p3),
  };
  let error = 0,
    split = n >> 1;
  for (let i = 0; i < n; i++) {
    const e = distance(points[i], cubicAt(curve, u[i]));
    if (e > error) {
      error = e;
      split = i;
    }
  }
  return { curve, error, split };
}

function reparametrize(points: Point[], u: number[], curve: Cubic) {
  for (let i = 1; i < points.length - 1; i++) {
    const t = u[i];
    const q = cubicAt(curve, t);
    const d1 = cubicDerivative(curve, t);
    const d2 = cubicSecondDerivative(curve, t);
    const diff = sub(q, points[i]);
    const den = dot(d1, d1) + dot(diff, d2);
    if (Math.abs(den) < 1e-12) continue;
    let next = t - dot(diff, d1) / den;
    next = Math.max(u[i - 1] + 1e-9, Math.min(u[i + 1] - 1e-9, next));
    if (Number.isFinite(next)) u[i] = next;
  }
  u[u.length - 1] = 1;
}

/**
 * Least-squares cubic fitting with adaptive splitting (Schneider style).
 * Every returned piece stays within `tolerance` of the supplied samples.
 */
export function fitCubics(raw: Point[], tolerance: number, depth = 0): Cubic[] {
  const points = dedupe(raw);
  if (points.length < 2) return [];
  if (points.length === 2) return [lineCubic(points[0], points[1])];
  const tol = Math.max(1e-5, tolerance);
  const t1 = tangentAt(points, true);
  const t2 = tangentAt(points, false);
  const u = chordParameters(points);
  let fit = generateBezier(points, u, t1, t2);
  if (fit.error > tol && fit.error < tol * 8) {
    for (let k = 0; k < 3 && fit.error > tol; k++) {
      reparametrize(points, u, fit.curve);
      const next = generateBezier(points, u, t1, t2);
      if (next.error >= fit.error) break;
      fit = next;
    }
  }
  if (fit.error <= tol) return [fit.curve];
  if (depth > 24) return [lineCubic(points[0], points[points.length - 1])];
  let split = fit.split;
  if (split <= 0 || split >= points.length - 1) split = points.length >> 1;
  const left = points.slice(0, split + 1);
  const right = points.slice(split);
  if (left.length < 2 || right.length < 2)
    return [lineCubic(points[0], points[points.length - 1])];
  return [
    ...fitCubics(left, tol, depth + 1),
    ...fitCubics(right, tol, depth + 1),
  ];
}
