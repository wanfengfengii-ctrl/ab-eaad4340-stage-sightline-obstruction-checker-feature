import { HISTORY_LIMIT, type HistoryState } from './history'
import { validateScene } from './schema'
import type { Scene } from './types'

/** 快照格式版本：结构变更时递增，旧版本快照整体判为不合法。 */
export const SNAPSHOT_VERSION = 1

/** 浏览器存储键：当前场景、撤销栈、重做栈作为单一快照写入该键。 */
export const STORAGE_KEY = 'theater-sightline-checker/snapshot/v1'

interface SnapshotV1 {
  version: typeof SNAPSHOT_VERSION
  scene: Scene
  undoStack: Scene[]
  redoStack: Scene[]
}

export type RestoreResult =
  | { ok: true; history: HistoryState }
  | { ok: false; reason: 'missing' | 'invalid' }

/** 序列化为单一快照文本（当前场景 + 撤销栈 + 重做栈）。 */
export function serializeSnapshot(state: HistoryState): string {
  const snapshot: SnapshotV1 = {
    version: SNAPSHOT_VERSION,
    scene: state.scene,
    undoStack: state.undoStack,
    redoStack: state.redoStack,
  }
  return JSON.stringify(snapshot)
}

/** 复用现有场景校验：只有通过 validateScene 的场景才允许进入历史。 */
function readSnapshotScene(value: unknown): Scene | null {
  const result = validateScene(value)
  return result.ok ? result.scene : null
}

function readStack(value: unknown): Scene[] | null {
  if (!Array.isArray(value) || value.length > HISTORY_LIMIT) return null
  const stack: Scene[] = []
  for (const entry of value) {
    const scene = readSnapshotScene(entry)
    if (!scene) return null
    stack.push(scene)
  }
  return stack
}

/**
 * 解析并校验快照文本。任何一处不合法（JSON 损坏、版本不符、结构缺失、
 * 任一场景未通过现有校验、栈超容量）都整体拒绝，调用方应回退默认场景。
 */
export function parseSnapshot(text: string): RestoreResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'invalid' }
  }
  const record = data as Record<string, unknown>
  if (record.version !== SNAPSHOT_VERSION) return { ok: false, reason: 'invalid' }

  const scene = readSnapshotScene(record.scene)
  const undoStack = readStack(record.undoStack)
  const redoStack = readStack(record.redoStack)
  if (!scene || !undoStack || !redoStack) return { ok: false, reason: 'invalid' }

  return { ok: true, history: { scene, undoStack, redoStack } }
}

/** 从浏览器存储读取快照；键缺失返回 missing，内容不合法返回 invalid。 */
export function loadSnapshot(storage: Storage): RestoreResult {
  let text: string | null
  try {
    text = storage.getItem(STORAGE_KEY)
  } catch {
    return { ok: false, reason: 'missing' }
  }
  if (text === null) return { ok: false, reason: 'missing' }
  return parseSnapshot(text)
}

/** 写入单一快照；存储不可用（配额、隐私模式等）时返回 false，不抛异常。 */
export function saveSnapshot(storage: Storage, state: HistoryState): boolean {
  try {
    storage.setItem(STORAGE_KEY, serializeSnapshot(state))
    return true
  } catch {
    return false
  }
}
