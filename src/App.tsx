import { useMemo } from 'react'
import { Canvas } from './components/Canvas'
import { ImportPanel } from './components/ImportPanel'
import { ResultPanel } from './components/ResultPanel'
import { SceneForm } from './components/SceneForm'
import { analyzeScene } from './geometry'
import { useSceneHistory } from './useSceneHistory'
import './styles.css'

export default function App() {
  const history = useSceneHistory()
  const { scene } = history
  const analysis = useMemo(() => analyzeScene(scene), [scene])

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
          <div className="undo-row" role="group" aria-label="编辑历史">
            <button
              type="button"
              className="btn"
              data-testid="undo-button"
              onClick={history.undo}
              disabled={!history.canUndo}
            >
              撤销
            </button>
            <button
              type="button"
              className="btn"
              data-testid="redo-button"
              onClick={history.redo}
              disabled={!history.canRedo}
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

      {history.restoreFailed && (
        <p data-testid="restore-failed-notice" className="notice notice--warn" role="alert">
          本地存档缺失或不合法，已载入默认场景，此前的编辑历史未能恢复。
        </p>
      )}
      {history.persistFailed && (
        <p data-testid="persist-failed-notice" className="notice notice--warn" role="status">
          浏览器存储写入失败：本次页面编辑与撤销/重做仍可正常使用，但刷新页面后可能丢失。
        </p>
      )}

      <main className="layout">
        <section className="panel canvas-panel">
          <Canvas
            scene={scene}
            analysis={analysis}
            onDragStart={history.beginDrag}
            onDragChange={history.updateDragScene}
            onDragEnd={history.endDrag}
            onDragCancel={history.cancelDrag}
          />
          <p className="hint">
            可直接拖动画布中的眼点、目标点与障碍矩形，右侧表单即时同步；一次按下到抬起记为一次可撤销编辑。坐标口径：0~100
            m，原点左下，x 向右，y 向上。
          </p>
        </section>

        <aside className="side">
          <ResultPanel analysis={analysis} />
          <SceneForm scene={scene} onCommit={history.commitScene} />
          <ImportPanel scene={scene} onCommit={history.commitImport} />
        </aside>
      </main>
    </div>
  )
}
