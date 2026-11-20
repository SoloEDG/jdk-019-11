<script setup lang="ts">
import { computed } from "vue";
import { doc } from "../../../shared/document";
import { activeSpace, clampDetail } from "../model/ops";
import { approximationFor, isExpanded, spaceOf } from "../model/apply";
import {
  enableWarp,
  expandWarp,
  removeWarp,
  resetWarp,
  restoreEffect,
} from "../model/ops";
import { warpStatus } from "../model/status";
import { selectionTargets } from "../model/space";

const targets = computed(() => selectionTargets());
const ungroupedMulti = computed(
  () => doc.selected.length > 1 && targets.value.length === 0,
);
const disabledReason = computed(() =>
  ungroupedMulti.value
    ? "Group the selected objects first so they can share one warp space."
    : "Select a shape or group first.",
);
const expanded = computed(() => targets.value.some(isExpanded));
const approx = computed(() =>
  targets.value.length ? approximationFor(targets.value[0]) : undefined,
);
const hasWarp = computed(() =>
  targets.value.length ? !!spaceOf(targets.value[0]) : false,
);
const detailLabel = computed(() => {
  const d = activeSpace.value?.detail ?? 0.15;
  if (d <= 0.05) return "Very fine";
  if (d <= 0.2) return "Fine";
  if (d <= 0.5) return "Balanced";
  if (d <= 0.9) return "Light";
  return "Draft";
});
function setDetail(e: Event) {
  const s = activeSpace.value;
  if (!s) return;
  s.detail = clampDetail(+(e.target as HTMLInputElement).value);
}
</script>
<template>
  <section class="warp-panel" data-testid="warp-panel">
    <h4>WARP</h4>
    <div class="warp-modes">
      <button
        data-testid="warp-perspective"
        :class="{ active: activeSpace?.mode === 'perspective' }"
        :disabled="!targets.length"
        :title="disabledReason"
        @click="enableWarp('perspective')"
      >
        Four-corner
      </button>
      <button
        data-testid="warp-envelope"
        :class="{ active: activeSpace?.mode === 'envelope' }"
        :disabled="!targets.length"
        :title="disabledReason"
        @click="enableWarp('envelope')"
      >
        Envelope
      </button>
    </div>
    <p
      v-if="!targets.length && ungroupedMulti"
      class="warp-hint warp-warning"
      data-testid="warp-needs-group"
    >
      Several ungrouped objects are selected. Group them first so all members
      share one warp space — separate warps would pull the seams apart.
    </p>
    <p v-else class="warp-hint">{{ warpStatus.message }}</p>
    <template v-if="activeSpace">
      <div class="warp-metrics" data-testid="warp-metrics">
        <div>
          <b>{{
            activeSpace.mode === "perspective"
              ? "4"
              : activeSpace.mesh.points.length
          }}</b>
          <small>handles</small>
        </div>
        <div>
          <b data-testid="warp-points">{{ approx?.points ?? "—" }}</b>
          <small>nodes</small>
        </div>
        <div>
          <b data-testid="warp-error">{{
            approx ? approx.error.toFixed(3) : "—"
          }}</b>
          <small>max error</small>
        </div>
      </div>
      <label class="warp-detail"
        >Outline accuracy
        <input
          data-testid="warp-detail"
          type="range"
          min="0.02"
          max="1.2"
          step="0.01"
          :value="activeSpace.detail"
          @input="setDetail"
        />
        <span>{{ detailLabel }} · ±{{ activeSpace.detail.toFixed(2) }}</span>
      </label>
      <p class="warp-note" v-if="!expanded" data-testid="warp-preview-note">
        Preview, expansion and export share this accuracy, so the outline never
        changes between states. Magnifying the artboard only adds detail; it
        never shows a coarser approximation than the export.
      </p>
      <p class="warp-note" v-if="expanded" data-testid="warp-expanded">
        Paths are expanded. The original outline is stored beneath the effect.
      </p>
      <div class="warp-actions">
        <button
          v-if="!expanded"
          data-testid="warp-expand"
          title="Bakes the outline at export accuracy (about ±0.05 units)"
          @click="expandWarp"
        >
          Expand effect
        </button>
        <button v-else data-testid="warp-restore" @click="restoreEffect">
          Restore effect
        </button>
        <button v-if="hasWarp" data-testid="warp-reset" @click="resetWarp">
          Reset
        </button>
        <button v-if="hasWarp" data-testid="warp-remove" @click="removeWarp">
          Release
        </button>
      </div>
    </template>
    <p v-else class="warp-empty">Select a shape or group, then add a warp.</p>
  </section>
</template>
<style scoped>
.warp-panel {
  border-top: 1px solid #eee7f3;
  padding: 4px 12px 18px;
}
.warp-panel h4 {
  font-size: 9px;
  letter-spacing: 1px;
  color: #aa9ab5;
  margin: 20px 0 10px;
  padding: 0 4px;
}
.warp-modes {
  display: flex;
  gap: 6px;
}
.warp-modes button {
  flex: 1;
  font-size: 11px;
  padding: 8px 6px;
  background: #f4effa;
  border-radius: 6px;
}
.warp-modes button.active {
  background: #8055d5;
  color: white;
}
.warp-modes button:disabled {
  opacity: 0.45;
  cursor: default;
}
.warp-hint,
.warp-note,
.warp-empty {
  font-size: 10px;
  line-height: 1.55;
  color: #8d7f9c;
  margin: 10px 4px 0;
}
.warp-metrics {
  display: flex;
  gap: 8px;
  margin: 12px 2px 6px;
}
.warp-metrics div {
  flex: 1;
  background: #f7f2fc;
  border-radius: 6px;
  padding: 7px 4px;
  text-align: center;
}
.warp-metrics b {
  display: block;
  font-size: 12px;
  color: #6d4bb5;
}
.warp-metrics small {
  font-size: 8px;
  color: #a99ab8;
}
.warp-detail {
  display: block;
  font-size: 10px;
  color: #8d7f9c;
  margin: 12px 4px;
}
.warp-detail input {
  width: 100%;
  accent-color: #8055d5;
  margin: 6px 0 2px;
}
.warp-detail span {
  font-size: 9px;
  color: #b0a2be;
}
.warp-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.warp-actions button {
  font-size: 10px;
  background: #f4effa;
  padding: 7px 9px;
}
.warp-warning {
  color: #a8582b;
}
</style>
