import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'theater-sightline:history-v1'

/** 场景坐标 (x, y) → 页面客户端像素坐标（与被测页面同一套 CTM 变换）。 */
async function sceneToClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([sx, sy]) => {
    const svg = document.querySelector('svg[data-testid="canvas"]') as SVGSVGElement
    const ctm = svg.getScreenCTM()!
    const pt = new DOMPoint(sx, 100 - sy).matrixTransform(ctm)
    return { x: pt.x, y: pt.y }
  }, [x, y])
}

/** 用鼠标把场景坐标 from 处的对象拖到场景坐标 to 处。 */
async function dragOnCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const start = await sceneToClient(page, from.x, from.y)
  const end = await sceneToClient(page, to.x, to.y)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}

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

test.describe('事务化编辑历史', () => {
  test('主流程：拖动障碍→撤销→重做→刷新后再撤销', async ({ page }) => {
    const undo = page.getByTestId('undo-button')
    const redo = page.getByTestId('redo-button')
    const status = page.getByTestId('result-status')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()

    // 拖动障碍：栏杆中心 (32,10) → (70,10)，左边界 30→68，视线放行
    await dragOnCanvas(page, { x: 32, y: 10 }, { x: 70, y: 10 })
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
    await expect(status).toHaveAttribute('data-status', 'clear')
    await expect(undo).toBeEnabled()

    // 当前场景、撤销栈、重做栈是浏览器存储中的单一快照
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
    const snapshot = JSON.parse(raw!)
    expect(snapshot.version).toBe(1)
    expect(snapshot.scene.obstacles[0].left).toBe(68)
    expect(snapshot.undoStack).toHaveLength(1)
    expect(snapshot.undoStack[0].obstacles[0].left).toBe(30)
    expect(snapshot.redoStack).toHaveLength(0)

    // 撤销：恢复拖拽前场景与遮挡判定（仅一个事务，撤销后撤销栈为空）
    await undo.click()
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
    await expect(status).toHaveAttribute('data-status', 'blocked')
    await expect(status).toContainText('railing-1')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeEnabled()

    // 重做：回到拖后状态
    await redo.click()
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
    await expect(status).toHaveAttribute('data-status', 'clear')
    await expect(redo).toBeDisabled()

    // 刷新：恢复完全相同的可操作状态
    await page.reload()
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('68')
    await expect(status).toHaveAttribute('data-status', 'clear')
    await expect(undo).toBeEnabled()
    await expect(redo).toBeDisabled()

    // 刷新后仍可撤销
    await undo.click()
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
    await expect(status).toHaveAttribute('data-status', 'blocked')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeEnabled()
  })

  test('拖拽归并：按下到抬起的多次位移只记一个事务，一次撤销即回原位', async ({ page }) => {
    await dragOnCanvas(page, { x: 8, y: 12 }, { x: 18, y: 22 })
    await expect(page.getByLabel('眼点 X')).toHaveValue('18')

    await page.getByTestId('undo-button').click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(page.getByLabel('眼点 Y')).toHaveValue('12')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
    await expect(page.getByTestId('undo-button')).toBeDisabled()
  })

  test('撤销后新编辑丢弃重做分支', async ({ page }) => {
    const undo = page.getByTestId('undo-button')
    const redo = page.getByTestId('redo-button')

    // 两次表单提交：眼点 X 8→20→30
    await page.getByLabel('眼点 X').fill('20')
    await page.getByLabel('眼点 X').fill('30')
    await expect(page.getByLabel('眼点 X')).toHaveValue('30')

    await undo.click()
    await undo.click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(redo).toBeEnabled()

    // 在旧分支上做新编辑：重做分支被截断（按钮禁用，无法重做到达旧分支）
    await page.getByLabel('眼点 X').fill('40')
    await expect(page.getByLabel('眼点 X')).toHaveValue('40')
    await expect(redo).toBeDisabled()
    await undo.click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(redo).toBeEnabled() // 新编辑的事务可重做，但目标是 40 而非 30
    await redo.click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('40')
  })

  test('成功导入记一个事务，可撤销/重做', async ({ page }) => {
    const valid = {
      eye: { x: 10, y: 10 },
      target: { x: 90, y: 10 },
      obstacles: [{ id: 'a', left: 40, bottom: 20, right: 50, top: 30 }],
    }
    await page.getByLabel('场景 JSON').fill(JSON.stringify(valid))
    await page.getByRole('button', { name: '导入' }).click()
    await expect(page.getByTestId('import-ok')).toBeVisible()
    await expect(page.getByLabel('障碍 a 左')).toHaveValue('40')

    await page.getByTestId('undo-button').click()
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')

    await page.getByTestId('redo-button').click()
    await expect(page.getByLabel('障碍 a 左')).toHaveValue('40')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  })

  test('失败导入不改变场景、遮挡判定与撤销/重做栈', async ({ page }) => {
    // 先做一次合法编辑，使撤销栈非空
    await dragOnCanvas(page, { x: 8, y: 12 }, { x: 18, y: 22 })
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')

    // 非法导入：left > right
    const invalid = {
      eye: { x: 1, y: 1 },
      target: { x: 2, y: 2 },
      obstacles: [{ id: 'b', left: 60, bottom: 0, right: 50, top: 10 }],
    }
    await page.getByLabel('场景 JSON').fill(JSON.stringify(invalid))
    await page.getByRole('button', { name: '导入' }).click()
    await expect(page.getByTestId('import-errors')).toBeVisible()

    // 场景与判定不变
    await expect(page.getByLabel('眼点 X')).toHaveValue('18')
    await expect(page.getByLabel('眼点 Y')).toHaveValue('22')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')

    // 持久化快照也未被失败导入覆盖：当前场景仍是拖拽结果，双栈长度不变
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
    const snapshot = JSON.parse(raw!)
    expect(snapshot.scene.eye).toEqual({ x: 18, y: 22 })
    expect(snapshot.undoStack).toHaveLength(1)
    expect(snapshot.redoStack).toHaveLength(0)

    // 撤销栈不变：仍可一次撤销回到默认场景
    await expect(page.getByTestId('undo-button')).toBeEnabled()
    await page.getByTestId('undo-button').click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
    // 重做栈也未被失败导入污染：重做回到拖拽后的场景
    await page.getByTestId('redo-button').click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('18')
  })

  test('障碍增删各记一个事务', async ({ page }) => {
    const added = page.getByLabel('障碍 obstacle-3 左')
    await page.getByRole('button', { name: '添加障碍' }).click()
    await expect(added).toHaveCount(1)

    await page.getByTestId('undo-button').click()
    await expect(added).toHaveCount(0)

    await page.getByTestId('redo-button').click()
    await expect(added).toHaveCount(1)

    await page.getByLabel('删除障碍 obstacle-3').click()
    await expect(added).toHaveCount(0)
    await page.getByTestId('undo-button').click()
    await expect(added).toHaveCount(1)
  })

  test('撤销后的重做栈跨刷新保留，刷新后可重做', async ({ page }) => {
    await dragOnCanvas(page, { x: 8, y: 12 }, { x: 18, y: 22 })
    await page.getByTestId('undo-button').click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')

    await page.reload()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('redo-button')).toBeEnabled()

    await page.getByTestId('redo-button').click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('18')
    await expect(page.getByLabel('眼点 Y')).toHaveValue('22')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'clear')
  })

  test('存档损坏时载入默认场景并明确提示恢复失败', async ({ page }) => {
    await page.goto('/')
    await page.evaluate((key) => window.localStorage.setItem(key, '{损坏的快照'), STORAGE_KEY)
    await page.reload()
    await expect(page.getByTestId('restore-failed-notice')).toBeVisible()
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
    await expect(page.getByTestId('result-status')).toContainText('railing-1')
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
    await expect(page.getByTestId('undo-button')).toBeDisabled()

    // 结构完整但场景非法同样拒绝接管
    await page.evaluate(
      (key) =>
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            scene: { eye: { x: 500, y: 0 }, target: { x: 1, y: 1 }, obstacles: [] },
            undoStack: [],
            redoStack: [],
          }),
        ),
      STORAGE_KEY,
    )
    await page.reload()
    await expect(page.getByTestId('restore-failed-notice')).toBeVisible()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
  })

  test('快照缺失时载入默认场景并提示恢复失败', async ({ page, context }) => {
    await context.clearCookies()
    // 清掉此前用例写入的快照，模拟无任何存档的首次访问
    await page.evaluate((key) => window.localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
    await expect(page.getByLabel('障碍 railing-1 左')).toHaveValue('30')
    await expect(page.getByTestId('restore-failed-notice')).toBeVisible()
    await expect(page.getByTestId('undo-button')).toBeDisabled()
  })

  test('存储写入失败：编辑与撤销仍可用，并提示刷新可能丢失', async ({ page }) => {
    await page.addInitScript((key) => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (this: Storage, k: string, v: string) {
        if (k === key) throw new DOMException('persistence unavailable', 'QuotaExceededError')
        return original.call(this, k, v)
      }
    }, STORAGE_KEY)
    await page.reload()

    await expect(page.getByTestId('persist-failed-notice')).toBeVisible()

    // 本次页面编辑照常生效
    await page.getByLabel('眼点 X').fill('20')
    await expect(page.getByLabel('眼点 X')).toHaveValue('20')

    // 撤销能力保留
    await page.getByTestId('undo-button').click()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')

    // 刷新后改动确实无法找回
    await page.reload()
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')
  })

  test('拖拽被取消（pointercancel / 失去捕获）：恢复拖拽前场景且不留历史', async ({ page }) => {
    const start = await sceneToClient(page, 8, 12)
    const end = await sceneToClient(page, 18, 22)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(end.x, end.y, { steps: 8 })
    await expect(page.getByLabel('眼点 X')).toHaveValue('18')

    // 浏览器在手势中断时会派发 pointercancel（随后释放捕获）
    await page.evaluate(() => {
      const svg = document.querySelector('svg[data-testid="canvas"]')!
      svg.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }))
      svg.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))
    })
    await page.mouse.up()

    // 场景恢复到拖拽前，撤销栈没有本次拖拽的事务
    await expect(page.getByLabel('眼点 X')).toHaveValue('8')
    await expect(page.getByLabel('眼点 Y')).toHaveValue('12')
    await expect(page.getByTestId('undo-button')).toBeDisabled()
    await expect(page.getByTestId('result-status')).toHaveAttribute('data-status', 'blocked')

    // 存储快照也未被中途的临时位移覆盖
    const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)
    expect(JSON.parse(raw!).scene.eye).toEqual({ x: 8, y: 12 })
  })
})
