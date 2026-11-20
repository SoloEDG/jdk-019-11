<script setup lang="ts">
import { beginEdit } from "../../drawing";
import { doc } from "../../../shared/document";
import { move } from "../model/move";
import { coordinates } from "../lib/coordinates";
import { doc as document } from "../../../shared/document";
import { isExpanded } from "../../warp";
import type { Node, Shape } from "../../../shared/types";

/** The nodes actually editable in the current state. */
function nodesOf(s: Shape): Node[] {
  return s.warp?.baked ?? s.nodes;
}
function visible(s: Shape) {
  // Expanded effects expose their baked path; a live effect exposes the
  // original path (drawn as the dashed ghost) only in node-editing mode, so
  // the source can still be refined without leaving the effect.
  return !s.warp || isExpanded(s) || document.tool === "nodes";
}
function drag(e: PointerEvent, shape: Shape, n: Node, kind: string) {
  e.stopPropagation();
  beginEdit();
  const svg = (e.target as SVGElement).ownerSVGElement!;
  const f = (ev: PointerEvent) => {
    const p = coordinates(ev, svg);
    // Master edits feed the live effect directly. The warp handles are left
    // where they are on purpose: the source outline may be refined without
    // the whole effect rescaling under the pointer.
    if (kind === "anchor") move(n, p);
    else Object.assign(kind === "in" ? n.in : n.out, p);
  };
  window.addEventListener("pointermove", f);
  window.addEventListener(
    "pointerup",
    () => window.removeEventListener("pointermove", f),
    { once: true },
  );
}
</script>
<template>
  <g v-for="s in doc.shapes.filter((s) => doc.selected.includes(s.id))"
    ><g v-if="visible(s)" v-for="n in nodesOf(s)"
      ><path
        :d="`M${n.in.x},${n.in.y} L${n.x},${n.y} L${n.out.x},${n.out.y}`"
        stroke="#9974ec"
        fill="none" /><circle
        v-for="k in ['in', 'out'] as const"
        :cx="n[k].x"
        :cy="n[k].y"
        r="4"
        fill="white"
        stroke="#8052df"
        @pointerdown="drag($event, s, n, k)" /><rect
        :x="n.x - 4"
        :y="n.y - 4"
        width="8"
        height="8"
        fill="white"
        stroke="#8052df"
        data-testid="anchor"
        @pointerdown="drag($event, s, n, 'anchor')" /></g
  ></g>
</template>
