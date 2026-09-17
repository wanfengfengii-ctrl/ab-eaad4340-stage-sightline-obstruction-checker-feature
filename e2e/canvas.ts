import type { Page } from '@playwright/test'

/** 场景坐标 (x, y) → 页面客户端像素坐标（与被测页面同一套 CTM 变换）。 */
export async function sceneToClient(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  return page.evaluate(([sx, sy]) => {
    const svg = document.querySelector('svg[data-testid="canvas"]') as SVGSVGElement
    const ctm = svg.getScreenCTM()!
    const pt = new DOMPoint(sx, 100 - sy).matrixTransform(ctm)
    return { x: pt.x, y: pt.y }
  }, [x, y])
}

/** 用鼠标把场景坐标 from 处的对象拖到场景坐标 to 处。 */
export async function dragOnCanvas(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  const start = await sceneToClient(page, from.x, from.y)
  const end = await sceneToClient(page, to.x, to.y)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 12 })
  await page.mouse.up()
}
