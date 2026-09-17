import { describe, expect, it } from 'vitest'
import { parseSceneJson, validateScene } from './schema'
import type { Scene } from './types'

const validScene: Scene = {
  eye: { x: 8, y: 12 },
  target: { x: 92, y: 26 },
  obstacles: [{ id: 'railing-1', left: 30, bottom: 0, right: 34, top: 20 }],
}

const makeObstacles = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `ob-${i}`,
    left: 0,
    bottom: 0,
    right: 1,
    top: 1,
  }))

describe('validateScene：合法输入', () => {
  it('合法场景通过校验并原样返回', () => {
    const result = validateScene(validScene)
    expect(result).toEqual({ ok: true, scene: validScene })
  })

  it('空障碍数组合法', () => {
    const result = validateScene({ eye: { x: 1, y: 1 }, target: { x: 2, y: 2 }, obstacles: [] })
    expect(result.ok).toBe(true)
  })

  it('边界值 0 与 100 合法', () => {
    const result = validateScene({
      eye: { x: 0, y: 0 },
      target: { x: 100, y: 100 },
      obstacles: [{ id: 'a', left: 0, bottom: 0, right: 100, top: 100 }],
    })
    expect(result.ok).toBe(true)
  })

  it('两位小数合法', () => {
    const result = validateScene({
      eye: { x: 0.01, y: 99.99 },
      target: { x: 50.5, y: 60.25 },
      obstacles: [],
    })
    expect(result.ok).toBe(true)
  })

  it('恰好 20 个障碍合法', () => {
    const result = validateScene({ eye: { x: 0, y: 0 }, target: { x: 1, y: 1 }, obstacles: makeObstacles(20) })
    expect(result.ok).toBe(true)
  })
})

describe('validateScene：非法输入整体拒绝', () => {
  it('坐标越界（小于 0 或大于 100）', () => {
    expect(validateScene({ eye: { x: -0.01, y: 1 }, target: { x: 2, y: 2 }, obstacles: [] }).ok).toBe(false)
    expect(validateScene({ eye: { x: 1, y: 1 }, target: { x: 100.01, y: 2 }, obstacles: [] }).ok).toBe(false)
  })

  it('超过两位小数', () => {
    const result = validateScene({ eye: { x: 10.001, y: 1 }, target: { x: 2, y: 2 }, obstacles: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('两位小数')
  })

  it('left >= right 或 bottom >= top', () => {
    expect(
      validateScene({ ...validScene, obstacles: [{ id: 'a', left: 34, bottom: 0, right: 34, top: 20 }] }).ok,
    ).toBe(false)
    expect(
      validateScene({ ...validScene, obstacles: [{ id: 'a', left: 30, bottom: 20, right: 34, top: 20 }] }).ok,
    ).toBe(false)
  })

  it('眼点与目标点重合', () => {
    const result = validateScene({ eye: { x: 5, y: 5 }, target: { x: 5, y: 5 }, obstacles: [] })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('重合')
  })

  it('障碍 id 重复', () => {
    const result = validateScene({
      ...validScene,
      obstacles: [
        { id: 'a', left: 1, bottom: 1, right: 2, top: 2 },
        { id: 'a', left: 3, bottom: 3, right: 4, top: 4 },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('重复')
  })

  it('id 为空或非字符串', () => {
    expect(validateScene({ ...validScene, obstacles: [{ id: '', left: 1, bottom: 1, right: 2, top: 2 }] }).ok).toBe(false)
    expect(validateScene({ ...validScene, obstacles: [{ id: 7, left: 1, bottom: 1, right: 2, top: 2 }] }).ok).toBe(false)
  })

  it('超过 20 个障碍', () => {
    const result = validateScene({ eye: { x: 0, y: 0 }, target: { x: 1, y: 1 }, obstacles: makeObstacles(21) })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors.join()).toContain('20')
  })

  it('缺少字段或含未知字段', () => {
    expect(validateScene({ eye: { x: 1, y: 1 }, target: { x: 2, y: 2 } }).ok).toBe(false)
    expect(validateScene({ ...validScene, name: 'x' }).ok).toBe(false)
    expect(validateScene({ eye: { x: 1 }, target: { x: 2, y: 2 }, obstacles: [] }).ok).toBe(false)
    expect(
      validateScene({ ...validScene, obstacles: [{ id: 'a', left: 1, bottom: 1, right: 2, top: 2, note: 'n' }] }).ok,
    ).toBe(false)
  })

  it('类型错误：非数字坐标、非数组障碍、非对象根节点', () => {
    expect(validateScene({ eye: { x: '1', y: 1 }, target: { x: 2, y: 2 }, obstacles: [] }).ok).toBe(false)
    expect(validateScene({ eye: { x: 1, y: 1 }, target: { x: 2, y: 2 }, obstacles: {} }).ok).toBe(false)
    expect(validateScene(null).ok).toBe(false)
    expect(validateScene([1, 2, 3]).ok).toBe(false)
    expect(validateScene({ eye: { x: NaN, y: 1 }, target: { x: 2, y: 2 }, obstacles: [] }).ok).toBe(false)
  })
})

describe('parseSceneJson', () => {
  it('非法 JSON 文本整体拒绝', () => {
    const result = parseSceneJson('{ not json')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]).toContain('JSON')
  })

  it('合法 JSON 文本返回场景', () => {
    const result = parseSceneJson(JSON.stringify(validScene))
    expect(result).toEqual({ ok: true, scene: validScene })
  })

  it('合法 JSON 但违反规则时整体拒绝', () => {
    const result = parseSceneJson(JSON.stringify({ eye: { x: 1, y: 1 }, target: { x: 1, y: 1 }, obstacles: [] }))
    expect(result.ok).toBe(false)
  })
})
