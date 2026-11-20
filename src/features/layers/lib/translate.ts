import type { Node, Shape } from "../../../shared/types";
export function translate(s: Pick<Shape, "nodes">, x: number, y: number) {
  s.nodes.forEach((n: Node) => {
    n.x += x;
    n.y += y;
    n.in.x += x;
    n.in.y += y;
    n.out.x += x;
    n.out.y += y;
  });
}
