import { computed } from "vue";
import { doc } from "../../../shared/document";
import type { Node } from "../../../shared/types";
import { editableNodes } from "../../warp";

export const active = computed(() =>
  doc.shapes.find((s) => doc.selected.includes(s.id)),
);

/** Nodes shown in the properties panel. */
export function countNodes(): number {
  const s = active.value;
  return s ? editableNodes(s).length : 0;
}
export type { Node };
