import { useEffect, useState } from 'react'
import { isValidCoord, MAX_OBSTACLES } from '../schema'
import type { Obstacle, Scene } from '../types'

interface SceneFormProps {
  scene: Scene
  /** 每次合法提交（字段修改、障碍增删）记为一个事务。 */
  onCommit: (scene: Scene) => void
}

interface NumberFieldProps {
  label: string
  value: number
  /** 额外的跨字段约束（如 left < right）；返回 false 则拒绝提交。 */
  validate?: (value: number) => boolean
  onCommit: (value: number) => void
}

/**
 * 数值输入框：仅在值合法（0~100、最多两位小数、通过 validate）时提交，
 * 提交后由父级状态回流刷新；非法输入标红，失焦后回退为当前生效值。
 */
function NumberField({ label, value, validate, onCommit }: NumberFieldProps) {
  const [text, setText] = useState(String(value))
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(String(value))
    setInvalid(false)
  }, [value])

  return (
    <label className={invalid ? 'field field--invalid' : 'field'}>
      <span className="field-label">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={0.01}
        aria-label={label}
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          const parsed = Number(next)
          if (next.trim() !== '' && isValidCoord(parsed) && (!validate || validate(parsed))) {
            onCommit(parsed)
            setInvalid(false)
          } else {
            setInvalid(true)
          }
        }}
        onBlur={() => {
          setText(String(value))
          setInvalid(false)
        }}
      />
    </label>
  )
}

interface IdFieldProps {
  label: string
  value: string
  validate: (value: string) => boolean
  onCommit: (value: string) => void
}

function IdField({ label, value, validate, onCommit }: IdFieldProps) {
  const [text, setText] = useState(value)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    setText(value)
    setInvalid(false)
  }, [value])

  return (
    <label className={invalid ? 'field field--invalid' : 'field'}>
      <span className="field-label">{label}</span>
      <input
        type="text"
        aria-label={label}
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          const trimmed = next.trim()
          if (trimmed !== '' && validate(trimmed)) {
            onCommit(trimmed)
            setInvalid(false)
          } else {
            setInvalid(true)
          }
        }}
        onBlur={() => {
          setText(value)
          setInvalid(false)
        }}
      />
    </label>
  )
}

export function SceneForm({ scene, onCommit }: SceneFormProps) {
  const setPoint = (key: 'eye' | 'target', axis: 'x' | 'y') => (v: number) =>
    onCommit({ ...scene, [key]: { ...scene[key], [axis]: v } })

  /** 眼点/目标点不得重合。 */
  const pointOk = (key: 'eye' | 'target', axis: 'x' | 'y') => (v: number) => {
    const other = key === 'eye' ? scene.target : scene.eye
    const next = { ...scene[key], [axis]: v }
    return !(next.x === other.x && next.y === other.y)
  }

  const updateObstacle = (id: string, patch: Partial<Obstacle>) =>
    onCommit({
      ...scene,
      obstacles: scene.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    })

  const removeObstacle = (id: string) =>
    onCommit({ ...scene, obstacles: scene.obstacles.filter((o) => o.id !== id) })

  const addObstacle = () => {
    let n = scene.obstacles.length + 1
    let id = `obstacle-${n}`
    while (scene.obstacles.some((o) => o.id === id)) {
      n += 1
      id = `obstacle-${n}`
    }
    onCommit({
      ...scene,
      obstacles: [...scene.obstacles, { id, left: 40, bottom: 0, right: 45, top: 12 }],
    })
  }

  return (
    <>
      <section className="panel">
        <h2>眼点 / 目标点</h2>
        <div className="fields">
          <NumberField label="眼点 X" value={scene.eye.x} validate={pointOk('eye', 'x')} onCommit={setPoint('eye', 'x')} />
          <NumberField label="眼点 Y" value={scene.eye.y} validate={pointOk('eye', 'y')} onCommit={setPoint('eye', 'y')} />
          <NumberField label="目标 X" value={scene.target.x} validate={pointOk('target', 'x')} onCommit={setPoint('target', 'x')} />
          <NumberField label="目标 Y" value={scene.target.y} validate={pointOk('target', 'y')} onCommit={setPoint('target', 'y')} />
        </div>
      </section>

      <section className="panel">
        <h2>
          障碍（{scene.obstacles.length}/{MAX_OBSTACLES}）
        </h2>
        {scene.obstacles.length === 0 && <p className="muted">暂无障碍，可点击下方按钮添加。</p>}
        {scene.obstacles.map((obstacle) => (
          <div className="obstacle-row" key={obstacle.id}>
            <IdField
              label={`障碍 ${obstacle.id} id`}
              value={obstacle.id}
              validate={(s) => !scene.obstacles.some((o) => o.id !== obstacle.id && o.id === s)}
              onCommit={(s) => updateObstacle(obstacle.id, { id: s })}
            />
            <NumberField label={`障碍 ${obstacle.id} 左`} value={obstacle.left} validate={(v) => v < obstacle.right} onCommit={(v) => updateObstacle(obstacle.id, { left: v })} />
            <NumberField label={`障碍 ${obstacle.id} 下`} value={obstacle.bottom} validate={(v) => v < obstacle.top} onCommit={(v) => updateObstacle(obstacle.id, { bottom: v })} />
            <NumberField label={`障碍 ${obstacle.id} 右`} value={obstacle.right} validate={(v) => v > obstacle.left} onCommit={(v) => updateObstacle(obstacle.id, { right: v })} />
            <NumberField label={`障碍 ${obstacle.id} 上`} value={obstacle.top} validate={(v) => v > obstacle.bottom} onCommit={(v) => updateObstacle(obstacle.id, { top: v })} />
            <button
              type="button"
              className="btn btn-danger"
              aria-label={`删除障碍 ${obstacle.id}`}
              onClick={() => removeObstacle(obstacle.id)}
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn"
          onClick={addObstacle}
          disabled={scene.obstacles.length >= MAX_OBSTACLES}
        >
          添加障碍
        </button>
      </section>
    </>
  )
}
