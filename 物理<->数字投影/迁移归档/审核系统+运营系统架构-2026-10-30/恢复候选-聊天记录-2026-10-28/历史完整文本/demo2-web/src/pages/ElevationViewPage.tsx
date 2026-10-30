import { useScenarioStore } from '../app/scenarioStore';

export function ElevationViewPage() {
  const racks = useScenarioStore((state) => state.scenario.racks);

  return (
    <div className="page-stack">
      <section className="section-card">
        <p className="eyebrow">T7 RackElevationView</p>
        <h2>存储对象立面 / 剖面钻取</h2>
        <p>统一组件会覆盖主仓高位货架、超市区料道、线边料架和 WIP 暂存架。</p>
      </section>
      <div className="rack-grid">
        {racks.map((rack) => (
          <article className="rack-card" key={rack.id}>
            <h3>{rack.name}</h3>
            <span>{rack.rackType}</span>
            <div className="rack-levels">
              {[...rack.levels].reverse().map((level) => (
                <div className="rack-level" key={level.id}>
                  <small>L{level.levelIndex}</small>
                  {level.lanes.map((lane) => (
                    <div className="rack-lane" key={lane.id}>
                      {lane.skuSlots.map((slot) => (
                        <div className={`slot slot-${slot.riskStatus}`} key={slot.id}>
                          {slot.currentHuQty}/{slot.physicalCapacityHuQty} HU
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
