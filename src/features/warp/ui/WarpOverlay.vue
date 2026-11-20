<script setup lang="ts">
import { computed } from "vue";
import { beginEdit } from "../../drawing";
import { coordinates } from "../../nodes";
import { activeSpace, checkHandle, commitHandle } from "../model/ops";
import {
  latticeHandlePosition,
  solveLatticeControl,
  surfaceFor,
} from "../lib/surface";
import { statusError, statusOk, warpStatus } from "../model/status";
import type { Point, WarpSpace } from "../../../shared/types";

const space = activeSpace;

const handles = computed(() => {
  const s = space.value;
  if (!s) return [] as { p: Point; i: number; corner: boolean }[];
  if (s.mode === "perspective")
    return s.quad.map((q, i) => ({ p: q, i, corner: true }));
  const last = s.mesh.points.length - 1;
  return s.mesh.points.map((_, i) => ({
    p: latticeHandlePosition(s, i),
    i,
    corner:
      i === 0 ||
      i === s.mesh.cols - 1 ||
      i === last ||
      i === last - s.mesh.cols + 1,
  }));
});

/** Boundary and interior lattice curves, sampled from the actual surface. */
const boundary = computed(() => {
  const s = space.value;
  if (!s || s.mode !== "envelope") return [] as (readonly [Point, Point])[];
  const surface = surfaceFor(s);
  if (!surface) return [];
  const steps = 32;
  const out: (readonly [Point, Point])[] = [];
  const add = (f: (t: number) => Point) => {
    let prev = f(0);
    for (let i = 1; i <= steps; i++) {
      const next = f(i / steps);
      out.push([prev, next]);
      prev = next;
    }
  };
  add((t) => surface.point(t, 0));
  add((t) => surface.point(1, t));
  add((t) => surface.point(1 - t, 1));
  add((t) => surface.point(0, 1 - t));
  return out;
});

const latticeLines = computed(() => {
  const s = space.value;
  if (!s || s.mode !== "envelope") return [] as (readonly [Point, Point])[];
  const surface = surfaceFor(s);
  if (!surface || s.mesh.rows < 3 || s.mesh.cols < 3) return [];
  const out: (readonly [Point, Point])[] = [];
  const steps = 24;
  const add = (f: (t: number) => Point) => {
    let prev = f(0);
    for (let i = 1; i <= steps; i++) {
      const next = f(i / steps);
      out.push([prev, next]);
      prev = next;
    }
  };
  for (let r = 1; r < s.mesh.rows - 1; r++)
    add((t) => surface.point(t, r / (s.mesh.rows - 1)));
  for (let c = 1; c < s.mesh.cols - 1; c++)
    add((t) => surface.point(c / (s.mesh.cols - 1), t));
  return out;
});

const edges = computed(() => {
  const s = space.value;
  if (!s) return [] as (readonly [Point, Point])[];
  if (s.mode === "perspective") {
    const q = s.quad;
    return q.map((q2, i) => [q2, q[(i + 1) % 4]] as const);
  }
  return [] as (readonly [Point, Point])[];
});

/** Pointer -> control value for the current warp type. */
function controlFor(s: WarpSpace, index: number, pointer: Point) {
  if (s.mode === "perspective") return pointer;
  return solveLatticeControl(s, index, pointer);
}

function drag(e: PointerEvent, index: number) {
  e.stopPropagation();
  const target = space.value;
  if (!target) return;
  const svg = (e.target as SVGElement).ownerSVGElement!;
  beginEdit();
  let moved = false;
  let blocked = false;
  const f = (ev: PointerEvent) => {
    const p = coordinates(ev, svg);
    const control = controlFor(target, index, p);
    if (!control) {
      statusError("This lattice node cannot be moved independently.");
      return;
    }
    const check = checkHandle(target, index, control);
    if (!check.ok) {
      // Reject before touching the document: the last valid warp survives and
      // the drag resumes as soon as the pointer returns to a legal place.
      blocked = true;
      statusError(check.reason ?? "This warp is not allowed.");
      return;
    }
    commitHandle(target, index, control);
    blocked = false;
    moved = true;
  };
  const up = () => {
    window.removeEventListener("pointermove", f);
    window.removeEventListener("pointerup", up);
    if (moved && blocked)
      statusError(
        "Handle stopped at the limit — going further would fold or cross the artwork.",
      );
    else if (moved) statusOk("Warp updated.");
    else
      statusError(
        "Warp handle returned to its last valid spot — that drag would fold or cross the artwork.",
      );
  };
  window.addEventListener("pointermove", f);
  window.addEventListener("pointerup", up);
}
</script>
<template>
  <g
    v-if="space"
    class="warp-overlay"
    :class="{ 'warp-invalid': !warpStatus.ok }"
    data-testid="warp-overlay"
  >
    <g class="warp-guides">
      <line
        v-for="(e, i) in edges"
        :key="'e' + i"
        :x1="e[0].x"
        :y1="e[0].y"
        :x2="e[1].x"
        :y2="e[1].y"
      />
      <line
        v-for="(e, i) in latticeLines"
        :key="'l' + i"
        class="lattice"
        :x1="e[0].x"
        :y1="e[0].y"
        :x2="e[1].x"
        :y2="e[1].y"
      />
      <line
        v-for="(e, i) in boundary"
        :key="'b' + i"
        class="boundary"
        :x1="e[0].x"
        :y1="e[0].y"
        :x2="e[1].x"
        :y2="e[1].y"
      />
    </g>
    <g
      v-for="h in handles"
      :key="'h' + h.i"
      class="warp-handle"
      :class="{ corner: h.corner }"
      :transform="`translate(${h.p.x} ${h.p.y})`"
      @pointerdown="drag($event, h.i)"
    >
      <circle r="10" class="hit" />
      <rect
        v-if="h.corner"
        x="-5"
        y="-5"
        width="10"
        height="10"
        class="marker"
        :data-testid="'warp-handle-' + h.i"
      />
      <circle
        v-else
        r="4.5"
        class="marker"
        :data-testid="'warp-handle-' + h.i"
      />
    </g>
  </g>
</template>
<style scoped>
.warp-guides .boundary {
  stroke: #9a6ee8;
  stroke-width: 1.3;
  stroke-dasharray: none;
  vector-effect: non-scaling-stroke;
}
.warp-guides .lattice {
  stroke: #b9a3ea;
  stroke-width: 0.9;
  stroke-dasharray: 3 5;
  vector-effect: non-scaling-stroke;
}
.warp-guides line {
  stroke: #9a6ee8;
  stroke-width: 1.25;
  stroke-dasharray: 5 4;
  vector-effect: non-scaling-stroke;
}
.warp-handle .hit {
  fill: transparent;
  cursor: grab;
}
.warp-handle .marker {
  fill: #fff;
  stroke: #7a45dc;
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
  pointer-events: none;
}
.warp-handle.corner .marker {
  fill: #7a45dc;
  stroke: #fff;
}
.warp-overlay.warp-invalid .warp-guides line {
  stroke: #d13a67;
}
.warp-overlay.warp-invalid .warp-handle .marker {
  stroke: #d13a67;
}
</style>
