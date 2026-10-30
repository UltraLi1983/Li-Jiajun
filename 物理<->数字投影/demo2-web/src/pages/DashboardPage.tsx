import { useScenarioStore } from '../app/scenarioStore';

export function DashboardPage() {
  const scenario = useScenarioStore((state) => state.scenario);
  const proposed = scenario.scenarios.find((item) => item.id === 'proposed');
  const baseline = scenario.scenarios.find((item) => item.id === 'baseline');

  return (
    <div className="page-stack">
      <div className="hero-card">
        <div>
          <p className="eyebrow">Demo2 第一版</p>
          <h2>物理数字孪生与运营优化 Demo</h2>
          <p>
            当前骨架已接入标准样板场景。下一步会从 Layout 标注、参数录入和 rough 计算开始，把路线、仓储、WIP、水位和运输任务连成闭环。
          </p>
        </div>
        <div className="hero-metric">
          <span>Supermarket</span>
          <strong>{scenario.settings.supermarketModeEnabled ? 'ON' : 'OFF'}</strong>
        </div>
      </div>

      <div className="metric-grid">
        <MetricCard title="搬运距离改善" value={`${delta(baseline?.kpi.totalTravelDistanceM, proposed?.kpi.totalTravelDistanceM)} m`} caption="Baseline → Proposed" />
        <MetricCard title="响应时间改善" value={`${delta(baseline?.kpi.avgReplenishmentResponseMin, proposed?.kpi.avgReplenishmentResponseMin)} min`} caption="平均补货响应" />
        <MetricCard title="线边 HU 下降" value={`${delta(baseline?.kpi.lineSideInventoryHu, proposed?.kpi.lineSideInventoryHu)} HU`} caption="线边库存水位" />
        <MetricCard title="库容风险减少" value={`${delta(baseline?.kpi.capacityRiskCount, proposed?.kpi.capacityRiskCount)}`} caption="风险点数量" />
      </div>
    </div>
  );
}

function MetricCard({ title, value, caption }: { title: string; value: string; caption: string }) {
  return (
    <article className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{caption}</small>
    </article>
  );
}

function delta(a = 0, b = 0) {
  return a - b > 0 ? `-${a - b}` : `${a - b}`;
}
