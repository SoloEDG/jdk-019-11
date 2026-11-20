export interface Point {
  x: number;
  y: number;
}
export interface Node extends Point {
  in: Point;
  out: Point;
}
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export type WarpMode = "perspective" | "envelope";
export interface WarpGrid {
  rows: number;
  cols: number;
  /** Destination positions, row-major, rows × cols. */
  points: Point[];
}
export interface WarpSpace {
  /** Group id when the shapes belong to a group, otherwise the leading shape id. */
  id: string;
  mode: WarpMode;
  /** Undeformed region the warp is defined on. Never mutated by the effect. */
  bounds: Bounds;
  /** Destination position of the four source corners: TL, TR, BR, BL. */
  quad: [Point, Point, Point, Point];
  mesh: WarpGrid;
  /** Target contour error (artboard units) used when expanding the effect. */
  detail: number;
}
export interface WarpEffect {
  space: string;
  /**
   * Baked approximation. `null` means the effect is still live and the
   * original `nodes` remain the editable master.
   */
  baked: Node[] | null;
}
export interface Shape {
  id: string;
  name: string;
  nodes: Node[];
  closed: boolean;
  fill: string;
  stroke: string;
  width: number;
  opacity: number;
  group?: string;
  warp?: WarpEffect;
}
export interface Document {
  shapes: Shape[];
  warps: WarpSpace[];
  selected: string[];
  tool: string;
  zoom: number;
}
