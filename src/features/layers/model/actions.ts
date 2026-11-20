import { beginEdit } from "../../drawing";
import { doc } from "../../../shared/document";
import { adoptGroupSpace, groupSpaceConflict } from "../../warp/model/space";
import { pruneWarps, syncSpaceBounds } from "../../warp/model/ops";
import { statusError } from "../../warp/model/status";
export function group() {
  const selected = doc.shapes.filter((s) => doc.selected.includes(s.id));
  if (selected.length < 2) return;
  const conflict = groupSpaceConflict(selected);
  if (conflict) {
    statusError(conflict);
    return;
  }
  beginEdit();
  const id = crypto.randomUUID();
  adoptGroupSpace(id, selected);
  const top = doc.shapes
    .map((s) => doc.selected.includes(s.id))
    .lastIndexOf(true);
  const below = doc.shapes
    .slice(0, top + 1)
    .filter((s) => !doc.selected.includes(s.id));
  const above = doc.shapes.slice(top + 1);
  selected.forEach((s) => (s.group = id));
  doc.shapes = [...below, ...selected, ...above];
}
export function reorder(delta: number) {
  const first = doc.shapes.find((s) => doc.selected.includes(s.id));
  if (!first) return;
  const blocks: (typeof doc.shapes)[] = [];
  for (const shape of doc.shapes) {
    const last = blocks.at(-1);
    if (shape.group && last?.[0].group === shape.group) last.push(shape);
    else blocks.push([shape]);
  }
  const i = blocks.findIndex((b) => b.some((s) => s.id === first.id)),
    j = i + delta;
  if (j < 0 || j >= blocks.length) return;
  beginEdit();
  [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  doc.shapes = blocks.flat();
}
export function remove() {
  beginEdit();
  const gone = new Set(doc.selected);
  const affected = doc.shapes
    .filter((s) => gone.has(s.id) && s.warp)
    .map((s) => s.warp!.space);
  doc.shapes = doc.shapes.filter((s) => !gone.has(s.id));
  doc.selected = [];
  pruneWarps();
  // Remaining members re-anchor their handles on what is actually left.
  const survivors = doc.shapes
    .filter((s) => s.warp && affected.includes(s.warp.space))
    .map((s) => s.id);
  syncSpaceBounds(survivors);
}
