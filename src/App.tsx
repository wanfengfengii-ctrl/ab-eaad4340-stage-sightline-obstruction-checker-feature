import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ImportPanel } from './components/ImportPanel'
import { ResultPanel } from './components/ResultPanel'
import { SceneForm } from './components/SceneForm'
import { analyzeScene } from './geometry'
import {
  cancelDragTransaction,
  canRedo,
  canUndo,
  commitDragTransaction,
  commitTransaction,
  createHistory,
  redoTransaction,
  undoTransaction,
  type HistoryState,
} from './history'
import { loadSnapshot, saveSnapshot } from './persistence'
import { DEFAULT_SCENE } from './presets'
import type { Scene } from './types'
import './styles.css'

/** 启动时恢复单一快照；快照缺失或不合法时回退默认场景并给出明确提示。 */
function restoreInitial(): { history: HistoryState; notice: string | null } {
  try {
    const result = loadSnapshot(window.localStorage)
    if (result.ok) return { history: result.history, notice: null }
    return {
      history: createHistory(DEFAULT_SCENE),
      notice:
        result.reason === 'missing'
          ? '未找到可恢复的历史快照，已载入默认场景。'
          : '历史快照未通过场景校验，恢复失败，已载入默认场景。',
    }
  } catch {
    return {
      history: createHistory(DEFAULT_SCENE),
      notice: '读取浏览器存储失败，已载入默认场景。',
    }
  }
}

export default function App() {
  const [initial] = useState(restoreInitial)
  const [history, setHistory] = useState<HistoryState>(initial.history)
  const [restoreNotice, setRestoreNotice] = useState<string | null>(initial.notice)
  const [persistFailed, setPersistFailed] = useState(false)
  /** 拖拽按下瞬间的场景；非拖拽期间为 null。 */
  const dragOrigin = useRef<Scene | null>(null)

  const analysis = useMemo(() => analyzeScene(history.scene), [history.scene])

  // 当前场景、撤销栈、重做栈作为单一快照写入浏览器存储；
  // 写入失败时保留页面内的编辑与撤销能力，仅提示刷新可能丢失。
  useEffect(() => {
    const ok = saveSnapshot(window.localStorage, history)
    setPersistFailed(!ok)
  }, [history])

  /** 表单合法提交、障碍增删、成功导入：各记为一个事务。 */
  const commitScene = (next: Scene) => setHistory((h) => commitTransaction(h, next))

  /** 拖拽过程中的即时预览：只更新当前场景，不产生事务。 */
  const previewScene = (next: Scene) => setHistory((h) => ({ ...h, scene: next }))

  const handleDragStart = () => {
    dragOrigin.current = history.scene
  }

  /** 抬起：按下至抬起的全部位移归并为一个事务。 */
  const handleDragCommit = () => {
    const origin = dragOrigin.current
    dragOrigin.current = null
    if (origin === null) return
    setHistory((h) => commitDragTransaction(h, origin))
  }

  /** 取消或失去捕获：恢复拖拽前场景，不留历史。 */
  const handleDragCancel = () => {
    const origin = dragOrigin.current
    dragOrigin.current = null
    if (origin === null) return
    setHistory((h) => cancelDragTransaction(h, origin))
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>剧场剖面视线核验器</h1>
          <p className="subtitle">
            眼点 → 目标点（字幕屏）的闭线段与任一障碍闭矩形相交（含擦边、碰角）即判遮挡
          </p>
        </div>
        <div className="header-actions">
          <div className="history-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setHistory((h) => undoTransaction(h))}
              disabled={!canUndo(history)}
            >
              撤销
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setHistory((h) => redoTransaction(h))}
              disabled={!canRedo(history)}
            >
              重做
            </button>
          </div>
          {analysis.status === 'clear' ? (
            <span className="badge badge--clear">可见</span>
          ) : (
            <span className="badge badge--blocked">遮挡 · {analysis.obstacleId}</span>
          )}
        </div>
      </header>

      {restoreNotice && (
        <div data-testid="restore-notice" className="notice notice--warning" role="alert">
          <span>{restoreNotice}</span>
          <button
            type="button"
            className="notice-close"
            aria-label="关闭提示"
            onClick={() => setRestoreNotice(null)}
          >
            ×
          </button>
        </div>
      )}
      {persistFailed && (
        <div data-testid="persist-warning" className="notice notice--error" role="alert">
          无法写入浏览器存储：本次编辑与撤销历史在本页面内仍然有效，但刷新后可能丢失。
        </div>
      )}

      <main className="layout">
        <section className="panel canvas-panel">
          <Canvas
            scene={history.scene}
            analysis={analysis}
            onSceneChange={previewScene}
            onDragStart={handleDragStart}
            onDragCommit={handleDragCommit}
            onDragCancel={handleDragCancel}
          />
          <p className="hint">
            可直接拖动画布中的眼点、目标点与障碍矩形，右侧表单即时同步。坐标口径：0~100 m，原点左下，x 向右，y 向上。
          </p>
        </section>

        <aside className="side">
          <ResultPanel analysis={analysis} />
          <SceneForm scene={history.scene} onSceneChange={commitScene} />
          <ImportPanel scene={history.scene} onImport={commitScene} />
        </aside>
      </main>
    </div>
  )
}
