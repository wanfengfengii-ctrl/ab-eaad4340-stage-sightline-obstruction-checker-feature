import { parseSnapshot, serializeSnapshot, type HistoryState, type RestoreResult } from './history'

const STORAGE_KEY = 'theater-sightline:history-v1'

/** 浏览器存储抽象：生产环境用 localStorage，测试可注入内存实现。 */
export interface SceneStorage {
  read(): string | null
  write(raw: string): boolean
}

export const localStorageSceneStorage: SceneStorage = {
  read() {
    try {
      return window.localStorage.getItem(STORAGE_KEY)
    } catch {
      return null
    }
  },
  write(raw) {
    try {
      window.localStorage.setItem(STORAGE_KEY, raw)
      return true
    } catch {
      // 配额超限、隐私模式或存储被禁用：调用方保留本次编辑并提示刷新风险
      return false
    }
  },
}

/**
 * 从存储恢复历史。返回结果分三种：
 * - ok：快照合法，页面应直接恢复为该历史；
 * - missing：没有快照，使用默认场景且无需提示；
 * - invalid：快照不合法，使用默认场景并明确提示恢复失败。
 */
export function restoreHistory(storage: SceneStorage): RestoreResult {
  return parseSnapshot(storage.read())
}

/** 把当前历史作为单一快照写入存储；返回是否写入成功。 */
export function persistHistory(storage: SceneStorage, history: HistoryState): boolean {
  return storage.write(serializeSnapshot(history))
}
