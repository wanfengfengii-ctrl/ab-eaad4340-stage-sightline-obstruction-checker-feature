import type { Obstacle, Point, Scene } from './types'

export const MIN_COORD = 0
export const MAX_COORD = 100
export const MAX_OBSTACLES = 20

/** 两位小数口径下的浮点容差。 */
const DECIMAL_EPS = 1e-9

export type ValidationResult = { ok: true; scene: Scene } | { ok: false; errors: string[] }

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 是否最多两位小数（容忍二进制浮点表示误差，如 0.07 * 100）。 */
export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < DECIMAL_EPS
}

/** 合法坐标：0~100 的有限数字，最多两位小数。 */
export function isValidCoord(value: unknown): value is number {
  return (
    isFiniteNumber(value) &&
    value >= MIN_COORD &&
    value <= MAX_COORD &&
    hasAtMostTwoDecimals(value)
  )
}

/** 合法障碍矩形：坐标合法且 left < right、bottom < top。 */
export function isValidRect(obstacle: Obstacle): boolean {
  return (
    isValidCoord(obstacle.left) &&
    isValidCoord(obstacle.right) &&
    isValidCoord(obstacle.bottom) &&
    isValidCoord(obstacle.top) &&
    obstacle.left < obstacle.right &&
    obstacle.bottom < obstacle.top
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const SCENE_KEYS = ['eye', 'target', 'obstacles']
const POINT_KEYS = ['x', 'y']
const OBSTACLE_KEYS = ['id', 'left', 'bottom', 'right', 'top']
const COORD_RULE = '必须是 0~100 且最多两位小数的数字'

function checkKeys(obj: Record<string, unknown>, allowed: string[], path: string, errors: string[]): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) errors.push(`${path} 含未知字段 "${key}"`)
  }
  for (const key of allowed) {
    if (!(key in obj)) errors.push(`${path} 缺少字段 "${key}"`)
  }
}

function readPoint(value: unknown, path: string, errors: string[]): Point | null {
  if (!isPlainObject(value)) {
    errors.push(`${path} 必须是对象`)
    return null
  }
  checkKeys(value, POINT_KEYS, path, errors)
  const { x, y } = value
  let ok = true
  if (!isValidCoord(x)) {
    errors.push(`${path}.x ${COORD_RULE}`)
    ok = false
  }
  if (!isValidCoord(y)) {
    errors.push(`${path}.y ${COORD_RULE}`)
    ok = false
  }
  return ok ? { x: x as number, y: y as number } : null
}

function readObstacle(value: unknown, path: string, seenIds: Set<string>, errors: string[]): Obstacle | null {
  if (!isPlainObject(value)) {
    errors.push(`${path} 必须是对象`)
    return null
  }
  checkKeys(value, OBSTACLE_KEYS, path, errors)
  const { id, left, bottom, right, top } = value

  let ok = true
  if (typeof id !== 'string' || id.trim() === '') {
    errors.push(`${path}.id 必须是非空字符串`)
    ok = false
  } else if (seenIds.has(id)) {
    errors.push(`${path}.id "${id}" 与其他障碍重复`)
    ok = false
  } else {
    seenIds.add(id)
  }

  const coords: Array<[string, unknown]> = [
    ['left', left],
    ['bottom', bottom],
    ['right', right],
    ['top', top],
  ]
  for (const [key, val] of coords) {
    if (!isValidCoord(val)) {
      errors.push(`${path}.${key} ${COORD_RULE}`)
      ok = false
    }
  }
  if (isValidCoord(left) && isValidCoord(right) && left >= right) {
    errors.push(`${path} 需满足 left < right`)
    ok = false
  }
  if (isValidCoord(bottom) && isValidCoord(top) && bottom >= top) {
    errors.push(`${path} 需满足 bottom < top`)
    ok = false
  }

  return ok ? { id: id as string, left: left as number, bottom: bottom as number, right: right as number, top: top as number } : null
}

/**
 * 结构化校验一个未知输入。任何一条规则不满足都整体拒绝（ok: false），
 * 调用方应保留原画面；只有全部通过才返回 ok: true 与规范化后的场景。
 */
export function validateScene(input: unknown): ValidationResult {
  const errors: string[] = []
  if (!isPlainObject(input)) {
    return { ok: false, errors: ['根节点必须是 JSON 对象'] }
  }
  checkKeys(input, SCENE_KEYS, 'scene', errors)

  const eye = 'eye' in input ? readPoint(input.eye, 'eye', errors) : null
  const target = 'target' in input ? readPoint(input.target, 'target', errors) : null
  if (eye && target && eye.x === target.x && eye.y === target.y) {
    errors.push('眼点与目标点不得重合')
  }

  const obstacles: Obstacle[] = []
  if ('obstacles' in input) {
    const raw = input.obstacles
    if (!Array.isArray(raw)) {
      errors.push('obstacles 必须是数组')
    } else {
      if (raw.length > MAX_OBSTACLES) {
        errors.push(`障碍数量 ${raw.length} 超过上限 ${MAX_OBSTACLES}`)
      }
      const seenIds = new Set<string>()
      raw.forEach((item, index) => {
        const obstacle = readObstacle(item, `obstacles[${index}]`, seenIds, errors)
        if (obstacle) obstacles.push(obstacle)
      })
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, scene: { eye: eye!, target: target!, obstacles } }
}

/** 解析并校验 JSON 文本；解析失败或校验失败均整体拒绝。 */
export function parseSceneJson(text: string): ValidationResult {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { ok: false, errors: ['JSON 解析失败：文本不是合法 JSON'] }
  }
  return validateScene(data)
}
