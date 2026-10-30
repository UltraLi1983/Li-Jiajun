import { useScenarioStore } from '../app/scenarioStore';

export function ParametersPage() {
  const scenario = useScenarioStore((state) => state.scenario);
  const calendar = scenario.productionCalendar;

  return (
    <div className="page-stack">
      <section className="section-card">
        <p className="eyebrow">T4 参数录入</p>
        <h2>生产日历、物料 HU、运输工具</h2>
        <p>第一版先展示字段和计算口径，后续接入可编辑表单。</p>
      </section>
      <div className="data-grid">
        <Info label="周需求" value={`${calendar.weeklyDemandQty} pcs`} />
        <Info label="每周生产天数" value={`${calendar.productionDaysPerWeek} days`} />
        <Info label="每日班次" value={`${calendar.shiftsPerDay} shifts`} />
        <Info label="班次时长" value={`${calendar.hoursPerShift} h`} />
        <Info label="有效生产工时" value={`${calendar.effectiveHoursPerShift} h`} />
        <Info label="物料数量" value={`${scenario.materials.length}`} />
        <Info label="运输工具类型" value={`${scenario.transportResources.length}`} />
        <Info label="Rack 数量" value={`${scenario.racks.length}`} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
