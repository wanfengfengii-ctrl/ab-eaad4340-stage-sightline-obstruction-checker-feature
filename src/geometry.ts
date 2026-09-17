import type { Obstacle, Point, Scene } from './types'

/** 浮点容差：输入最多两位小数，1e-9 远小于可表达的最小间隔，仅用于吸收二进制浮点误差。 */
const EPS = 1e-9

/** 四舍五入到两位小数（拖拽落点用，保证数值口径与导入一致）。 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100
}

export interface RectHit {
  /** 线段参数 t ∈ [0,1]，P(t) = eye + t·(target − eye)。 */
  t: number
  /** 沿视线方向的首个交点。 */
  point: Point
  /** 首个交点到眼点的距离（米）。 */
  distance: number
}

/**
 * 闭线段 eye→target 与闭矩形的求交（slab 法）。
 * 只要二者有公共点即返回命中——包含仅擦边、仅碰角、端点落在矩形上、眼点在矩形内部。
 * 不相交时返回 null。
 */
export function segmentRectHit(eye: Point, target: Point, rect: Obstacle): RectHit | null {
  const dx = target.x - eye.x
  const dy = target.y - eye.y
  // 进入/离开参数区间，初始即线段本身 [0,1]
  let tEnter = 0
  let tExit = 1

  if (dx === 0) {
    if (eye.x < rect.left - EPS || eye.x > rect.right + EPS) return null
  } else {
    let t1 = (rect.left - eye.x) / dx
    let t2 = (rect.right - eye.x) / dx
    if (t1 > t2) [t1, t2] = [t2, t1]
    tEnter = Math.max(tEnter, t1)
    tExit = Math.min(tExit, t2)
  }

  if (dy === 0) {
    if (eye.y < rect.bottom - EPS || eye.y > rect.top + EPS) return null
  } else {
    let t1 = (rect.bottom - eye.y) / dy
    let t2 = (rect.top - eye.y) / dy
    if (t1 > t2) [t1, t2] = [t2, t1]
    tEnter = Math.max(tEnter, t1)
    tExit = Math.min(tExit, t2)
  }

  // 闭区间判定：tEnter == tExit（擦边/碰角）也算相交
  if (tEnter > tExit + EPS) return null

  const t = Math.min(Math.max(tEnter, 0), 1)
  const point = { x: eye.x + t * dx, y: eye.y + t * dy }
  return { t, point, distance: Math.hypot(dx, dy) * t }
}

export type Analysis =
  | { status: 'clear' }
  | { status: 'blocked'; obstacleId: string; point: Point; distance: number }

/**
 * 核验整个方案：
 * - 任一障碍与视线闭线段相交即判遮挡；
 * - 首个障碍按“沿视线首个交点距眼点的距离”最近者确定，同距时按 id 字典序取小。
 */
export function analyzeScene(scene: Scene): Analysis {
  let best: { obstacleId: string; point: Point; distance: number } | null = null
  for (const obstacle of scene.obstacles) {
    const hit = segmentRectHit(scene.eye, scene.target, obstacle)
    if (!hit) continue
    if (
      best === null ||
      hit.distance < best.distance - EPS ||
      (Math.abs(hit.distance - best.distance) <= EPS && obstacle.id < best.obstacleId)
    ) {
      best = { obstacleId: obstacle.id, point: hit.point, distance: hit.distance }
    }
  }
  return best === null ? { status: 'clear' } : { status: 'blocked', ...best }
}
