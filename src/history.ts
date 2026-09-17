import type { Scene } from './types'

/** 已提交事务的保留上限：撤销栈最多容纳 50 个事务，超出时丢弃最旧者。 */
export const HISTORY_LIMIT = 50

/**
 * 事务化编辑历史：
 * - `scene` 为当前生效场景；
 * - `undoStack` 保存可撤销的历史场景（栈底最旧、栈顶最近），长度即已提交且可撤销的事务数；
 * - `redoStack` 保存被撤销、可重做的场景（栈顶为下一个可重做事务）。
 */
export interface HistoryState {
  scene: Scene
  undoStack: Scene[]
  redoStack: Scene[]
}

/** 以给定场景为起点创建空历史。 */
export function createHistory(scene: Scene): HistoryState {
  return { scene, undoStack: [], redoStack: [] }
}

/** 两个场景是否完全相等（逐字段值比较，障碍顺序敏感）。 */
export function sceneEquals(a: Scene, b: Scene): boolean {
  if (a.eye.x !== b.eye.x || a.eye.y !== b.eye.y) return false
  if (a.target.x !== b.target.x || a.target.y !== b.target.y) return false
  if (a.obstacles.length !== b.obstacles.length) return false
  return a.obstacles.every((obstacle, i) => {
    const other = b.obstacles[i]
    return (
      obstacle.id === other.id &&
      obstacle.left === other.left &&
      obstacle.bottom === other.bottom &&
      obstacle.right === other.right &&
      obstacle.top === other.top
    )
  })
}

/** 撤销栈入栈并裁剪到容量上限（丢弃最旧事务）。 */
function pushUndo(stack: Scene[], scene: Scene): Scene[] {
  return [...stack, scene].slice(-HISTORY_LIMIT)
}

/**
 * 提交一个事务（表单合法提交、障碍增删、成功导入）：
 * 当前场景入撤销栈，切换到 next，并丢弃整条重做分支。
 * next 与当前场景相等时不产生事务（避免无效果的撤销步骤）。
 */
export function commitTransaction(state: HistoryState, next: Scene): HistoryState {
  if (sceneEquals(state.scene, next)) return state
  return { scene: next, undoStack: pushUndo(state.undoStack, state.scene), redoStack: [] }
}

/**
 * 拖拽归并提交：按下至抬起的全部位移只记一个事务。
 * 调用时 state.scene 已是拖拽预览的最终场景，origin 为按下瞬间的场景；
 * 净位移为零（拖回原位）时不产生事务。
 */
export function commitDragTransaction(state: HistoryState, origin: Scene): HistoryState {
  if (sceneEquals(state.scene, origin)) return state
  return { scene: state.scene, undoStack: pushUndo(state.undoStack, origin), redoStack: [] }
}

/** 取消拖拽（pointercancel / 失去捕获）：恢复拖拽前场景，不留任何历史。 */
export function cancelDragTransaction(state: HistoryState, origin: Scene): HistoryState {
  return { ...state, scene: origin }
}

/** 撤销一个事务；无可撤销事务时原样返回。 */
export function undoTransaction(state: HistoryState): HistoryState {
  if (state.undoStack.length === 0) return state
  return {
    scene: state.undoStack[state.undoStack.length - 1],
    undoStack: state.undoStack.slice(0, -1),
    redoStack: [...state.redoStack, state.scene],
  }
}

/** 重做一个事务；无可重做事务时原样返回。 */
export function redoTransaction(state: HistoryState): HistoryState {
  if (state.redoStack.length === 0) return state
  return {
    scene: state.redoStack[state.redoStack.length - 1],
    undoStack: pushUndo(state.undoStack, state.scene),
    redoStack: state.redoStack.slice(0, -1),
  }
}

export function canUndo(state: HistoryState): boolean {
  return state.undoStack.length > 0
}

export function canRedo(state: HistoryState): boolean {
  return state.redoStack.length > 0
}
