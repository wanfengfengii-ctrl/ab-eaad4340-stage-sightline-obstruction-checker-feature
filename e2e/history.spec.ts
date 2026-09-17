import { expect, test } from '@playwright/test'
import { STORAGE_KEY } from '../src/persistence'
import { dragOnCanvas } from './canvas'

const undoButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '撤销' })
const redoButton = (page: import('@playwright/test').Page) => page.getByRole('button', { name: '重做' })

test('主流程：拖动障碍 → 撤销 → 重做 → 刷新后再撤销', async ({ page }) => {
  await page.goto('/')

  // 初始：无任何历史，撤销 / 重做均不可用
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeDisabled()
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')

  // 拖动障碍：抓住栏杆中心 (32,10) 平移到 (70,10)，左边界 30 → 68，让出视线
  await dragOnCanvas(page, { x: 32, y: 10 }, { x: 70, y: 10 })
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  await expect(undoButton(page)).toBeEnabled()

  // 撤销：整次拖拽一步回退到拖拽前
  await undoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
  await expect(redoButton(page)).toBeEnabled()

  // 重做：恢复拖拽后的场景
  await redoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  await expect(redoButton(page)).toBeDisabled()

  // 刷新：当前场景与撤销 / 重做栈完全恢复，不出现恢复失败提示
  await page.reload()
  await expect(page.getByTestId('restore-notice')).toHaveCount(0)
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  await expect(undoButton(page)).toBeEnabled()
  await expect(redoButton(page)).toBeDisabled()

  // 刷新后再撤销：撤销栈同样被恢复，可继续回退到拖拽前
  await undoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeEnabled()
})

test('撤销后发生新编辑：重做分支被丢弃', async ({ page }) => {
  await page.goto('/')

  // 事务 1：表单提交栏杆顶面 20 → 14
  await page.getByLabel('障碍 railing-1 上').fill('14')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')

  // 撤销后重做可用
  await undoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 上')).toHaveValue('20')
  await expect(redoButton(page)).toBeEnabled()

  // 新编辑（删除障碍）：重做分支必须被丢弃
  await page.getByRole('button', { name: '删除障碍 railing-1' }).click()
  await expect(redoButton(page)).toBeDisabled()
  await expect(page.getByLabel('障碍 railing-1 上')).toHaveCount(0)

  // 撤销一步回到删除前（即最初场景），撤销链随之耗尽
  await undoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 上')).toHaveValue('20')
  await expect(undoButton(page)).toBeDisabled()

  // 重做恢复的是删除后的场景，而不是被截断的 top=14 分支
  await redoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 上')).toHaveCount(0)
  await expect(redoButton(page)).toBeDisabled()
})

test('失败导入：不改变场景、判定结果与撤销 / 重做栈', async ({ page }) => {
  await page.goto('/')

  // 成功导入：记为一个事务
  const valid = {
    eye: { x: 10, y: 10 },
    target: { x: 90, y: 10 },
    obstacles: [{ id: 'a', left: 40, bottom: 20, right: 50, top: 30 }],
  }
  await page.getByLabel('场景 JSON').fill(JSON.stringify(valid))
  await page.getByRole('button', { name: '导入' }).click()
  await expect(page.getByTestId('import-ok')).toBeVisible()
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')

  // 失败导入：整体拒绝，不产生事务
  const invalid = {
    eye: { x: 1, y: 1 },
    target: { x: 2, y: 2 },
    obstacles: [{ id: 'b', left: 60, bottom: 0, right: 50, top: 10 }],
  }
  await page.getByLabel('场景 JSON').fill(JSON.stringify(invalid))
  await page.getByRole('button', { name: '导入' }).click()
  await expect(page.getByTestId('import-errors')).toBeVisible()

  // 场景与判定结果保持导入成功后的状态
  await expect(page.getByLabel('眼点 X')).toHaveValue('10')
  await expect(page.getByLabel('障碍 a 左')).toHaveValue('40')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')

  // 撤销一步直接回到默认场景：证明失败导入未入栈，撤销 / 重做栈未被触碰
  await undoButton(page).click()
  await expect(page.getByLabel('眼点 X')).toHaveValue('8')
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
  await expect(undoButton(page)).toBeDisabled()

  // 重做恢复的仍是成功导入的场景
  await redoButton(page).click()
  await expect(page.getByLabel('眼点 X')).toHaveValue('10')
  await expect(page.getByLabel('障碍 a 左')).toHaveValue('40')
})

test('快照缺失或不合法：载入默认场景并明确提示恢复失败', async ({ page }) => {
  await page.goto('/')
  // 首次访问无快照：默认场景 + 恢复失败提示
  await expect(page.getByTestId('restore-notice')).toBeVisible()
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')

  // 写入损坏快照后刷新：整体拒绝，回退默认场景并提示
  await page.evaluate((key) => {
    window.localStorage.setItem(
      key,
      JSON.stringify({ version: 1, scene: { eye: { x: 8, y: 120 } }, undoStack: [], redoStack: [] }),
    )
  }, STORAGE_KEY)
  await page.reload()
  await expect(page.getByTestId('restore-notice')).toBeVisible()
  await expect(page.getByTestId('restore-notice')).toContainText('恢复失败')
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
})

test('写入失败：保留页面内编辑与撤销能力，并提示刷新可能丢失', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    }
  })
  await page.goto('/')

  // 初始写入即失败：提示刷新可能丢失
  await expect(page.getByTestId('persist-warning')).toBeVisible()
  await expect(page.getByTestId('persist-warning')).toContainText('刷新')

  // 页面内编辑仍然可用
  await page.getByLabel('障碍 railing-1 上').fill('14')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')

  // 撤销能力仍然可用
  await undoButton(page).click()
  await expect(page.getByLabel('障碍 railing-1 上')).toHaveValue('20')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
  await expect(page.getByTestId('persist-warning')).toBeVisible()
})

test('原地点击（无位移）不产生事务', async ({ page }) => {
  await page.goto('/')

  // 在栏杆中心按下并原地抬起：不留下可撤销历史
  const center = await page.evaluate(() => {
    const svg = document.querySelector('svg[data-testid="canvas"]') as SVGSVGElement
    const ctm = svg.getScreenCTM()!
    const pt = new DOMPoint(32, 100 - 10).matrixTransform(ctm)
    return { x: pt.x, y: pt.y }
  })
  await page.mouse.move(center.x, center.y)
  await page.mouse.down()
  await page.mouse.up()

  await expect(undoButton(page)).toBeDisabled()
  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
})
