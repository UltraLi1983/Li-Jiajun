import { useScenarioStore } from '../app/scenarioStore';
import type { Demo2Scenario } from '../types/demo2';

export function ParametersPage() {
  const scenario = useScenarioStore((state) => state.scenario);
  const result = useScenarioStore((state) => state.roughCalculation);
  const update = useScenarioStore((state) => state.updateScenario);
  const save = useScenarioStore((state) => state.saveCurrentDraft);
  const setCalendar = (field: keyof Demo2Scenario['productionCalendar'], value: number) => update((current) => ({ ...current, productionCalendar: { ...current.productionCalendar, [field]: value } }));
  return <div className="page-stack">
    <section className="section-card"><p className="eyebrow">T4 PARAMETERS</p><h2>生产、物料与运输资源</h2><p>修改后立即重算；保存本地草稿后可在浏览器刷新时恢复。</p><button type="button" onClick={save}>保存本地草稿</button></section>
    <section className="section-card"><h3>生产日历</h3><div className="recovery-grid">
      <NumberField label="客户周需求 · 总成" value={scenario.productionCalendar.weeklyDemandQty} min={1} onChange={(v) => setCalendar('weeklyDemandQty', v)} />
      <NumberField label="每周生产天数" value={scenario.productionCalendar.productionDaysPerWeek} min={1} max={7} onChange={(v) => setCalendar('productionDaysPerWeek', v)} />
      <NumberField label="每日可用班次" value={scenario.productionCalendar.shiftsPerDay} min={1} max={3} onChange={(v) => setCalendar('shiftsPerDay', v)} />
      <NumberField label="班次时长 h" value={scenario.productionCalendar.hoursPerShift} min={1} max={24 / scenario.productionCalendar.shiftsPerDay} onChange={(v) => setCalendar('hoursPerShift', v)} />
      <NumberField label="单班有效生产工时 h" value={scenario.productionCalendar.effectiveHoursPerShift} min={0.1} max={scenario.productionCalendar.hoursPerShift} onChange={(v) => setCalendar('effectiveHoursPerShift', v)} />
    </div></section>
    <section className="section-card"><h3>物料与标准 HU</h3><div className="recovery-grid">{scenario.materials.map((material) => { const hu=scenario.handlingUnits.find((item)=>item.materialId===material.id); return <article className="recovery-card" key={material.id}><strong>{material.name}</strong>
      <NumberField label="总成单件用量" value={material.qtyPerFinishedGood} min={0} onChange={(v)=>update((current)=>({...current,materials:current.materials.map((item)=>item.id===material.id?{...item,qtyPerFinishedGood:v}:item)}))}/>
      <NumberField label="每 HU 数量" value={hu?.qtyPerHu??1} min={1} onChange={(v)=>update((current)=>({...current,handlingUnits:current.handlingUnits.map((item)=>item.materialId===material.id?{...item,qtyPerHu:v}:item)}))}/>
      <NumberField label="单次补货目标 HU" value={material.targetHuPerReplenishment??2} min={1} onChange={(v)=>update((current)=>({...current,materials:current.materials.map((item)=>item.id===material.id?{...item,targetHuPerReplenishment:Math.round(v)}:item)}))}/>
      <small>配送点：{material.deliveryPointAllocations?.map((item)=>item.deliveryPointId).join('、')??material.assignedDeliveryPointId}</small>
    </article>;})}</div></section>
    <section className="section-card"><h3>运输资源</h3><div className="recovery-grid">{scenario.transportResources.map((resource)=><article className="recovery-card" key={resource.id}><strong>{resource.name}</strong>
      <NumberField label="可用数量" value={resource.quantity} min={0} onChange={(v)=>update((current)=>({...current,transportResources:current.transportResources.map((item)=>item.id===resource.id?{...item,quantity:Math.round(v)}:item)}))}/>
      <NumberField label="速度 m/min" value={resource.speedMPerMin} min={1} onChange={(v)=>update((current)=>({...current,transportResources:current.transportResources.map((item)=>item.id===resource.id?{...item,speedMPerMin:v}:item)}))}/>
    </article>)}</div></section>
    <section className="section-card"><h3>即时计算</h3><div className="recovery-grid"><div className="info-cell">补货趟次<strong>{result.materials.reduce((sum,item)=>sum+item.replenishmentTripsPerShift,0)} trips / shift</strong></div><div className="info-cell">最高运输负荷<strong>{Math.round(Math.max(0,...result.transport.map(item=>item.utilizationRate))*100)}%</strong></div><div className="info-cell">最高面积利用<strong>{Math.round(Math.max(0,...result.areas.map(item=>item.utilizationRate))*100)}%</strong></div></div></section>
  </div>;
}

function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max?:number;onChange:(value:number)=>void}) {
  return <label className="recovery-field"><span>{label}</span><input type="number" value={value} min={min} max={max} step="any" onChange={(event)=>{const next=Number(event.target.value);if(Number.isFinite(next)&&next>=min&&(max===undefined||next<=max))onChange(next);}} /></label>;
}
