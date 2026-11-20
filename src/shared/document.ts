import { reactive } from "vue";
import type { Document } from "./types";
export const doc = reactive<Document>({
  shapes: [],
  warps: [],
  selected: [],
  tool: "select",
  zoom: 1,
});
