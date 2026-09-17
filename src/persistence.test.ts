import { describe, expect, it } from 'vitest'
import { commitTransaction, createHistory, undoTransaction, type HistoryState } from './history'
import {
  loadSnapshot,
  parseSnapshot,
  saveSnapshot,
  serializeSnapshot,
  STORAGE_KEY,
} from './persistence'
import { DEFAULT_SCENE } from './presets'
import type { Scene } from './types'

const sceneAt = (x: number): Scene => ({
  eye: { x, y: 12 },
  target: { x: 92, y: 26 },
  obstacles: [{ id: 'railing-1', left: 30, bottom: 0, right: 34, top: 20 }],
})

/** 构造一段含撤销栈与重做栈的历史：s0 →（提交）→ s1 →（提交）→ s2 →（撤销）→ s1。 */
function sampleHistory(): HistoryState {
  let h = createHistory(sceneAt(8))
  h = commitTransaction(h, sceneAt(10))
  h = commitTransaction(h, sceneAt(12))
  h = undoTransaction(h)
  return h
}

/** 内存版 Storage，可注入 setItem 异常模拟写入失败。 */
function memoryStorage(options?: { failSet?: boolean }): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => {
      if (options?.failSet) throw new DOMException('quota exceeded', 'QuotaExceededError')
      map.set(key, value)
    },
  }
}

describe('快照持久化：单一快照往返', () => {
  it('当前场景、撤销栈、重做栈写入同一键并可完整恢复', () => {
    const storage = memoryStorage()
    const h = sampleHistory()
    expect(saveSnapshot(storage, h)).toBe(true)

    const raw = storage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!) as Record<string, unknown>
    expect(Object.keys(parsed).sort()).toEqual(['redoStack', 'scene', 'undoStack', 'version'])

    const restored = loadSnapshot(storage)
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      expect(restored.history).toEqual(h)
      // 恢复后的栈仍可继续操作
      const undone = undoTransaction(restored.history)
      expect(undone.scene).toEqual(sceneAt(8))
    }
  })

  it('serializeSnapshot / parseSnapshot 互为逆操作', () => {
    const h = sampleHistory()
    const result = parseSnapshot(serializeSnapshot(h))
    expect(result).toEqual({ ok: true, history: h })
  })
})

describe('快照恢复：缺失或不合法整体拒绝', () => {
  it('键缺失返回 missing', () => {
    expect(loadSnapshot(memoryStorage())).toEqual({ ok: false, reason: 'missing' })
  })

  it('JSON 损坏返回 invalid', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, '{not json')
    expect(loadSnapshot(storage)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('版本不符返回 invalid', () => {
    const storage = memoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 999, scene: DEFAULT_SCENE, undoStack: [], redoStack: [] }))
    expect(loadSnapshot(storage)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('当前场景未通过现有场景校验时整体拒绝', () => {
    const storage = memoryStorage()
    const bad = { ...DEFAULT_SCENE, eye: { x: 8, y: 120 } } // y 越界
    storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, scene: bad, undoStack: [], redoStack: [] }))
    expect(loadSnapshot(storage)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('撤销栈 / 重做栈中任一条目非法时整体拒绝', () => {
    const h = sampleHistory()
    const snapshot = JSON.parse(serializeSnapshot(h)) as {
      undoStack: unknown[]
      redoStack: unknown[]
    }
    snapshot.undoStack = [...snapshot.undoStack, { eye: { x: 0, y: 0 }, target: { x: 0, y: 0 }, obstacles: [] }] // 眼点目标重合
    snapshot.redoStack = [{ ...DEFAULT_SCENE, obstacles: [{ id: 'x', left: 50, bottom: 0, right: 40, top: 10 }] }] // left > right
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('栈长度超过容量上限返回 invalid', () => {
    const h = sampleHistory()
    const snapshot = JSON.parse(serializeSnapshot(h)) as { undoStack: unknown[] }
    snapshot.undoStack = Array.from({ length: 51 }, () => DEFAULT_SCENE)
    expect(parseSnapshot(JSON.stringify(snapshot))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('结构缺失（非对象 / 缺字段）返回 invalid', () => {
    expect(parseSnapshot('42')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSnapshot('[]')).toEqual({ ok: false, reason: 'invalid' })
    expect(parseSnapshot(JSON.stringify({ version: 1, scene: DEFAULT_SCENE }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })
})

describe('快照写入失败', () => {
  it('setItem 抛异常时返回 false，不影响内存中的历史', () => {
    const storage = memoryStorage({ failSet: true })
    const h = sampleHistory()
    expect(saveSnapshot(storage, h)).toBe(false)
    // 内存状态不受写入失败影响，撤销仍可用（sampleHistory 当前在 sceneAt(10)，撤销后回到 sceneAt(8)）
    const undone = undoTransaction(h)
    expect(undone.scene).toEqual(sceneAt(8))
    expect(undone.redoStack).toHaveLength(2)
  })
})
