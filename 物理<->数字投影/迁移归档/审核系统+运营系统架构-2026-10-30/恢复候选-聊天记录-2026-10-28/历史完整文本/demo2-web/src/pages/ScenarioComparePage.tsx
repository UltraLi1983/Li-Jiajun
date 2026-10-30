import { useScenarioStore } from '../app/scenarioStore';

export function ScenarioComparePage() {
  const scenarios = useScenarioStore((state) => state.scenario.scenarios);

  return (
    <div className="page-stack">
      <section className="section-card">
        <p className="eyebrow">T8 Baseline / Proposed / Stress</p>
        <h2>方案对比</h2>
        <p>第一版采用“系统按规则生成推荐方案 + 用户可手工调整”的半自动方式。</p>
      </section>
      <div className="scenario-table">
        {scenarios.map((scenario) => (
          <article key={scenario.id} className="scenario-card">
            <h3>{scenario.name}</h3>
            <p>{scenario.description}</p>
            <dl>
              <div><dt>总距离</dt><dd>{scenario.kpi.totalTravelDistanceM} m</dd></div>
              <div><dt>响应</dt><dd>{scenario.kpi.avgReplenishmentResponseMin} min</dd></div>
              <div><dt>线边 HU</dt><dd>{scenario.kpi.lineSideInventoryHu}</dd></div>
              <div><dt>风险</dt><dd>{scenario.kpi.capacityRiskCount}</dd></div>
            </dl>
          </article>
        ))}
      </div>
    </div>
  );
}
