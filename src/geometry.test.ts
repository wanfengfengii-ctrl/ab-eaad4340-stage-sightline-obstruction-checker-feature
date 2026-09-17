import { describe, expect, it } from 'vitest'
import { analyzeScene, segmentRectHit } from './geometry'
import type { Obstacle, Scene } from './types'

const rect = (id: string, left: number, bottom: number, right: number, top: number): Obstacle => ({
  id,
  left,
  bottom,
  right,
  top,
})

describe('segmentRectHit：闭线段与闭矩形求交', () => {
  it('线段穿过矩形时返回首个交点与距眼点的距离', () => {
    const hit = segmentRectHit({ x: 0, y: 0 }, { x: 10, y: 10 }, rect('r', 2, 2, 4, 4))
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(2, 9)
    expect(hit!.point.y).toBeCloseTo(2, 9)
    expect(hit!.distance).toBeCloseTo(Math.hypot(2, 2), 9)
  })

  it('仅触碰矩形角点也判定为相交', () => {
    // 线 y = x 仅在角点 (4,4) 接触矩形 [4,6]×[2,4]
    const hit = segmentRectHit({ x: 0, y: 0 }, { x: 10, y: 10 }, rect('r', 4, 2, 6, 4))
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(4, 9)
    expect(hit!.point.y).toBeCloseTo(4, 9)
    expect(hit!.distance).toBeCloseTo(Math.hypot(4, 4), 9)
  })

  it('仅贴合矩形边（相切）也判定为相交', () => {
    // 水平线 y = 5 贴着矩形 [3,6]×[2,5] 的上边
    const hit = segmentRectHit({ x: 0, y: 5 }, { x: 10, y: 5 }, rect('r', 3, 2, 6, 5))
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(3, 9)
    expect(hit!.point.y).toBeCloseTo(5, 9)
    expect(hit!.distance).toBeCloseTo(3, 9)
  })

  it('线段终点落在矩形上（闭线段含端点）判定为相交', () => {
    const hit = segmentRectHit({ x: 0, y: 0 }, { x: 2, y: 2 }, rect('r', 2, 2, 4, 4))
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeCloseTo(Math.hypot(2, 2), 9)
  })

  it('线段起点（眼点）落在矩形边上判定为相交，距离为 0', () => {
    const hit = segmentRectHit({ x: 1, y: 1 }, { x: 10, y: 1 }, rect('r', 1, 0, 3, 2))
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeCloseTo(0, 9)
  })

  it('眼点在矩形内部时首个交点即眼点，距离为 0', () => {
    const hit = segmentRectHit({ x: 2, y: 2 }, { x: 10, y: 2 }, rect('r', 1, 1, 3, 3))
    expect(hit).not.toBeNull()
    expect(hit!.distance).toBeCloseTo(0, 9)
    expect(hit!.point.x).toBeCloseTo(2, 9)
  })

  it('垂直线段与矩形相交', () => {
    const hit = segmentRectHit({ x: 5, y: 0 }, { x: 5, y: 10 }, rect('r', 4, 3, 6, 5))
    expect(hit).not.toBeNull()
    expect(hit!.point.x).toBeCloseTo(5, 9)
    expect(hit!.point.y).toBeCloseTo(3, 9)
    expect(hit!.distance).toBeCloseTo(3, 9)
  })

  it('完全不相交时返回 null', () => {
    expect(segmentRectHit({ x: 0, y: 0 }, { x: 10, y: 0 }, rect('r', 3, 1, 6, 4))).toBeNull()
  })

  it('矩形在线段延长线上但超出目标点时返回 null', () => {
    expect(segmentRectHit({ x: 0, y: 0 }, { x: 2, y: 2 }, rect('r', 5, 5, 6, 6))).toBeNull()
  })

  it('矩形在眼点反方向时返回 null', () => {
    expect(segmentRectHit({ x: 5, y: 5 }, { x: 10, y: 5 }, rect('r', 0, 4, 2, 6))).toBeNull()
  })
})

describe('analyzeScene：场景级判定', () => {
  it('无遮挡时返回 clear', () => {
    const scene: Scene = {
      eye: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      obstacles: [rect('a', 3, 1, 6, 4)],
    }
    expect(analyzeScene(scene)).toEqual({ status: 'clear' })
  })

  it('多个障碍命中时，取首个交点距眼点最近者（而非按 id）', () => {
    const scene: Scene = {
      eye: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      obstacles: [rect('a-far', 6, 0, 7, 1), rect('z-near', 2, 0, 3, 1)],
    }
    const result = analyzeScene(scene)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.obstacleId).toBe('z-near')
      expect(result.distance).toBeCloseTo(2, 9)
    }
  })

  it('同距时按 id 字典序取小', () => {
    // 两个矩形都在 x=3 处首次接触视线 y=0
    const scene: Scene = {
      eye: { x: 0, y: 0 },
      target: { x: 10, y: 0 },
      obstacles: [rect('b', 3, 0, 5, 1), rect('a', 3, 0, 4, 2)],
    }
    const result = analyzeScene(scene)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.obstacleId).toBe('a')
      expect(result.distance).toBeCloseTo(3, 9)
    }
  })

  it('擦边接触也判遮挡（默认场景：栏杆挡住字幕屏视线）', () => {
    const scene: Scene = {
      eye: { x: 8, y: 12 },
      target: { x: 92, y: 26 },
      obstacles: [
        rect('railing-1', 30, 0, 34, 20),
        rect('screen-rig', 70, 40, 74, 50),
      ],
    }
    const result = analyzeScene(scene)
    expect(result.status).toBe('blocked')
    if (result.status === 'blocked') {
      expect(result.obstacleId).toBe('railing-1')
      expect(result.point.x).toBeCloseTo(30, 9)
      expect(result.point.y).toBeCloseTo(12 + ((30 - 8) / 84) * 14, 9)
    }
  })
})
