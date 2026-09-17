import { describe, expect, it } from 'vitest'
import { commit, createHistory, undo } from './history'
import { persistHistory, restoreHistory, type SceneStorage } from './storage'
import type { Scene } from './types'

const base: Scene = { eye: { x: 8, y: 12 }, target: { x: 92, y: 26 }, obstacles: [] }

/** 内存存储：模拟 localStorage 的同步读写语义。 */
function memoryStorage(initial: Record<string, string> = {}): SceneStorage & { map: Record<string, string> } {
  const map = { ...initial }
  return {
    map,
    read: () => (Object.hasOwn(map, 'k') ? map['k'] : null),
    write: (raw) => {
      map['k'] = raw
      return true
    },
  }
}

/** 始终写入失败的存储（模拟配额超限 / 存储被禁用）。 */
const failingStorage = (): SceneStorage => ({
  read: () => null,
  write: () => false,
})

describe('restoreHistory / persistHistory', () => {
  it('无快照时返回 missing', () => {
    expect(restoreHistory(memoryStorage())).toEqual({ ok: false, reason: 'missing' })
  })

  it('合法快照往返：当前场景与双栈完整恢复', () => {
    const storage = memoryStorage()
    let h = commit(createHistory(base), { ...base, eye: { x: 20, y: 12 } })
    h = undo(h)
    expect(persistHistory(storage, h)).toBe(true)

    const restored = restoreHistory(storage)
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      expect(restored.history).toEqual(h)
    }
  })

  it('损坏快照返回 invalid，不抛出', () => {
    const storage = memoryStorage({ k: 'not-json{' })
    expect(restoreHistory(storage)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('写入失败时返回 false，但历史状态本身不受影响（调用方可继续编辑与撤销）', () => {
    const h = commit(createHistory(base), { ...base, eye: { x: 20, y: 12 } })
    expect(persistHistory(failingStorage(), h)).toBe(false)
    // 内存历史完好：撤销仍可用
    expect(undo(h).present).toEqual(base)
  })
})
