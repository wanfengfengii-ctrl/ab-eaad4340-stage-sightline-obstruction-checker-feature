import { useCallback, useEffect, useRef, useState } from 'react'
import {
  canRedo as canRedoStep,
  canUndo as canUndoStep,
  commit,
  commitDrag,
  createHistory,
  redo as redoStep,
  scenesEqual,
  undo as undoStep,
  type HistoryState,
} from './history'
import { localStorageSceneStorage, persistHistory, restoreHistory } from './storage'
import { DEFAULT_SCENE } from './presets'
import { validateScene } from './schema'
import type { Scene } from './types'

export interface SceneHistoryApi {
  scene: Scene
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
  /** 表单合法提交、障碍增删：各记一个事务。非法场景被拒绝，不产生事务。 */
  commitScene: (scene: Scene) => void
  /** 一次成功导入记为一个事务（即使内容与当前相同）；失败导入不会走到这里。 */
  commitImport: (scene: Scene) => void
  /** 画布按下：记录拖拽前场景，拖拽期间的位移不单独落盘。 */
  beginDrag: () => void
  /** 拖拽过程中的临时位置：即时联动，但不产生事务。 */
  updateDragScene: (scene: Scene) => void
  /** 画布抬起：按下至抬起的全部位移合并为一个事务。 */
  endDrag: () => void
  /** 取消或失去捕获：恢复拖拽前场景，不留历史。 */
  cancelDrag: () => void
  restoreFailed: boolean
  persistFailed: boolean
}

/**
 * 事务化编辑历史 + 单一快照持久化。
 *
 * 历史栈只在事务边界（合法提交 / 拖拽抬起 / 撤销 / 重做）写入浏览器存储；
 * 拖拽中的临时位置只活在内存里，刷新或取消都会回到拖拽前场景。
 */
export function useSceneHistory(): SceneHistoryApi {
  // 首次渲染期间恢复快照：只有通过现有场景校验的快照才能接管页面；
  // 快照缺失或不合法时一律载入默认场景并明确提示恢复失败。
  const initialNoticeRef = useRef<'restore-failed' | null>(null)
  const [history, setHistory] = useState<HistoryState>(() => {
    const restored = restoreHistory(localStorageSceneStorage)
    if (restored.ok) return restored.history
    initialNoticeRef.current = 'restore-failed'
    return createHistory(DEFAULT_SCENE)
  })
  const [restoreFailed] = useState(initialNoticeRef.current === 'restore-failed')
  const [persistFailed, setPersistFailed] = useState(false)

  const historyRef = useRef(history)
  historyRef.current = history

  /** 非 null 表示拖拽进行中，值为按下时的场景（恢复锚点）。 */
  const dragStartRef = useRef<Scene | null>(null)

  // 当前场景 + 撤销栈 + 重做栈作为单一快照落盘；写入失败不影响内存中的编辑与撤销。
  useEffect(() => {
    if (dragStartRef.current !== null) return // 拖拽中的临时位置不写入快照
    const ok = persistHistory(localStorageSceneStorage, history)
    setPersistFailed((prev) => (ok ? false : prev || true))
  }, [history])

  const commitScene = useCallback((next: Scene) => {
    // 防御性校验：非法值不接管页面、不产生事务、不覆盖快照
    if (!validateScene(next).ok) return
    setHistory((h) => commit(h, next))
  }, [])

  const commitImport = useCallback((next: Scene) => {
    // 导入面板已用 parseSceneJson 整体校验过；此处再校验一道确保双保险
    if (!validateScene(next).ok) return
    setHistory((h) => commit(h, next, true))
  }, [])

  const undo = useCallback(() => setHistory((h) => undoStep(h)), [])
  const redo = useCallback(() => setHistory((h) => redoStep(h)), [])

  const beginDrag = useCallback(() => {
    dragStartRef.current = historyRef.current.present
  }, [])

  const updateDragScene = useCallback((next: Scene) => {
    setHistory((h) => (scenesEqual(h.present, next) ? h : { ...h, present: next }))
  }, [])

  const endDrag = useCallback(() => {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start) return
    setHistory((h) => commitDrag(h, start, h.present))
  }, [])

  const cancelDrag = useCallback(() => {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start) return
    setHistory((h) => (scenesEqual(h.present, start) ? h : { ...h, present: start }))
  }, [])

  return {
    scene: history.present,
    canUndo: canUndoStep(history),
    canRedo: canRedoStep(history),
    undo,
    redo,
    commitScene,
    commitImport,
    beginDrag,
    updateDragScene,
    endDrag,
    cancelDrag,
    restoreFailed,
    persistFailed,
  }
}
