import { validateScene } from './schema'
import type { Scene } from './types'

/** 已提交事务的最大保留数量（撤销栈容量）。 */
export const MAX_HISTORY = 50

/**
 * 事务化编辑历史：
 * - past 为撤销栈，栈顶是最近一次已提交的编辑前场景；
 * - present 为当前场景；
 * - future 为重做栈，栈顶是最近一次撤销掉的编辑后场景。
 * 所有场景均为同一数据结构的不可变快照（编辑时整体替换，不做局部突变）。
 */
export interface HistoryState {
  past: Scene[]
  present: Scene
  future: Scene[]
}

/** 创建空历史（无任何已提交事务）。 */
export function createHistory(present: Scene): HistoryState {
  return { past: [], present, future: [] }
}

/**
 * 提交一个编辑事务：编辑前的场景压入撤销栈，清空重做分支
 * （撤销后再编辑会丢弃可重做的内容）；撤销栈超过 50 条时丢弃最旧记录。
 * next 与当前场景相同时默认不产生事务（空提交）；force 用于“成功导入”——
 * 即使内容与当前一致，导入本身也是一次明确的用户动作，仍记一个事务。
 */
export function commit(state: HistoryState, next: Scene, force = false): HistoryState {
  if (!force && scenesEqual(state.present, next)) return state
  const past = [...state.past, state.present]
  if (past.length > MAX_HISTORY) past.shift()
  return { past, present: next, future: [] }
}

/**
 * 提交一次画布拖拽事务：按下时的场景 before 与抬起时的场景 after 不同，
 * 才把按下前场景压入撤销栈并清空重做分支——按下至抬起的全部位移合并为一个事务；
 * 拖拽后回到原位（或未发生位移）时不产生事务。
 */
export function commitDrag(state: HistoryState, before: Scene, after: Scene): HistoryState {
  if (scenesEqual(before, after)) return state
  const past = [...state.past, before]
  if (past.length > MAX_HISTORY) past.shift()
  return { past, present: after, future: [] }
}

/** 撤销：当前场景移入重做栈，撤销栈栈顶成为当前场景。 */
export function undo(state: HistoryState): HistoryState {
  if (state.past.length === 0) return state
  const previous = state.past[state.past.length - 1]
  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [state.present, ...state.future],
  }
}

/** 重做：当前场景移回撤销栈，重做栈栈顶成为当前场景。 */
export function redo(state: HistoryState): HistoryState {
  if (state.future.length === 0) return state
  const next = state.future[0]
  return {
    past: [...state.past, state.present],
    present: next,
    future: state.future.slice(1),
  }
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0
}

/** 结构相等（场景数据均为 JSON 值，按序列化结果比较）。 */
export function scenesEqual(a: Scene, b: Scene): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 浏览器存储中的单一快照：当前场景、撤销栈、重做栈一并持久化。
 * version 用于将来格式演进；当前为 1。
 */
export interface StoredSnapshot {
  version: 1
  scene: Scene
  undoStack: Scene[]
  redoStack: Scene[]
}

export type RestoreResult =
  | { ok: true; history: HistoryState }
  | { ok: false; reason: 'missing' | 'invalid' }

/** 校验一个未知值是否为合法场景（复用现有场景校验规则）。 */
function isScene(value: unknown): value is Scene {
  return validateScene(value).ok
}

/**
 * 解析并校验持久化快照。快照缺失（键不存在或为空串）与快照不合法
 * （JSON 解析失败、结构不符、版本不对、任一栈元素或当前场景通不过现有
 * 场景校验）均不得接管页面：调用方载入默认场景并明确提示恢复失败。
 */
export function parseSnapshot(raw: string | null): RestoreResult {
  if (raw === null || raw.trim() === '') return { ok: false, reason: 'missing' }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, reason: 'invalid' }
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, reason: 'invalid' }
  }
  const snap = data as Record<string, unknown>
  if (snap.version !== 1) return { ok: false, reason: 'invalid' }
  if (!isScene(snap.scene)) return { ok: false, reason: 'invalid' }
  if (!Array.isArray(snap.undoStack) || !Array.isArray(snap.redoStack)) {
    return { ok: false, reason: 'invalid' }
  }
  if (snap.undoStack.length > MAX_HISTORY || snap.redoStack.length > MAX_HISTORY) {
    return { ok: false, reason: 'invalid' }
  }
  if (!snap.undoStack.every(isScene) || !snap.redoStack.every(isScene)) {
    return { ok: false, reason: 'invalid' }
  }

  return {
    ok: true,
    history: {
      past: snap.undoStack as Scene[],
      present: snap.scene as Scene,
      future: snap.redoStack as Scene[],
    },
  }
}

/** 将历史序列化为写入存储的单一快照字符串。 */
export function serializeSnapshot(history: HistoryState): string {
  const snapshot: StoredSnapshot = {
    version: 1,
    scene: history.present,
    undoStack: history.past,
    redoStack: history.future,
  }
  return JSON.stringify(snapshot)
}
