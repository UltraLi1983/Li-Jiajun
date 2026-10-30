import { useScenarioStore } from '../app/scenarioStore';

export function PlaneViewPage() {
  const scenario = useScenarioStore((state) => state.scenario);

  return (
    <div className="page-stack">
      <section className="section-card">
        <p className="eyebrow">T6 平面运营视图</p>
        <h2>全厂平面运营视图</h2>
        <p>这里会展示 Layout、主仓、超市区、线边、工站、配送点、路线和运输任务动画。</p>
      </section>
      <div className="mini-layout" aria-label="standard demo layout preview">
        {scenario.storageAreas.map((area) => (
          <div key={area.id} className={`layout-area layout-area-${area.type}`} style={boxStyle(area.boundary)}>
            {area.name}
          </div>
        ))}
        {scenario.pathNetwork.segments.map((segment) => (
          <div key={segment.id} className="route-pill">{segment.id}</div>
        ))}
      </div>
    </div>
  );
}

function boxStyle(boundary: Array<{ x: number; y: number }>) {
  const xs = boundary.map((point) => point.x);
  const ys = boundary.map((point) => point.y);
  const left = Math.min(...xs) / 12;
  const top = Math.min(...ys) / 7.6;
  const width = (Math.max(...xs) - Math.min(...xs)) / 12;
  const height = (Math.max(...ys) - Math.min(...ys)) / 7.6;
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` };
}
