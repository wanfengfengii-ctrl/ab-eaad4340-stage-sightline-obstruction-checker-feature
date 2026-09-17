import type { Analysis } from '../geometry'

const fmt = (v: number) => v.toFixed(2)

export function ResultPanel({ analysis }: { analysis: Analysis }) {
  if (analysis.status === 'clear') {
    return (
      <section className="panel result result--clear">
        <h2>判定结果</h2>
        <p data-testid="result-status" data-status="clear" className="result-line">
          ✅ 可见：眼点到目标点的闭线段不与任何障碍相交。
        </p>
      </section>
    )
  }
  return (
    <section className="panel result result--blocked">
      <h2>判定结果</h2>
      <p data-testid="result-status" data-status="blocked" className="result-line">
        ⛔ 首次遮挡：障碍 <strong>{analysis.obstacleId}</strong>，交点 ({fmt(analysis.point.x)},{' '}
        {fmt(analysis.point.y)})，距眼点 {fmt(analysis.distance)} m。
      </p>
    </section>
  )
}
