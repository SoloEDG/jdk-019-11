import { beginEdit, revision } from "../../drawing";
import { ref } from "vue";
import { doc } from "../../../shared/document";
import type { Shape, Point, WarpSpace } from "../../../shared/types";
export const storageStatus = ref("All changes saved locally");

const KEY = "forma-document-v2";

export function save() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ shapes: doc.shapes, warps: doc.warps }),
    );
    storageStatus.value = "All changes saved locally";
  } catch {
    storageStatus.value =
      "Local storage unavailable — export to keep your work";
  }
}
function point(v: Point) {
  return v && Number.isFinite(v.x) && Number.isFinite(v.y);
}
function validShape(s: Shape) {
  if (
    !s ||
    typeof s.id !== "string" ||
    typeof s.name !== "string" ||
    !Array.isArray(s.nodes) ||
    !s.nodes.every((n) => point(n) && point(n.in) && point(n.out)) ||
    typeof s.fill !== "string" ||
    !/^(none|#[0-9a-f]{3,8})$/i.test(s.fill) ||
    typeof s.stroke !== "string" ||
    !/^#[0-9a-f]{3,8}$/i.test(s.stroke) ||
    !Number.isFinite(s.width) ||
    !Number.isFinite(s.opacity)
  )
    return false;
  if (!s.warp) return true;
  return (
    typeof s.warp.space === "string" &&
    (s.warp.baked === null ||
      (Array.isArray(s.warp.baked) &&
        s.warp.baked.every((n) => point(n) && point(n.in) && point(n.out))))
  );
}
function validSpace(w: WarpSpace) {
  return (
    w &&
    typeof w.id === "string" &&
    (w.mode === "perspective" || w.mode === "envelope") &&
    Number.isFinite(w.bounds?.x) &&
    Number.isFinite(w.bounds?.y) &&
    w.bounds.width > 0 &&
    w.bounds.height > 0 &&
    Array.isArray(w.quad) &&
    w.quad.length === 4 &&
    w.quad.every(point) &&
    w.mesh &&
    Number.isInteger(w.mesh.rows) &&
    Number.isInteger(w.mesh.cols) &&
    Array.isArray(w.mesh.points) &&
    w.mesh.points.length === w.mesh.rows * w.mesh.cols &&
    w.mesh.points.every(point) &&
    Number.isFinite(w.detail)
  );
}

export function restore() {
  try {
    const raw =
      localStorage.getItem(KEY) || localStorage.getItem("forma-document");
    const value = JSON.parse(raw || "null");
    const shapes = Array.isArray(value)
      ? value
      : Array.isArray(value?.shapes)
        ? value.shapes
        : null;
    const warps = Array.isArray(value?.warps) ? value.warps : [];
    if (Array.isArray(shapes) && shapes.every(validShape)) {
      beginEdit();
      doc.warps = warps.filter(validSpace);
      const spaces = new Set(doc.warps.map((w) => w.id));
      // Drop effect references whose space did not survive validation; the
      // master path is still intact underneath, so nothing is lost.
      doc.shapes = shapes.map((s) =>
        s.warp && !spaces.has(s.warp.space) ? { ...s, warp: undefined } : s,
      );
      revision.value++;
      doc.selected = [];
      return true;
    }
  } catch {}
  return false;
}
