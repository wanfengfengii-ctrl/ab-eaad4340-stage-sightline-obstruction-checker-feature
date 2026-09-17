# 剧场剖面视线核验器

小型剧场改造场景下的纯前端剖面核验工具：判断观众**眼点**到舞台字幕屏**目标点**的视线是否被栏杆等**障碍**遮挡。技术栈为 TypeScript + React + Vite + SVG，无任何后端与假接口；Docker Compose 仅承载静态 Web。

## 坐标口径

- 画布为 100 m × 100 m 的剖面：**原点 (0, 0) 在左下角，x 轴向右，y 轴向上**，单位米。
- 所有输入数值必须在 **0 ~ 100** 之间，且**最多两位小数**（拖拽落点同样按两位小数取整）。
- **眼点 `eye`** 与**目标点 `target`** 至多各一个，且二者**不得重合**。
- **障碍 `obstacles`** 为轴对齐矩形，最多 **20** 个，`id` 必须为非空且唯一的字符串，并满足 `left < right`、`bottom < top`。

## 判定规则

- 取眼点到目标点的**闭线段**（含两个端点）与每个障碍的**闭矩形**（含边与角）求交：
  只要有公共点即判**遮挡**——仅擦边、仅碰角、端点落在矩形上、眼点在矩形内部，都算遮挡。
- **首个障碍**：按"沿视线方向首个交点到眼点的距离"最近者确定；距离相同（同距）时按 `id` 字典序取小。
- 画面表达：无遮挡时视线为**绿线**；被遮挡时视线为**红线**，并标出**交点**与**首个障碍 id**（画布标签 + 结果面板中的交点坐标与距离）。
- 表单与图形即时一致：拖动画布中的眼点 / 目标点 / 障碍矩形，或编辑右侧表单，另一方同步更新。
- **非法导入整体拒绝**：JSON 解析失败或任一校验规则不满足时，不改动当前画面，仅列出全部错误。

## 事务化编辑历史（撤销 / 重做）

- 界面提供「撤销」「重做」两个入口。以下操作各记为**一个事务**：表单每次合法提交、障碍增删、一次成功导入；画布上**按下至抬起的全部位移归并为一个事务**。
- 拖拽被取消或失去捕获时，恢复拖拽前场景且不留历史；原地点击（无净位移）不产生事务。
- 撤销后发生新编辑会丢弃整条重做分支；最多保留 **50** 个已提交事务，超出时丢弃最旧者。
- 当前场景、撤销栈、重做栈作为**单一快照**写入 `localStorage`，刷新后恢复完全相同的可操作状态。
- 快照需通过现有场景校验（`validateScene`）才会接管页面；快照缺失或不合法时载入默认场景并明确提示恢复失败。
- 存储写入失败（如配额不足）时，页面内的编辑与撤销能力不受影响，但会提示刷新可能丢失。
- 非法表单值与失败导入既不产生事务，也不覆盖快照。

## JSON 格式与示例

顶层只允许 `eye`、`target`、`obstacles` 三个字段；点只允许 `x`、`y`；障碍只允许 `id`、`left`、`bottom`、`right`、`top`：

```json
{
  "eye": { "x": 8, "y": 12 },
  "target": { "x": 92, "y": 26 },
  "obstacles": [
    { "id": "railing-1", "left": 30, "bottom": 0, "right": 34, "top": 20 },
    { "id": "screen-rig", "left": 70, "bottom": 40, "right": 74, "top": 50 }
  ]
}
```

该示例（即应用默认场景，可点「填入示例」→「导入」复现）的判定结果为：

> 首次遮挡：障碍 **railing-1**，交点 **(30.00, 15.67)**，距眼点 **22.30 m**。

`screen-rig` 高于视线，不参与遮挡。把 `railing-1` 的 `top` 改为 `14` 后视线从栏杆上方通过，判定变为可见（绿线）。

## 本地开发

```bash
npm ci                # 安装依赖
npm run dev           # 开发服务器（默认 http://localhost:5173）
npm run test          # Vitest：几何判定 + JSON 校验 + 编辑历史 + 快照持久化（53 个用例）
npm run build         # tsc 类型检查 + 生产构建（输出 dist/）
npm run e2e           # Playwright：判定、拖拽、导入、撤销/重做与刷新恢复（需先执行下行）
npx playwright install chromium
```

## Docker

```bash
# 静态 Web：默认 http://localhost:8080，可用 WEB_PORT 改宿主端口
docker compose up --build web
WEB_PORT=9000 docker compose up --build web

# 一次性验收服务：tsc 类型检查 + Vitest 单元测试 + 生产构建，跑完即退出
docker compose run --rm verify
```

- `web` 服务：多阶段构建，`nginx:alpine` 仅托管 `dist/` 静态文件，容器内端口 80 映射到宿主 `${WEB_PORT:-8080}`。
- `verify` 服务：一次性容器，依次执行 `vitest run`、`tsc --noEmit`、`vite build`，任一失败即以非零码退出。

## 目录结构

```
src/
  types.ts        # Point / Obstacle / Scene 类型
  geometry.ts     # 闭线段-闭矩形求交（slab 法）、首个障碍判定
  schema.ts       # JSON 解析与全部校验规则（整体拒绝）
  history.ts      # 事务化编辑历史：提交 / 撤销 / 重做、拖拽归并、50 事务上限
  persistence.ts  # 单一快照（场景+撤销栈+重做栈）的序列化、校验与读写
  presets.ts      # 默认场景（即 README 示例）
  components/     # Canvas(SVG+拖拽) / SceneForm / ResultPanel / ImportPanel
src/*.test.ts     # Vitest 单元测试（判定、校验、历史、持久化）
e2e/app.spec.ts   # Playwright 端到端测试（判定、拖拽、导入）
e2e/history.spec.ts # Playwright 端到端测试（撤销/重做、刷新恢复、快照与写入失败）
e2e/canvas.ts     # e2e 共用的画布拖拽辅助
Dockerfile        # base / verify / build / web 四个阶段
docker-compose.yml
```
