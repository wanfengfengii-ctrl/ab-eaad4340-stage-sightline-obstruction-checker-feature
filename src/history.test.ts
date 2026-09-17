import { describe, expect, it } from 'vitest'
import { analyzeScene } from './geometry'
import {
  canRedo,
  canUndo,
  commit,
  commitDrag,
  createHistory,
  parseSnapshot,
  redo,
  serializeSnapshot,
  undo,
  MAX_HISTORY,
  type HistoryState,
} from './history'
import { parseSceneJson, validateScene } from './schema'
import type { Scene } from './types'

const base: Scene = { eye: { x: 8, y: 12 }, target: { x: 92, y: 26 }, obstacles: [] }

/** 仅改眼点 x 的便捷构造。 */
const withEyeX = (scene: Scene, x: number): Scene => ({ ...scene, eye: { ...scene.eye, x } })

/** 提交若干步眼点 x 变更，返回最终历史。 */
const commitSteps = (start: HistoryState, xs: number[]): HistoryState =>
  xs.reduce((h, x) => commit(h, withEyeX(h.present, x)), start)

describe('事务提交', () => {
  it('合法提交：编辑前场景入撤销栈，当前场景更新，重做栈清空', () => {
    const h0 = createHistory(base)
    const h1 = commit(h0, withEyeX(base, 20))
    expect(h1.present.eye.x).toBe(20)
    expect(h1.past).toEqual([base])
    expect(h1.future).toEqual([])
    expect(canUndo(h1)).toBe(true)
    expect(canRedo(h1)).toBe(false)
  })

  it('提交与当前相同的场景不产生事务', () => {
    const h0 = createHistory(base)
    const h1 = commit(h0, structuredClone(base))
    expect(h1).toBe(h0)
    expect(h1.past).toHaveLength(0)
  })

  it('force 提交（成功导入）即使内容相同也记一个事务', () => {
    const h0 = createHistory(base)
    const h1 = commit(h0, structuredClone(base), true)
    expect(h1.past).toEqual([base])
    expect(h1.future).toEqual([])
    expect(undo(h1).present).toEqual(base)
  })
})

describe('拖拽归并：按下至抬起的全部位移仅记一个事务', () => {
  it('拖拽过程中的多次位移不落栈，抬起时只产生一个事务', () => {
    let h = createHistory(base)

    // 按下：拖拽前场景由调用方锚定；移动期间仅替换 present（模拟 12 次 pointermove）
    const before = base
    for (let i = 1; i <= 12; i++) {
      h = { ...h, present: withEyeX(before, 8 + i) }
    }
    expect(h.past).toEqual([]) // 过程中撤销栈不增长

    // 抬起：全部位移归并为一个事务
    h = commitDrag(h, before, h.present)
    expect(h.past).toEqual([before])
    expect(h.present.eye.x).toBe(20)
    expect(h.future).toEqual([])

    // 一次撤销即回到拖拽前，不存在逐帧回退
    h = undo(h)
    expect(h.present).toEqual(base)
    expect(canUndo(h)).toBe(false)
  })

  it('拖拽后回到原位（位移为零）不产生事务', () => {
    const h0 = createHistory(base)
    const h1 = commitDrag(h0, base, structuredClone(base))
    expect(h1).toBe(h0)
  })

  it('取消或失去捕获：恢复拖拽前场景且不留历史', () => {
    let h = createHistory(base)
    const before = base
    // 拖拽中产生了临时位移
    h = { ...h, present: withEyeX(before, 50) }
    // 取消：present 回到锚点，past/future 均不变
    h = { ...h, present: before }
    expect(h.past).toEqual([])
    expect(h.future).toEqual([])
    expect(h.present).toEqual(base)
    expect(canUndo(h)).toBe(false)
  })
})

describe('撤销/重做与分支截断', () => {
  it('撤销后场景入重做栈，重做可回到撤销前', () => {
    const h1 = commitSteps(createHistory(base), [10, 20])
    expect(h1.past.map((s) => s.eye.x)).toEqual([8, 10])
    expect(h1.present.eye.x).toBe(20)

    const u = undo(h1)
    expect(u.present.eye.x).toBe(10)
    expect(u.future.map((s) => s.eye.x)).toEqual([20])
    expect(canUndo(u)).toBe(true)
    expect(canRedo(u)).toBe(true)

    const r = redo(u)
    expect(r).toEqual(h1)
  })

  it('撤销后发生新编辑须丢弃重做分支', () => {
    let h = commitSteps(createHistory(base), [10, 20, 30])
    h = undo(h) // 30 → 20，future=[30]
    h = undo(h) // 20 → 10，future=[20,30]
    expect(h.present.eye.x).toBe(10)
    expect(h.future.map((s) => s.eye.x)).toEqual([20, 30])

    // 在历史分支上做新编辑：重做分支被截断
    h = commit(h, withEyeX(h.present, 15))
    expect(h.present.eye.x).toBe(15)
    expect(h.future).toEqual([])
    expect(canRedo(h)).toBe(false)
    // 原分支内容无法再通过重做到达
    h = redo(h)
    expect(h.present.eye.x).toBe(15)
  })

  it('空栈撤销/重做是幂等无操作', () => {
    const h0 = createHistory(base)
    expect(undo(h0)).toBe(h0)
    expect(redo(h0)).toBe(h0)
  })
})

describe('容量上限：最多保留 50 个已提交事务', () => {
  it('51 次提交后撤销栈仍为 50，最旧记录被丢弃', () => {
    const h = commitSteps(createHistory(base), Array.from({ length: 51 }, (_, i) => 10 + i))
    expect(h.past).toHaveLength(MAX_HISTORY)
    // 最旧的 base(8) 已被丢弃，栈底为第一次提交后的场景（眼点 x=10）
    expect(h.past[0].eye.x).toBe(10)
    expect(h.present.eye.x).toBe(60)

    // 连续撤销 50 次到达最旧的可恢复场景
    let u = h
    for (let i = 0; i < MAX_HISTORY; i++) u = undo(u)
    expect(canUndo(u)).toBe(false)
    expect(u.present.eye.x).toBe(10)
  })

  it('恰好 50 次提交不丢记录，第 51 次才淘汰', () => {
    const h50 = commitSteps(createHistory(base), Array.from({ length: 50 }, (_, i) => 10 + i))
    expect(h50.past).toHaveLength(50)
    expect(h50.past[0]).toEqual(base)
  })
})

describe('持久化快照：序列化/解析往返一致', () => {
  it('当前场景、撤销栈、重做栈作为单一快照可完整往返', () => {
    let h = commitSteps(createHistory(base), [10, 20])
    h = undo(h) // present=10, future=[20]
    const raw = serializeSnapshot(h)
    const restored = parseSnapshot(raw)
    expect(restored.ok).toBe(true)
    if (!restored.ok) return
    expect(restored.history).toEqual(h)
    // 恢复后撤销/重做仍完全可操作
    expect(canUndo(restored.history)).toBe(true)
    expect(canRedo(restored.history)).toBe(true)
    expect(redo(restored.history).present.eye.x).toBe(20)
  })

  it('快照缺失（null 或空串）判定为 missing', () => {
    expect(parseSnapshot(null)).toEqual({ ok: false, reason: 'missing' })
    expect(parseSnapshot('   ')).toEqual({ ok: false, reason: 'missing' })
  })

  it.each([
    ['非法 JSON', '{not json'],
    ['版本缺失', JSON.stringify({ scene: base, undoStack: [], redoStack: [] })],
    ['版本错误', JSON.stringify({ version: 2, scene: base, undoStack: [], redoStack: [] })],
    ['当前场景非法', JSON.stringify({ version: 1, scene: { eye: { x: 200, y: 0 }, target: { x: 1, y: 1 }, obstacles: [] }, undoStack: [], redoStack: [] })],
    ['眼点目标重合', JSON.stringify({ version: 1, scene: { eye: { x: 1, y: 1 }, target: { x: 1, y: 1 }, obstacles: [] }, undoStack: [], redoStack: [] })],
    ['撤销栈不是数组', JSON.stringify({ version: 1, scene: base, undoStack: {}, redoStack: [] })],
    ['撤销栈含非法场景', JSON.stringify({ version: 1, scene: base, undoStack: [{ eye: { x: 1, y: 1 }, target: { x: 2, y: 2 }, obstacles: [{ id: 'a', left: 5, bottom: 5, right: 1, top: 1 }] }], redoStack: [] })],
    ['重做栈含非法场景', JSON.stringify({ version: 1, scene: base, undoStack: [], redoStack: [{ eye: { x: -1, y: 1 }, target: { x: 2, y: 2 }, obstacles: [] }] })],
    ['撤销栈超容量', JSON.stringify({ version: 1, scene: base, undoStack: Array.from({ length: 51 }, () => base), redoStack: [] })],
    ['根为数组', JSON.stringify([1, 2, 3])],
    ['根为 null', 'null'],
  ])('不合法快照（%s）判定为 invalid', (_name, raw) => {
    expect(parseSnapshot(raw)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('失败导入的契约：场景、遮挡判定与撤销/重做栈均不变', () => {
  // 复刻页面的两条提交路径：表单走普通提交，导入走 force 提交；
  // 二者都先经 validateScene 防线，非法场景一律不产生事务。
  const commitSceneIfValid = (h: HistoryState, next: Scene): HistoryState =>
    validateScene(next).ok ? commit(h, next) : h
  const commitImportIfValid = (h: HistoryState, next: Scene): HistoryState =>
    validateScene(next).ok ? commit(h, next, true) : h

  it('合法导入记一个事务；其后失败导入不改变场景、判定与双栈', () => {
    const imported: Scene = {
      eye: { x: 10, y: 10 },
      target: { x: 90, y: 10 },
      obstacles: [{ id: 'a', left: 40, bottom: 20, right: 50, top: 30 }],
    }
    // 一次成功导入（force）
    const okResult = parseSceneJson(JSON.stringify(imported))
    expect(okResult.ok).toBe(true)
    let h = commitImportIfValid(createHistory(base), imported)
    expect(h.past).toHaveLength(1)

    const snapshotBefore = { present: h.present, past: h.past, future: h.future }
    const analysisBefore = analyzeScene(h.present)

    // 失败导入：JSON 非法
    const badJson = parseSceneJson('{oops')
    expect(badJson.ok).toBe(false)

    // 失败导入：结构合法但 left > right
    const badScene = {
      eye: { x: 1, y: 1 },
      target: { x: 2, y: 2 },
      obstacles: [{ id: 'b', left: 60, bottom: 0, right: 50, top: 10 }],
    }
    const badResult = parseSceneJson(JSON.stringify(badScene))
    expect(badResult.ok).toBe(false)

    // 页面不调用提交；即使防御性地传入该场景，也会被场景校验拦截
    h = commitSceneIfValid(h, badScene as Scene)

    expect(h.present).toEqual(snapshotBefore.present)
    expect(h.past).toEqual(snapshotBefore.past)
    expect(h.future).toEqual(snapshotBefore.future)
    expect(analyzeScene(h.present)).toEqual(analysisBefore)
  })

  it('非法表单值不通过场景校验，因而不能产生事务或覆盖快照', () => {
    const h0 = createHistory(base)
    // 例如拖到眼点与目标重合（表单 validate 会先拦一道，此处校验提交防线）
    const invalid = { ...base, eye: { ...base.target } }
    expect(validateScene(invalid).ok).toBe(false)
    const h1 = commitSceneIfValid(h0, invalid)
    expect(h1).toBe(h0)
    expect(serializeSnapshot(h1)).toContain('"eye":{"x":8,"y":12}')
  })
})
