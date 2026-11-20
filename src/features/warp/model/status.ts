import { ref } from "vue";

export interface WarpStatus {
  ok: boolean;
  message: string;
}

export const warpStatus = ref<WarpStatus>({
  ok: true,
  message: "Drag a corner or mesh point to warp the selection.",
});

export function statusOk(message: string) {
  warpStatus.value = { ok: true, message };
}

export function statusError(message: string) {
  warpStatus.value = { ok: false, message };
}

/** Clear a stale warning once the document moves on (undo, reselect, …). */
export function statusReset(
  message = "Drag a corner or mesh point to warp the selection.",
) {
  warpStatus.value = { ok: true, message };
}
