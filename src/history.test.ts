import { describe, expect, it } from 'vitest'
import {
  canRedo,
  canUndo,
  cancelDragTransaction,
  commitDragTransaction,
  commitTransaction,
  createHistory,
  HISTORY_LIMIT,
  redoTransaction,
  sceneEquals,
  undoTransaction,
  type HistoryState,
} from './history'
import type { Scene } from './types'

/** 构造仅眼点不同的场景，便于区分历史条目。 */
const sceneAt = (x: number): Scene => ({
  eye: { x, y: 12 },
  target: { x: 92, y: 26 },
  obstacles: [{ id: 'railing-1', left: 30, bottom: 0, right: 34, top: 20 }],
})

/** 模拟拖拽中的即时预览：只替换当前场景，不触碰历史栈（与 App 的 previewScene 一致）。 */
const preview = (state: HistoryState, scene: Scene): HistoryState => ({ ...state, scene })

describe('commitTransaction：基础事务', () => {
  it('提交后当前场景入撤销栈，重做栈清空', () => {
    const s0 = sceneAt(8)
    const s1 = sceneAt(10)
    const h = commitTransaction(createHistory(s0), s1)
    expect(h.scene).toEqual(s1)
    expect(h.undoStack).toEqual([s0])
    expect(h.redoStack).toEqual([])
    expect(canUndo(h)).toBe(true)
    expect(canRedo(h)).toBe(false)
  })

  it('提交与当前场景相等的结果不产生事务', () => {
    const h0 = createHistory(sceneAt(8))
    const h1 = commitTransaction(h0, sceneAt(8))
    expect(h1).toBe(h0)
    expect(h1.undoStack).toHaveLength(0)
  })

  it('撤销 / 重做沿栈往返，空栈时原样返回', () => {
    const [s0, s1, s2] = [sceneAt(8), sceneAt(10), sceneAt(12)]
    let h = createHistory(s0)
    h = commitTransaction(h, s1)
    h = commitTransaction(h, s2)

    h = undoTransaction(h)
    expect(h.scene).toEqual(s1)
    h = undoTransaction(h)
    expect(h.scene).toEqual(s0)
    expect(canUndo(h)).toBe(false)
    expect(undoTransaction(h)).toBe(h)

    h = redoTransaction(h)
    expect(h.scene).toEqual(s1)
    h = redoTransaction(h)
    expect(h.scene).toEqual(s2)
    expect(canRedo(h)).toBe(false)
    expect(redoTransaction(h)).toBe(h)
  })
})

describe('拖拽归并：按下至抬起仅记一个事务', () => {
  it('多次预览位移归并为单个事务，撤销一步回到拖拽前', () => {
    const origin = sceneAt(8)
    let h = createHistory(origin)

    // 模拟一次拖拽：按下后经过 3 次预览位移，抬起时提交
    h = preview(h, sceneAt(10))
    h = preview(h, sceneAt(12))
    h = preview(h, sceneAt(14))
    h = commitDragTransaction(h, origin)

    expect(h.scene).toEqual(sceneAt(14))
    expect(h.undoStack).toHaveLength(1)
    expect(h.undoStack[0]).toEqual(origin)
    expect(h.redoStack).toHaveLength(0)

    // 一次撤销直接回到拖拽前，而非中间预览位置
    h = undoTransaction(h)
    expect(h.scene).toEqual(origin)
    expect(canUndo(h)).toBe(false)
    // 重做一步回到抬起时的最终位置
    h = redoTransaction(h)
    expect(h.scene).toEqual(sceneAt(14))
  })

  it('拖回原位（净位移为零）不产生事务', () => {
    const origin = sceneAt(8)
    let h = createHistory(origin)
    h = preview(h, sceneAt(20))
    h = preview(h, sceneAt(8)) // 拖回起点
    const committed = commitDragTransaction(h, origin)
    expect(committed.undoStack).toHaveLength(0)
    expect(canUndo(committed)).toBe(false)
  })

  it('取消拖拽：恢复拖拽前场景且不留历史', () => {
    const origin = sceneAt(8)
    let h = createHistory(origin)
    h = preview(h, sceneAt(10))
    h = preview(h, sceneAt(14))
    h = cancelDragTransaction(h, origin)

    expect(h.scene).toEqual(origin)
    expect(h.undoStack).toHaveLength(0)
    expect(h.redoStack).toHaveLength(0)
  })

  it('取消拖拽不影响已有历史', () => {
    const s0 = sceneAt(8)
    const s1 = sceneAt(10)
    let h = commitTransaction(createHistory(s0), s1)
    const undoBefore = h.undoStack

    // 在 s1 基础上开始拖拽又取消
    h = preview(h, sceneAt(30))
    h = cancelDragTransaction(h, s1)

    expect(h.scene).toEqual(s1)
    expect(h.undoStack).toBe(undoBefore)
    expect(h.undoStack).toEqual([s0])
  })
})

describe('分支截断：撤销后的新编辑丢弃重做分支', () => {
  it('撤销后提交新事务，重做栈被清空', () => {
    const [s0, s1, s2, s3] = [sceneAt(8), sceneAt(10), sceneAt(12), sceneAt(20)]
    let h = createHistory(s0)
    h = commitTransaction(h, s1)
    h = commitTransaction(h, s2)

    h = undoTransaction(h) // 回到 s1，s2 进入重做栈
    expect(h.scene).toEqual(s1)
    expect(canRedo(h)).toBe(true)

    h = commitTransaction(h, s3) // 新编辑：重做分支（s2）必须被丢弃
    expect(h.scene).toEqual(s3)
    expect(h.redoStack).toHaveLength(0)
    expect(canRedo(h)).toBe(false)
    expect(redoTransaction(h)).toBe(h) // 重做不可用，状态不变

    // 撤销应回到 s1 而非 s2
    h = undoTransaction(h)
    expect(h.scene).toEqual(s1)
  })

  it('撤销后完成一次拖拽提交，同样丢弃重做分支', () => {
    const [s0, s1] = [sceneAt(8), sceneAt(10)]
    let h = createHistory(s0)
    h = commitTransaction(h, s1)
    h = undoTransaction(h) // 回到 s0，s1 可重做

    // 从 s0 拖出一次位移并提交
    h = preview(h, sceneAt(25))
    h = commitDragTransaction(h, s0)

    expect(h.redoStack).toHaveLength(0)
    expect(canRedo(h)).toBe(false)
    h = undoTransaction(h)
    expect(h.scene).toEqual(s0)
    expect(h.redoStack).toHaveLength(1) // 可重做的是拖拽事务，不是被截断的 s1
    expect(h.redoStack[0]).not.toEqual(s1)
    expect(h.redoStack[0]).toEqual(sceneAt(25))
  })
})

describe('容量上限：最多保留 50 个已提交事务', () => {
  it(`连续提交 ${HISTORY_LIMIT + 10} 个事务后撤销栈保持 ${HISTORY_LIMIT}，最旧事务被丢弃`, () => {
    let h = createHistory(sceneAt(0))
    for (let i = 1; i <= HISTORY_LIMIT + 10; i += 1) {
      h = commitTransaction(h, sceneAt(i))
    }
    expect(h.undoStack).toHaveLength(HISTORY_LIMIT)
    // 栈底（最旧可撤销事务）是第 10 次提交前的场景，更早的 0~9 已被丢弃
    expect(h.undoStack[0]).toEqual(sceneAt(10))
    expect(h.undoStack[HISTORY_LIMIT - 1]).toEqual(sceneAt(HISTORY_LIMIT + 9))

    // 恰好可撤销 50 次，之后撤销为空操作
    for (let i = 0; i < HISTORY_LIMIT; i += 1) {
      h = undoTransaction(h)
    }
    expect(h.scene).toEqual(sceneAt(10))
    expect(canUndo(h)).toBe(false)
    expect(undoTransaction(h)).toBe(h)
  })

  it('拖拽归并事务同样受容量上限约束', () => {
    let h = createHistory(sceneAt(0))
    for (let i = 1; i <= HISTORY_LIMIT + 5; i += 1) {
      const origin = sceneAt(i - 1)
      h = preview(h, sceneAt(i))
      h = commitDragTransaction(h, origin)
    }
    expect(h.undoStack).toHaveLength(HISTORY_LIMIT)
    expect(h.undoStack[0]).toEqual(sceneAt(5))
  })
})

describe('sceneEquals', () => {
  it('逐字段相等判定，障碍顺序敏感', () => {
    const a = sceneAt(8)
    expect(sceneEquals(a, sceneAt(8))).toBe(true)
    expect(sceneEquals(a, sceneAt(9))).toBe(false)
    const two: Scene = {
      ...a,
      obstacles: [
        { id: 'a', left: 0, bottom: 0, right: 1, top: 1 },
        { id: 'b', left: 2, bottom: 2, right: 3, top: 3 },
      ],
    }
    const swapped: Scene = { ...two, obstacles: [two.obstacles[1], two.obstacles[0]] }
    expect(sceneEquals(two, swapped)).toBe(false)
    expect(sceneEquals(two, { ...two, obstacles: two.obstacles.slice(0, 1) })).toBe(false)
  })
})
