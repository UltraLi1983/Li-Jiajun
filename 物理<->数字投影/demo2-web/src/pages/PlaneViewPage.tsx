import { useScenarioStore } from '../app/scenarioStore';
import { OperationalLayoutMap } from '../components/OperationalLayoutMap';

export function PlaneViewPage() {
  const scenario = useScenarioStore((state) => state.scenario);
  const roughCalculation = useScenarioStore((state) => state.roughCalculation);
  return <div className="page-stack">
    <section className="section-card"><p className="eyebrow">T6.1 PLANE OPERATION VIEW</p><h2>全厂平面运营视图</h2><p>区域、工站、配送点和路径段来自同一份恢复场景。点击对象可查看当前计算说明。</p></section>
    <OperationalLayoutMap scenario={scenario} roughCalculation={roughCalculation} />
  </div>;
}
