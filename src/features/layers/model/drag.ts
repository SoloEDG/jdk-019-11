import { doc } from "../../../shared/document";
import { editableNodes } from "../../warp";
import { syncSpaceBounds } from "../../warp/model/ops";
import { translate } from "../lib/translate";
export function translateSelected(x: number, y: number) {
  const ids = doc.selected;
  for (const s of doc.shapes)
    if (ids.includes(s.id)) {
      // Move what is visible. With a live effect that is the master path; with
      // an expanded effect both the baked path and the preserved master move
      // together, so restoring the effect cannot teleport the artwork.
      translate({ ...s, nodes: editableNodes(s) }, x, y);
      if (s.warp?.baked) translate(s, x, y);
    }
  syncSpaceBounds(ids);
}
