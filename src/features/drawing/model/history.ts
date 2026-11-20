import { ref } from "vue";
import { doc } from "../../../shared/document";

export interface Snapshot {
  shapes: string;
  warps: string;
  selected: string[];
}

const past: Snapshot[] = [];
const future: Snapshot[] = [];
export const revision = ref(0);

export function snapshot(): Snapshot {
  return {
    shapes: JSON.stringify(doc.shapes),
    warps: JSON.stringify(doc.warps),
    selected: [...doc.selected],
  };
}

export function beginEdit() {
  past.push(snapshot());
  if (past.length > 100) past.shift();
  future.length = 0;
}

function install(state: Snapshot) {
  doc.shapes = JSON.parse(state.shapes);
  doc.warps = JSON.parse(state.warps);
  doc.selected = state.selected.filter((id: string) =>
    doc.shapes.some((s) => s.id === id),
  );
  revision.value++;
}

export function undo() {
  const state = past.pop();
  if (state) {
    future.push(snapshot());
    install(state);
  }
}

export function redo() {
  const state = future.pop();
  if (state) {
    past.push(snapshot());
    install(state);
  }
}
