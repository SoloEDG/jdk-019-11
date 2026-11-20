import type { Bounds, Point, WarpSpace } from "../../../shared/types";

export interface Surface {
  point(u: number, v: number): Point;
  /** Determinant of the surface Jacobian at (u, v). */
  jacobian(u: number, v: number): number;
}

const EPS = 1e-9;

function finite(p: Point) {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

function cross(a: Point, b: Point, c: Point) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function boundsArea(b: Bounds) {
  return Math.max(1e-6, b.width * b.height);
}

export interface Perspective {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  g: number;
  h: number;
}

/** Homography taking (u,v) in the unit square to quad TL, TR, BR, BL. */
export function perspectiveMatrix(quad: Point[]): Perspective | null {
  const [p0, p1, p2, p3] = quad;
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-8) {
    if (Math.abs(dx3) > 1e-8 || Math.abs(dy3) > 1e-8) return null;
    return {
      a: p1.x - p0.x,
      b: p3.x - p0.x,
      c: p0.x,
      d: p1.y - p0.y,
      e: p3.y - p0.y,
      f: p0.y,
      g: 0,
      h: 0,
    };
  }
  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;
  return {
    a: p1.x - p0.x + g * p1.x,
    b: p3.x - p0.x + h * p3.x,
    c: p0.x,
    d: p1.y - p0.y + g * p1.y,
    e: p3.y - p0.y + h * p3.y,
    f: p0.y,
    g,
    h,
  };
}

export function perspectivePoint(m: Perspective, u: number, v: number): Point {
  const w = m.g * u + m.h * v + 1;
  if (Math.abs(w) < 1e-12) return { x: NaN, y: NaN };
  return { x: (m.a * u + m.b * v + m.c) / w, y: (m.d * u + m.e * v + m.f) / w };
}

function perspectiveJacobian(m: Perspective, u: number, v: number) {
  const w = m.g * u + m.h * v + 1;
  if (Math.abs(w) < 1e-12) return NaN;
  const xn = m.a * u + m.b * v + m.c,
    yn = m.d * u + m.e * v + m.f;
  const xu = (m.a * w - xn * m.g) / (w * w);
  const xv = (m.b * w - xn * m.h) / (w * w);
  const yu = (m.d * w - yn * m.g) / (w * w);
  const yv = (m.e * w - yn * m.h) / (w * w);
  return xu * yv - xv * yu;
}

function perspectiveSurface(space: WarpSpace): Surface | null {
  const m = perspectiveMatrix(space.quad);
  if (!m) return null;
  return {
    point: (u, v) => perspectivePoint(m, u, v),
    jacobian: (u, v) => perspectiveJacobian(m, u, v),
  };
}

export function latticeUV(space: WarpSpace, index: number) {
  const { rows, cols } = space.mesh;
  return {
    u: (index % cols) / (cols - 1),
    v: Math.floor(index / cols) / (rows - 1),
  };
}

/** Cell index and local parameter for a value in [0, 1]. */
function cell(t: number, count: number) {
  const x = Math.min(Math.max(t, 0), 1) * (count - 1);
  let i = Math.floor(x);
  if (i > count - 2) i = count - 2;
  if (i < 0) i = 0;
  return { i, s: Math.min(1, Math.max(0, x - i)) };
}

/**
 * Offset field of the free envelope: the handle displacement from the
 * projective base, interpolated bilinearly inside each cell. Interpolation is
 * exact at the handles, so a drag moves that point one-to-one, and the
 * influence of one handle stays local to its four neighbouring cells — the
 * standard behaviour of a mesh warp.
 */
function residualWeights(space: WarpSpace, u: number, v: number) {
  const { rows, cols } = space.mesh;
  const cu = cell(u, cols),
    cv = cell(v, rows);
  const base = perspectiveMatrix(space.quad);
  const offsets = [
    [0, 0],
    [0, 0],
    [0, 0],
    [0, 0],
  ];
  const weights = [0, 0, 0, 0];
  let index = 0;
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) {
      const r = cv.i + a,
        c = cu.i + b;
      const i = r * cols + c;
      const handle = space.mesh.points[i];
      const b0 = base
        ? perspectivePoint(base, c / (cols - 1), r / (rows - 1))
        : handle;
      offsets[index] = [handle.x - b0.x, handle.y - b0.y];
      weights[index] =
        (b === 0 ? 1 - cu.s : cu.s) * (a === 0 ? 1 - cv.s : cv.s);
      index++;
    }
  return { offsets, weights, cu, cv };
}

function residual(space: WarpSpace, u: number, v: number) {
  const { offsets, weights } = residualWeights(space, u, v);
  let x = 0,
    y = 0;
  for (let i = 0; i < 4; i++) {
    x += weights[i] * offsets[i][0];
    y += weights[i] * offsets[i][1];
  }
  return { x, y };
}

function residualDerivatives(space: WarpSpace, u: number, v: number) {
  const { offsets } = residualWeights(space, u, v);
  const { rows, cols } = space.mesh;
  // d/ds of (1-s) and s, scaled by the number of cells along each axis.
  const du = cols - 1,
    dv = rows - 1;
  const cu = cell(u, cols),
    cv = cell(v, rows);
  let xu = 0,
    yu = 0,
    xv = 0,
    yv = 0;
  // Offsets are ordered [a=0,b=0], [a=0,b=1], [a=1,b=0], [a=1,b=1].
  const wu = [1 - cu.s, cu.s],
    wv = [1 - cv.s, cv.s];
  for (let a = 0; a < 2; a++)
    for (let b = 0; b < 2; b++) {
      const i = a * 2 + b;
      const [dx, dy] = offsets[i];
      xu += (b === 0 ? -1 : 1) * wv[a] * du * dx;
      yu += (b === 0 ? -1 : 1) * wv[a] * du * dy;
      xv += (a === 0 ? -1 : 1) * wu[b] * dv * dx;
      yv += (a === 0 ? -1 : 1) * wu[b] * dv * dy;
    }
  return { xu, yu, xv, yv };
}

function envelopeSurface(space: WarpSpace): Surface {
  const base = perspectiveMatrix(space.quad);
  if (!base)
    return {
      point: () => ({ x: NaN, y: NaN }),
      jacobian: () => NaN,
    };
  return {
    point(u, v) {
      const b = perspectivePoint(base, u, v);
      const r = residual(space, u, v);
      return { x: b.x + r.x, y: b.y + r.y };
    },
    jacobian(u, v) {
      const w = base.g * u + base.h * v + 1;
      if (Math.abs(w) < 1e-12) return NaN;
      const xn = base.a * u + base.b * v + base.c;
      const yn = base.d * u + base.e * v + base.f;
      const bxu = (base.a * w - xn * base.g) / (w * w);
      const bxv = (base.b * w - xn * base.h) / (w * w);
      const byu = (base.d * w - yn * base.g) / (w * w);
      const byv = (base.e * w - yn * base.h) / (w * w);
      const r = residualDerivatives(space, u, v);
      return (bxu + r.xu) * (byv + r.yv) - (bxv + r.xv) * (byu + r.yu);
    },
  };
}

export function surfaceFor(space: WarpSpace): Surface | null {
  return space.mode === "perspective"
    ? perspectiveSurface(space)
    : envelopeSurface(space);
}

/**
 * True when the warp does nothing. Painted and expanded outlines are then the
 * original nodes verbatim, so adding or resetting an effect cannot introduce
 * even sub-pixel node churn.
 */
export function isIdentity(space: WarpSpace) {
  const b = space.bounds;
  const eps = 1e-7;
  const expected = [
    [b.x, b.y],
    [b.x + b.width, b.y],
    [b.x + b.width, b.y + b.height],
    [b.x, b.y + b.height],
  ];
  const quadIdentity = space.quad.every(
    (p, i) =>
      Math.abs(p.x - expected[i][0]) < eps &&
      Math.abs(p.y - expected[i][1]) < eps,
  );
  if (space.mode === "perspective") return quadIdentity;
  if (!quadIdentity) return false;
  const { rows, cols, points } = space.mesh;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const p = points[r * cols + c];
      if (
        Math.abs(p.x - (b.x + (b.width * c) / (cols - 1))) > eps ||
        Math.abs(p.y - (b.y + (b.height * r) / (rows - 1))) > eps
      )
        return false;
    }
  return true;
}

/** Where each lattice handle is drawn: exactly the stored handle position. */
export function latticeHandlePosition(space: WarpSpace, index: number): Point {
  return { ...space.mesh.points[index] };
}

/**
 * The value that puts a lattice node exactly under `target`. The residual is
 * interpolating, so the handle itself is the answer — direct manipulation is
 * exact and never lags the pointer.
 */
export function solveLatticeControl(
  _space: WarpSpace,
  _index: number,
  target: Point,
): Point | null {
  return Number.isFinite(target.x) && Number.isFinite(target.y)
    ? { x: target.x, y: target.y }
    : null;
}

/** Snap the lattice so the free envelope reproduces the perspective exactly. */
export function seedLattice(
  quad: Point[],
  rows: number,
  cols: number,
): Point[] {
  const m = perspectiveMatrix(quad);
  const points: Point[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const u = c / (cols - 1),
        v = r / (rows - 1);
      points.push(m ? perspectivePoint(m, u, v) : { x: u, y: v });
    }
  return points;
}

export interface Validity {
  ok: boolean;
  code?: "degenerate" | "fold" | "self-intersection" | "invalid";
  reason?: string;
}

const VALID: Validity = { ok: true, code: undefined, reason: undefined };

function segmentsTouch(a: Point, b: Point, c: Point, d: Point) {
  const o1 = cross(a, b, c),
    o2 = cross(a, b, d);
  const o3 = cross(c, d, a),
    o4 = cross(c, d, b);
  const e = 1e-7;
  const opposite = (x: number, y: number) =>
    (x > e && y < -e) || (x < -e && y > e);
  return opposite(o1, o2) && opposite(o3, o4);
}

function simplePolygon(points: Point[]) {
  const n = points.length;
  if (n < 4) return false;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const a = points[i],
      b = points[(i + 1) % n];
    area += a.x * b.y - b.x * a.y;
  }
  if (area <= 0) return false;
  for (let i = 0; i < n; i++) {
    const a = points[i],
      b = points[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsTouch(a, b, points[j], points[(j + 1) % n])) return false;
    }
  }
  return true;
}

function boundarySamples(space: WarpSpace): Point[] {
  if (space.mode === "perspective") return space.quad.map((p) => ({ ...p }));
  const s = surfaceFor(space)!;
  const steps = 14;
  const out: Point[] = [];
  const edge = (f: (t: number) => Point) => {
    for (let i = 0; i < steps; i++) out.push(f(i / steps));
  };
  edge((t) => s.point(t, 0));
  edge((t) => s.point(1, t));
  edge((t) => s.point(1 - t, 1));
  edge((t) => s.point(0, 1 - t));
  return out;
}

function cornerCheck(space: WarpSpace) {
  const q = space.quad;
  for (let i = 0; i < 4; i++) {
    const prev = q[(i + 3) % 4],
      cur = q[i],
      next = q[(i + 1) % 4];
    const e1 = { x: cur.x - prev.x, y: cur.y - prev.y };
    const e2 = { x: next.x - cur.x, y: next.y - cur.y };
    const local = Math.hypot(e1.x, e1.y) * Math.hypot(e2.x, e2.y);
    if (local < 1e-9)
      return {
        ok: false as const,
        code: "degenerate" as const,
        reason: "Two corners sit on top of each other.",
      };
    if (cross(prev, cur, next) <= local * 1e-4)
      return {
        ok: false as const,
        code: "fold" as const,
        reason:
          "Corners must stay convex — this corner would fold the artwork.",
      };
  }
  return null;
}

/**
 * A warp is usable only when the map stays orientation preserving across the
 * whole source rectangle. We sample the Jacobian densely and additionally
 * require the mapped boundary to remain a simple polygon, which rejects
 * folds, flips and regions squeezed close to zero area before they are baked.
 */
export function validateSpace(space: WarpSpace): Validity {
  const b = space.bounds;
  if (
    !Number.isFinite(b.x) ||
    !Number.isFinite(b.y) ||
    !(b.width > 1e-6) ||
    !(b.height > 1e-6)
  )
    return {
      ok: false,
      code: "invalid",
      reason: "The source bounds are too small to warp.",
    };

  const points = space.mode === "perspective" ? space.quad : space.mesh.points;
  if (points.some((p) => !finite(p)))
    return {
      ok: false,
      code: "invalid",
      reason: "A warp handle moved to an invalid position.",
    };

  if (space.mode === "perspective") {
    const corner = cornerCheck(space);
    if (corner) return corner;
    let area = 0;
    for (let i = 0; i < 4; i++) {
      const a = space.quad[i],
        c = space.quad[(i + 1) % 4];
      area += a.x * c.y - c.x * a.y;
    }
    if (area <= boundsArea(b) * 0.05)
      return {
        ok: false,
        code: "degenerate",
        reason: "The perspective corners are nearly collinear.",
      };
  }

  const base = perspectiveMatrix(space.quad);
  if (!base)
    return {
      ok: false,
      code: "degenerate",
      reason: "The boundary corners are collinear; the warp is undefined.",
    };

  const s = surfaceFor(space)!;
  const area = boundsArea(b);
  let minJac = Infinity;
  // Sample strictly inside every cell. A piecewise-bilinear field is only
  // smooth within a cell, so probing cell interiors avoids missing a fold
  // that starts just next to a lattice line.
  const { rows, cols } = space.mesh;
  const us: number[] = [];
  const vs: number[] = [];
  if (space.mode === "perspective") {
    for (let i = 0; i <= 24; i++) {
      us.push(i / 24);
      vs.push(i / 24);
    }
  } else {
    for (let c = 0; c < cols - 1; c++)
      for (const k of [0.25, 0.5, 0.75]) us.push((c + k) / (cols - 1));
    for (let r = 0; r < rows - 1; r++)
      for (const k of [0.25, 0.5, 0.75]) vs.push((r + k) / (rows - 1));
    us.push(0, 1);
    vs.push(0, 1);
  }
  for (const u of us) {
    for (const v of vs) {
      const p = s.point(u, v);
      if (!finite(p))
        return {
          ok: false,
          code: "degenerate",
          reason: "The warp maps part of the artwork to infinity.",
        };
      const jac = s.jacobian(u, v);
      if (!Number.isFinite(jac) || jac <= 0)
        return {
          ok: false,
          code: "fold",
          reason: "This would flip part of the artwork over itself.",
        };
      if (jac < minJac) minJac = jac;
    }
  }
  if (minJac < area * 0.01)
    return {
      ok: false,
      code: "degenerate",
      reason:
        "This region is nearly degenerate — give the compressed area more room.",
    };

  if (!simplePolygon(boundarySamples(space)))
    return {
      ok: false,
      code: "self-intersection",
      reason: "The boundary would cross itself.",
    };

  return VALID;
}
