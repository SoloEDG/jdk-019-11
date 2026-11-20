import { computed } from "vue";
import { beginEdit } from "../../drawing";
import { doc } from "../../../shared/document";
import type { Point, Shape, WarpMode, WarpSpace } from "../../../shared/types";
import { seedLattice, surfaceFor, validateSpace } from "../lib/surface";
import {
  createSpace,
  extendBounds,
  meshFromBounds,
  resetSpaceHandles,
  selectionTargets,
  spaceForSelection,
  targetId,
} from "./space";
import { statusError, statusOk, statusReset } from "./status";
import {
  DISPLAY_MAX_TOLERANCE,
  DISPLAY_MIN_TOLERANCE,
  EXPORT_TOLERANCE,
  bakedTolerance,
  outline,
} from "./apply";

export const activeSpace = computed(() => spaceForSelection());

/** Any structural change clears a stale "blocked" warning. */
export function clearStatus() {
  statusReset();
}

export function clampDetail(value: number) {
  if (!Number.isFinite(value)) return 0.15;
  return Math.min(
    DISPLAY_MAX_TOLERANCE,
    Math.max(DISPLAY_MIN_TOLERANCE, value),
  );
}

/** Copy of a space with one handle at a new location, used for validation. */
export function withHandle(
  space: WarpSpace,
  index: number,
  p: Point,
): WarpSpace {
  const next: WarpSpace = {
    ...space,
    bounds: { ...space.bounds },
    quad: space.quad.map((q) => ({ ...q })) as WarpSpace["quad"],
    mesh: {
      rows: space.mesh.rows,
      cols: space.mesh.cols,
      points: space.mesh.points.map((q) => ({ ...q })),
    },
  };
  if (next.mode === "perspective") {
    if (index >= 0 && index < 4) next.quad[index] = { x: p.x, y: p.y };
  } else if (index >= 0 && index < next.mesh.points.length) {
    next.mesh.points[index] = { x: p.x, y: p.y };
  }
  return next;
}

/** Writes a validated candidate without asking for a snapshot. */
export function commitHandle(space: WarpSpace, index: number, p: Point) {
  if (space.mode === "perspective") {
    space.quad[index] = { x: p.x, y: p.y };
    // Keep the lattice corners in step so switching to the free envelope can
    // retain the boundary shape the user just built.
    const { rows, cols, points } = space.mesh;
    const corners = [0, cols - 1, points.length - 1, points.length - cols];
    const at = corners[index];
    if (at !== undefined) points[at] = { x: p.x, y: p.y };
  } else space.mesh.points[index] = { x: p.x, y: p.y };
}

export function checkHandle(space: WarpSpace, index: number, p: Point) {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
    return { ok: false, reason: "Warp handles must stay inside the artboard." };
  return validateSpace(withHandle(space, index, p));
}

/**
 * Commit one dragged handle. Invalid candidates are rejected before touching
 * the document, so the last usable warp is always preserved and undo stays
 * meaningful.
 */
export function moveHandle(space: WarpSpace, index: number, p: Point) {
  const check = checkHandle(space, index, p);
  if (!check.ok) {
    statusError(check.reason ?? "This warp is not allowed.");
    return false;
  }
  commitHandle(space, index, p);
  statusOk(
    space.mode === "perspective"
      ? "Corner moved. Drag the others to wrap the box."
      : "Envelope point moved.",
  );
  return true;
}

/**
 * How far the free envelope's interior edits stray from the four-corner
 * projection. Used to tell the user when switching to perspective mode has
 * to set those edits aside.
 */
function interiorDeviation(space: WarpSpace) {
  const probe = surfaceFor({ ...space, mode: "perspective" });
  const env = surfaceFor(space);
  if (!probe || !env) return Infinity;
  let worst = 0;
  for (let i = 1; i < 8; i++)
    for (let j = 1; j < 8; j++) {
      const u = i / 8,
        v = j / 8;
      const a = probe.point(u, v),
        b = env.point(u, v);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
  return worst;
}

function shapesInSpace(id: string) {
  return doc.shapes.filter((s) => s.warp?.space === id);
}

function meshToQuad(mesh: WarpSpace["mesh"]): WarpSpace["quad"] {
  const { rows, cols, points } = mesh;
  return [
    { ...points[0] },
    { ...points[cols - 1] },
    { ...points[(rows - 1) * cols + cols - 1] },
    { ...points[(rows - 1) * cols] },
  ];
}

/** Adds the warp to the current selection or switches its type. */
export function enableWarp(mode: WarpMode) {
  const targets = selectionTargets();
  if (!targets.length) {
    statusError(
      doc.selected.length > 1
        ? "Group the selection first — one shared warp space needs a group."
        : "Select a shape or group first.",
    );
    return null;
  }
  const id = targetId(targets)!;
  const existing = doc.warps.find((w) => w.id === id);
  if (existing) {
    if (existing.mode === mode) return existing;
    beginEdit();
    if (mode === "envelope") {
      const candidate: WarpSpace = {
        ...existing,
        mode,
        bounds: { ...existing.bounds },
        quad: existing.quad.map((q) => ({ ...q })) as WarpSpace["quad"],
        mesh: {
          rows: existing.mesh.rows,
          cols: existing.mesh.cols,
          points: existing.mesh.points.map((q) => ({ ...q })),
        },
      };
      // Seed the lattice from the projective map itself: residual zero means
      // the free envelope starts out identical to the four corners, so
      // switching type never jumps the artwork.
      candidate.mesh.points = seedLattice(
        candidate.quad,
        candidate.mesh.rows,
        candidate.mesh.cols,
      );
      if (!validateSpace(candidate).ok) {
        statusError(
          "Switching to the free envelope here would fold the artwork.",
        );
        return existing;
      }
      existing.mode = mode;
      existing.mesh = candidate.mesh;
    } else {
      const candidate: WarpSpace = {
        ...existing,
        mode,
        bounds: { ...existing.bounds },
        quad: meshToQuad(existing.mesh),
        mesh: {
          rows: existing.mesh.rows,
          cols: existing.mesh.cols,
          points: existing.mesh.points.map((q) => ({ ...q })),
        },
      };
      if (!validateSpace(candidate).ok) {
        statusError(
          "The envelope is too distorted for a 4-corner perspective; adjust it first.",
        );
        return existing;
      }
      const dropped = interiorDeviation(existing);
      existing.quad = candidate.quad;
      existing.mode = mode;
      if (dropped > 0.5)
        statusError(
          "Switched to four-corner perspective. Interior envelope edits cannot be represented by four corners and were set aside — undo restores them.",
        );
    }
    for (const s of shapesInSpace(id)) if (s.warp) s.warp.baked = null;
    statusOk(
      mode === "perspective"
        ? "Four-corner perspective enabled."
        : "Free envelope enabled.",
    );
    return existing;
  }
  beginEdit();
  const space = createSpace(mode);
  if (!space) {
    statusError("Select a shape or group first.");
    return null;
  }
  statusOk(
    mode === "perspective"
      ? "Four-corner perspective added. Drag the four corners."
      : "Free envelope added. Drag boundary or interior points.",
  );
  return space;
}

/** Remove the warp and keep the current visible approximation as a path. */
export function removeWarp() {
  const space = spaceForSelection();
  const targets = space ? shapesInSpace(space.id) : [];
  if (!space || !targets.length) {
    statusError("No warp on the selection.");
    return;
  }
  beginEdit();
  for (const s of targets) {
    if (!s.warp) continue;
    // Releasing always hands back the visible result, never the undeformed
    // master, so the artwork cannot jump when the effect is removed.
    s.nodes = cloneNodes(s.warp.baked ?? outline(s, EXPORT_TOLERANCE));
    delete s.warp;
  }
  doc.warps = doc.warps.filter((w) => w.id !== space.id);
  statusOk("Warp removed; the path is now a regular editable outline.");
}

function cloneNodes(nodes: Shape["nodes"]): Shape["nodes"] {
  return nodes.map((n) => ({
    x: n.x,
    y: n.y,
    in: { ...n.in },
    out: { ...n.out },
  }));
}

export function resetWarp() {
  const space = spaceForSelection();
  if (!space) return;
  beginEdit();
  resetSpaceHandles(space);
  for (const s of shapesInSpace(space.id)) if (s.warp) s.warp.baked = null;
  statusOk("Warp handles reset to the original shape bounds.");
}

export function expandWarp() {
  const space = spaceForSelection();
  if (!space) {
    statusError("No warp on the selection.");
    return;
  }
  beginEdit();
  for (const s of shapesInSpace(space.id)) {
    if (!s.warp || s.warp.baked) continue;
    s.warp.baked = cloneNodes(outline(s, bakedTolerance(space)));
  }
  statusOk(
    "Expanded to editable paths. The original nodes stay preserved underneath.",
  );
}

/** Return to the live effect, discarding the baked approximation. */
export function restoreEffect() {
  const space = spaceForSelection();
  if (!space) {
    statusError("No warp on the selection.");
    return;
  }
  const targets = shapesInSpace(space.id).filter((s) => s.warp?.baked);
  if (!targets.length) {
    statusOk("This warp is already live.");
    return;
  }
  beginEdit();
  for (const s of targets) s.warp!.baked = null;
  statusOk(
    "Effect restored from the original path — repeated toggling cannot accumulate error.",
  );
}

/**
 * Keep a space aligned with its master artwork: when live nodes are edited
 * (moved, scaled, drawn), the source bounds — and therefore the handles —
 * follow. Baked nodes are deliberately ignored so expanding and re-expanding
 * never shifts the space.
 */
export function syncSpaceBounds(ids: string[]) {
  const done = new Set<string>();
  for (const id of ids) {
    const shape = doc.shapes.find((s) => s.id === id);
    if (!shape?.warp) continue;
    const key = shape.warp.space;
    if (done.has(key)) continue;
    done.add(key);
    const space = doc.warps.find((w) => w.id === key);
    if (!space) continue;
    // Master nodes are the source of truth in both states; using them keeps
    // the handles glued to the artwork whether the effect is live or baked.
    const members = shapesInSpace(key);
    if (!members.length) continue;
    extendBounds(space, members);
  }
}

/** Drop warp spaces whose shapes were removed. */
export function pruneWarps() {
  const live = new Set(doc.shapes.map((s) => s.warp?.space).filter(Boolean));
  doc.warps = doc.warps.filter((w) => live.has(w.id));
}
