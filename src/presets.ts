import type { Scene } from './types'

/**
 * 默认场景（与 README 中的 JSON 示例一致）：
 * 视线从眼点 (8,12) 到字幕屏目标 (92,26)，被栏杆 railing-1 首次遮挡，
 * 交点 (30.00, 15.67)，距眼点约 22.30 m；screen-rig 高于视线，不遮挡。
 */
export const DEFAULT_SCENE: Scene = {
  eye: { x: 8, y: 12 },
  target: { x: 92, y: 26 },
  obstacles: [
    { id: 'railing-1', left: 30, bottom: 0, right: 34, top: 20 },
    { id: 'screen-rig', left: 70, bottom: 40, right: 74, top: 50 },
  ],
}

/** 「填入示例」按钮使用的示例，与默认场景一致。 */
export const EXAMPLE_SCENE: Scene = DEFAULT_SCENE
