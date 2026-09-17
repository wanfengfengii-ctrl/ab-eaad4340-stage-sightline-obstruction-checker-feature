import { useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { Analysis } from '../geometry'
import { round2 } from '../geometry'
import type { Point, Scene } from '../types'

interface CanvasProps {
  scene: Scene
  analysis: Analysis
  /** 按下：父级锚定拖拽前场景。 */
  onDragStart: () => void
  /** 移动：即时联动的临时场景，不产生事务。 */
  onDragChange: (scene: Scene) => void
  /** 抬起：本次按下至抬起的全部位移合并为一个事务。 */
  onDragEnd: () => void
  /** 取消或失去捕获：恢复拖拽前场景且不留历史。 */
  onDragCancel: () => void
}

type DragState =
  | { kind: 'eye'; offsetX: number; offsetY: number }
  | { kind: 'target'; offsetX: number; offsetY: number }
  | { kind: 'obstacle'; id: string; offsetX: number; offsetY: number }

const GRID_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

/** 场景坐标 (x, y) → SVG 坐标（y 轴翻转，原点在左下）。 */
const sy = (y: number) => 100 - y

export function Canvas({ scene, analysis, onDragStart, onDragChange, onDragEnd, onDragCancel }: CanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [drag, setDrag] = useState<DragState | null>(null)
  /** 本次拖拽是否已正常抬起：抬起后必然跟随 lostpointercapture，用于与“意外失去捕获”区分。 */
  const settledRef = useRef(false)

  /** 指针事件 → 场景坐标（经 CTM 逆变换，与缩放、留白无关）。 */
  const toScene = (e: ReactPointerEvent): Point => {
    const svg = svgRef.current
    const ctm = svg?.getScreenCTM()
    if (!svg || !ctm) return { x: 0, y: 0 }
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: pt.x, y: sy(pt.y) }
  }

  const beginDrag = (kind: DragState['kind'], id?: string) => (e: ReactPointerEvent) => {
    e.preventDefault()
    svgRef.current?.setPointerCapture(e.pointerId)
    const p = toScene(e)
    let next: DragState
    if (kind === 'eye') {
      next = { kind, offsetX: scene.eye.x - p.x, offsetY: scene.eye.y - p.y }
    } else if (kind === 'target') {
      next = { kind, offsetX: scene.target.x - p.x, offsetY: scene.target.y - p.y }
    } else {
      const obstacle = scene.obstacles.find((o) => o.id === id)
      if (!obstacle) return
      next = { kind, id: obstacle.id, offsetX: obstacle.left - p.x, offsetY: obstacle.bottom - p.y }
    }
    settledRef.current = false
    onDragStart()
    setDrag(next)
  }

  const onPointerMove = (e: ReactPointerEvent) => {
    if (!drag) return
    const p = toScene(e)

    if (drag.kind === 'eye' || drag.kind === 'target') {
      const x = round2(clamp(p.x + drag.offsetX, 0, 100))
      const y = round2(clamp(p.y + drag.offsetY, 0, 100))
      const other = drag.kind === 'eye' ? scene.target : scene.eye
      // 眼点与目标点不得重合：拖到重合位置时保持不动
      if (x === other.x && y === other.y) return
      const key = drag.kind
      if (scene[key].x === x && scene[key].y === y) return
      onDragChange({ ...scene, [key]: { x, y } })
      return
    }

    const obstacle = scene.obstacles.find((o) => o.id === drag.id)
    if (!obstacle) return
    const width = obstacle.right - obstacle.left
    const height = obstacle.top - obstacle.bottom
    const left = round2(clamp(p.x + drag.offsetX, 0, 100 - width))
    const bottom = round2(clamp(p.y + drag.offsetY, 0, 100 - height))
    if (left === obstacle.left && bottom === obstacle.bottom) return
    onDragChange({
      ...scene,
      obstacles: scene.obstacles.map((o) =>
        o.id === obstacle.id
          ? { ...o, left, bottom, right: round2(left + width), top: round2(bottom + height) }
          : o,
      ),
    })
  }

  /** 正常抬起：位移归并为一个事务。 */
  const handlePointerUp = () => {
    if (!drag) return
    settledRef.current = true
    setDrag(null)
    onDragEnd()
  }

  /** 取消（如浏览器手势中断）：恢复拖拽前场景，不留历史。 */
  const handlePointerCancel = () => {
    if (!drag || settledRef.current) return
    settledRef.current = true
    setDrag(null)
    onDragCancel()
  }

  /**
   * 失去指针捕获：正常抬起后浏览器会自动释放捕获并跟随触发本事件，需忽略；
   * 拖拽途中意外失去捕获（未抬起）时按取消处理。
   */
  const handleLostCapture = () => {
    if (!drag || settledRef.current) return
    settledRef.current = true
    setDrag(null)
    onDragCancel()
  }

  const blocked = analysis.status === 'blocked'
  const hit = blocked ? analysis : null

  return (
    <svg
      ref={svgRef}
      data-testid="canvas"
      className="canvas-svg"
      viewBox="-8 -6 112 112"
      role="img"
      aria-label="剖面画布"
      onPointerMove={onPointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handleLostCapture}
    >
      {/* 网格与坐标轴 */}
      {GRID_STEPS.map((v) => (
        <line key={`gx-${v}`} x1={v} y1={0} x2={v} y2={100} className="grid-line" />
      ))}
      {GRID_STEPS.map((v) => (
        <line key={`gy-${v}`} x1={0} y1={sy(v)} x2={100} y2={sy(v)} className="grid-line" />
      ))}
      <rect x={0} y={0} width={100} height={100} className="frame" />
      {GRID_STEPS.map((v) => (
        <text key={`tx-${v}`} x={v} y={104.5} className="tick-label" textAnchor="middle">
          {v}
        </text>
      ))}
      {GRID_STEPS.map((v) => (
        <text key={`ty-${v}`} x={-1.5} y={sy(v) + 1.2} className="tick-label" textAnchor="end">
          {v}
        </text>
      ))}

      {/* 障碍矩形 */}
      {scene.obstacles.map((obstacle) => {
        const isFirstHit = blocked && analysis.obstacleId === obstacle.id
        return (
          <g
            key={obstacle.id}
            data-testid={`obstacle-${obstacle.id}`}
            className="draggable"
            onPointerDown={beginDrag('obstacle', obstacle.id)}
          >
            <rect
              x={obstacle.left}
              y={sy(obstacle.top)}
              width={obstacle.right - obstacle.left}
              height={obstacle.top - obstacle.bottom}
              className={isFirstHit ? 'obstacle obstacle--hit' : 'obstacle'}
            />
            <text
              x={(obstacle.left + obstacle.right) / 2}
              y={sy((obstacle.top + obstacle.bottom) / 2) + 1.1}
              className="obstacle-label"
              textAnchor="middle"
            >
              {obstacle.id}
            </text>
          </g>
        )
      })}

      {/* 视线：绿 = 可见，红 = 被遮挡 */}
      <line
        data-testid="sight-line"
        data-status={analysis.status}
        x1={scene.eye.x}
        y1={sy(scene.eye.y)}
        x2={scene.target.x}
        y2={sy(scene.target.y)}
        className={blocked ? 'sight-line sight-line--blocked' : 'sight-line sight-line--clear'}
      />

      {/* 首次遮挡：交点 + 障碍 id */}
      {hit && (
        <g data-testid="hit-marker">
          <circle cx={hit.point.x} cy={sy(hit.point.y)} r={1.6} className="hit-ring" />
          <circle cx={hit.point.x} cy={sy(hit.point.y)} r={0.6} className="hit-dot" />
          <text
            x={hit.point.x > 55 ? hit.point.x - 2.5 : hit.point.x + 2.5}
            y={hit.point.y > 90 ? sy(hit.point.y) + 5 : sy(hit.point.y) - 2.5}
            className="hit-label"
            textAnchor={hit.point.x > 55 ? 'end' : 'start'}
          >
            首次遮挡：{hit.obstacleId}
          </text>
        </g>
      )}

      {/* 眼点 */}
      <g data-testid="eye-handle" className="draggable" onPointerDown={beginDrag('eye')}>
        <circle cx={scene.eye.x} cy={sy(scene.eye.y)} r={4} className="hit-area" />
        <circle cx={scene.eye.x} cy={sy(scene.eye.y)} r={1.8} className="eye-dot" />
        <text x={scene.eye.x} y={sy(scene.eye.y) + 6} className="point-label point-label--eye" textAnchor="middle">
          眼点
        </text>
      </g>

      {/* 目标点 */}
      <g data-testid="target-handle" className="draggable" onPointerDown={beginDrag('target')}>
        <circle cx={scene.target.x} cy={sy(scene.target.y)} r={4} className="hit-area" />
        <rect
          x={scene.target.x - 1.6}
          y={sy(scene.target.y) - 1.6}
          width={3.2}
          height={3.2}
          className="target-dot"
        />
        <text x={scene.target.x} y={sy(scene.target.y) - 4} className="point-label point-label--target" textAnchor="middle">
          目标
        </text>
      </g>
    </svg>
  )
}
