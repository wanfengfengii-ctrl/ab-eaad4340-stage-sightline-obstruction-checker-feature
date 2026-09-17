import { useMemo, useState } from 'react'
import { Canvas } from './components/Canvas'
import { ImportPanel } from './components/ImportPanel'
import { ResultPanel } from './components/ResultPanel'
import { SceneForm } from './components/SceneForm'
import { analyzeScene } from './geometry'
import { DEFAULT_SCENE } from './presets'
import type { Scene } from './types'
import './styles.css'

export default function App() {
  const [scene, setScene] = useState<Scene>(DEFAULT_SCENE)
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
        {analysis.status === 'clear' ? (
          <span className="badge badge--clear">可见</span>
        ) : (
          <span className="badge badge--blocked">遮挡 · {analysis.obstacleId}</span>
        )}
      </header>

      <main className="layout">
        <section className="panel canvas-panel">
          <Canvas scene={scene} analysis={analysis} onSceneChange={setScene} />
          <p className="hint">
            可直接拖动画布中的眼点、目标点与障碍矩形，右侧表单即时同步。坐标口径：0~100 m，原点左下，x 向右，y 向上。
          </p>
        </section>

        <aside className="side">
          <ResultPanel analysis={analysis} />
          <SceneForm scene={scene} onSceneChange={setScene} />
          <ImportPanel scene={scene} onImport={setScene} />
        </aside>
      </main>
    </div>
  )
}
