import type { Node } from "../../../shared/types";

export function d(nodes: Node[], closed: boolean) {
  if (!nodes.length) return "";
  let out = `M ${nodes[0].x} ${nodes[0].y}`;
  for (let i = 1; i < nodes.length + (closed ? 1 : 0); i++) {
    const a = nodes[i - 1],
      b = nodes[i % nodes.length];
    out += ` C ${a.out.x} ${a.out.y} ${b.in.x} ${b.in.y} ${b.x} ${b.y}`;
  }
  return out + (closed ? " Z" : "");
}
