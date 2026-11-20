import { doc } from "../../../shared/document";
import type {
  Bounds,
  Point,
  Shape,
  WarpGrid,
  WarpSpace,
} from "../../../shared/types";

export const MESH_ROWS = 5;
export const MESH_COLS = 5;

export function quadFromBounds(b: Bounds): [Point, Point, Point, Point] {
  const { x, y, width, height } = b;
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

export function meshFromBounds(b: Bounds): WarpGrid {
  const points: Point[] = [];
  for (let r = 0; r < MESH_ROWS; r++)
    for (let c = 0; c < MESH_COLS; c++)
      points.push({
        x: b.x + (b.width * c) / (MESH_COLS - 1),
        y: b.y + (b.height * r) / (MESH_ROWS - 1),
      });
  // Handle positions are the drawn positions; with identity quad they also
  // describe the residual (zero), so the lattice is a clean starting point.
  return { rows: MESH_ROWS, cols: MESH_COLS, points };
}

/**
 * Shapes sharing one warp space. A group always resolves to all of its
 * members; an ad-hoc multi-selection is deliberately rejected so two objects
 * can never get separate warps that would tear their shared seam apart.
 */
export function selectionTargets(): Shape[] {
  const chosen = doc.shapes.filter((s) => doc.selected.includes(s.id));
  if (!chosen.length) return [];
  const group = chosen[0].group;
  if (!group) return chosen.length === 1 ? chosen : [];
  if (!chosen.every((s) => s.group === group)) return [];
  return doc.shapes.filter((s) => s.group === group);
}

export function targetId(shapes: Shape[]): string | undefined {
  if (!shapes.length) return undefined;
  return shapes[0].group ?? shapes[0].id;
}

export function shapesOfSpace(id: string) {
  return doc.shapes.filter((s) => s.warp?.space === id);
}

export function spaceForShape(shape: Shape) {
  return shape.warp
    ? doc.warps.find((w) => w.id === shape.warp!.space)
    : undefined;
}

export function spaceForSelection() {
  const shapes = selectionTargets();
  const id = targetId(shapes);
  return id ? doc.warps.find((w) => w.id === id) : undefined;
}

export function boundsOf(shapes: Shape[]): Bounds {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const s of shapes)
    for (const n of s.nodes) {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x);
      maxY = Math.max(maxY, n.y);
    }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1, height: 1 };
  const pad = 0;
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(1e-3, maxX - minX + pad * 2),
    height: Math.max(1e-3, maxY - minY + pad * 2),
  };
}

/** Returns the shared warp space for the current selection, if any. */
export function createSpace(mode: WarpSpace["mode"] = "perspective") {
  const shapes = selectionTargets();
  const id = targetId(shapes);
  if (!id) return null;
  const existing = doc.warps.find((w) => w.id === id);
  if (existing) return existing;
  const bounds = boundsOf(shapes);
  const space: WarpSpace = {
    id,
    mode,
    bounds,
    quad: quadFromBounds(bounds),
    mesh: meshFromBounds(bounds),
    // Default matches the export guarantee, so preview, expansion and export
    // agree exactly until the user deliberately loosens the accuracy.
    detail: 0.05,
  };
  doc.warps.push(space);
  for (const s of shapes) s.warp = { space: id, baked: null };
  return space;
}

/**
 * Whether grouping the members would merge conflicting warp spaces. Checked
 * before a snapshot is taken so a rejected group leaves no undo entry.
 */
export function groupSpaceConflict(members: Shape[]) {
  const used = new Set(
    members.map((s) => s.warp?.space).filter((v): v is string => !!v),
  );
  return used.size > 1
    ? "These shapes each have their own warp. Release those effects before grouping so the group can share one space."
    : undefined;
}

/**
 * Make a freshly created group the owner of the one warp its members already
 * use, so a group can never end up with per-shape spaces that scale apart.
 * Members without a warp join the same space, which keeps their seams glued
 * to the rest of the group.
 */
export function adoptGroupSpace(groupId: string, members: Shape[]) {
  const used = new Set(
    members.map((s) => s.warp?.space).filter((v): v is string => !!v),
  );
  if (used.size === 0) return { ok: true as const };
  if (used.size > 1)
    return {
      ok: false as const,
      reason:
        "These shapes each have their own warp. Release those effects before grouping so the group can share one space.",
    };
  const space = doc.warps.find((w) => w.id === used.values().next().value);
  if (!space) return { ok: true as const };
  space.id = groupId;
  for (const s of members) {
    if (s.warp) s.warp.space = groupId;
    else s.warp = { space: groupId, baked: null };
  }
  extendBounds(space, members);
  return { ok: true as const };
}

/**
 * Grow a space to cover its members while leaving the existing mapping
 * untouched. The handles are re-expressed in the new normalized frame, so the
 * artwork that is already warped does not move when a neighbour joins.
 */
export function extendBounds(space: WarpSpace, members: Shape[]) {
  const bounds = boundsOf(members);
  const from = space.bounds;
  if (
    Math.abs(bounds.x - from.x) < 1e-9 &&
    Math.abs(bounds.y - from.y) < 1e-9 &&
    Math.abs(bounds.width - from.width) < 1e-9 &&
    Math.abs(bounds.height - from.height) < 1e-9
  )
    return;
  const remap = (p: Point): Point => ({
    x: bounds.x + ((p.x - from.x) / from.width) * bounds.width,
    y: bounds.y + ((p.y - from.y) / from.height) * bounds.height,
  });
  space.bounds = bounds;
  space.quad = space.quad.map(remap) as WarpSpace["quad"];
  space.mesh.points = space.mesh.points.map(remap);
}

export function resetSpaceHandles(space: WarpSpace) {
  space.quad = quadFromBounds(space.bounds);
  space.mesh = meshFromBounds(space.bounds);
}
