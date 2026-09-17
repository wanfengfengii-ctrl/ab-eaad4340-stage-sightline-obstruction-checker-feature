import { expect, test } from '@playwright/test'
import { dragOnCanvas } from './canvas'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('判定：默认场景被 railing-1 遮挡，改低栏杆后变为可见', async ({ page }) => {
  const status = page.getByTestId('result-status')
  await expect(status).toHaveAttribute('data-status', 'blocked')
  await expect(status).toContainText('railing-1')
  await expect(status).toContainText('30.00')
  await expect(page.getByTestId('sight-line')).toHaveAttribute('data-status', 'blocked')
  await expect(page.getByTestId('hit-marker')).toBeVisible()

  // 表单修改栏杆顶面 20 → 14：视线从栏杆上方通过
  await page.getByLabel('障碍 railing-1 上').fill('14')
  await expect(status).toHaveAttribute('data-status', 'clear')
  await expect(status).toContainText('可见')
  await expect(page.getByTestId('sight-line')).toHaveAttribute('data-status', 'clear')
  await expect(page.getByTestId('hit-marker')).toHaveCount(0)
})

test('拖拽：拖动眼点后表单即时一致并重新判定', async ({ page }) => {
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')

  // 眼点 (8,12) → (18,22)：视线抬高，越过栏杆
  await dragOnCanvas(page, { x: 8, y: 12 }, { x: 18, y: 22 })

  await expect(page.getByLabel('眼点 X')).toHaveValue('18')
  await expect(page.getByLabel('眼点 Y')).toHaveValue('22')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  await expect(page.getByTestId('sight-line')).toHaveAttribute('data-status', 'clear')
})

test('拖拽：拖动障碍矩形后表单与判定同步', async ({ page }) => {
  // 抓住栏杆中心 (32,10)，平移到 (70,10)：左边界 30→68，让出视线
  await dragOnCanvas(page, { x: 32, y: 10 }, { x: 70, y: 10 })

  await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
  await expect(page.getByLabel('障碍 railing-1 右')).toHaveValue('72')
  await expect(page.getByLabel('障碍 railing-1 下')).toHaveValue('0')
  await expect(page.getByLabel('障碍 railing-1 上')).toHaveValue('20')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
})

test('导入：合法 JSON 生效，非法 JSON 整体拒绝并保留原画面', async ({ page }) => {
  const valid = {
    eye: { x: 10, y: 10 },
    target: { x: 90, y: 10 },
    obstacles: [{ id: 'a', left: 40, bottom: 20, right: 50, top: 30 }],
  }
  await page.getByLabel('场景 JSON').fill(JSON.stringify(valid))
  await page.getByRole('button', { name: '导入' }).click()
  await expect(page.getByTestId('import-ok')).toBeVisible()
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  await expect(page.getByLabel('眼点 X')).toHaveValue('10')
  await expect(page.getByLabel('障碍 a 左')).toHaveValue('40')

  // 非法：left > right —— 整体拒绝，画面保持上一次导入后的状态
  const invalid = {
    eye: { x: 1, y: 1 },
    target: { x: 2, y: 2 },
    obstacles: [{ id: 'b', left: 60, bottom: 0, right: 50, top: 10 }],
  }
  await page.getByLabel('场景 JSON').fill(JSON.stringify(invalid))
  await page.getByRole('button', { name: '导入' }).click()
  await expect(page.getByTestId('import-errors')).toBeVisible()
  await expect(page.getByTestId('import-errors')).toContainText('left < right')
  await expect(page.getByLabel('眼点 X')).toHaveValue('10')
  await expect(page.getByLabel('障碍 a 左')).toHaveValue('40')
  await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
})
