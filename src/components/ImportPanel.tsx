import { useState } from 'react'
import { EXAMPLE_SCENE } from '../presets'
import { parseSceneJson } from '../schema'
import type { Scene } from '../types'

interface ImportPanelProps {
  scene: Scene
  /** 仅在一次成功导入后调用，记为一个事务；失败导入不调用，场景与历史均不变。 */
  onCommit: (scene: Scene) => void
}

export function ImportPanel({ scene, onCommit }: ImportPanelProps) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [okMessage, setOkMessage] = useState('')

  const handleImport = () => {
    const result = parseSceneJson(text)
    if (result.ok) {
      onCommit(result.scene)
      setErrors([])
      setOkMessage('导入成功，画面已更新。')
    } else {
      // 非法导入整体拒绝：不触碰当前场景、遮挡判定与撤销/重做栈，仅展示错误
      setErrors(result.errors)
      setOkMessage('')
    }
  }

  return (
    <section className="panel">
      <h2>导入 / 导出 JSON</h2>
      <textarea
        aria-label="场景 JSON"
        className="json-input"
        rows={9}
        spellCheck={false}
        placeholder='粘贴场景 JSON，例如 {"eye":{"x":8,"y":12},"target":{"x":92,"y":26},"obstacles":[...]}'
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="btn-row">
        <button type="button" className="btn btn-primary" onClick={handleImport}>
          导入
        </button>
        <button type="button" className="btn" onClick={() => setText(JSON.stringify(scene, null, 2))}>
          导出当前场景
        </button>
        <button type="button" className="btn" onClick={() => setText(JSON.stringify(EXAMPLE_SCENE, null, 2))}>
          填入示例
        </button>
      </div>
      {errors.length > 0 && (
        <ul data-testid="import-errors" className="error-list">
          {errors.map((error, i) => (
            <li key={i}>{error}</li>
          ))}
        </ul>
      )}
      {okMessage && (
        <p data-testid="import-ok" className="ok-message">
          {okMessage}
        </p>
      )}
    </section>
  )
}
