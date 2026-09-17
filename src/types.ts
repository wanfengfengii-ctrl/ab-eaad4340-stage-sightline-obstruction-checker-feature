/** 画布坐标：x、y 均为 0~100 米，原点左下，x 向右，y 向上。 */
export interface Point {
  x: number
  y: number
}

/** 轴对齐障碍矩形（闭矩形），要求 left < right 且 bottom < top，id 唯一。 */
export interface Obstacle {
  id: string
  left: number
  bottom: number
  right: number
  top: number
}

/** 一个待核验的剖面方案：至多一个眼点、一个目标点、至多 20 个障碍。 */
export interface Scene {
  eye: Point
  target: Point
  obstacles: Obstacle[]
}
