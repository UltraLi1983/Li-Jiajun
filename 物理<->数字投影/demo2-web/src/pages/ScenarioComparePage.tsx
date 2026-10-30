import { useMemo } from 'react';
import { useScenarioStore } from '../app/scenarioStore';
import { calculateRoughMetrics } from '../features/rough-calculation/calculateRoughMetrics';
import type { RoughCalculationResult } from '../types/demo2';

function metrics(result:RoughCalculationResult) { return { trips:result.materials.reduce((sum,item)=>sum+item.replenishmentTripsPerShift,0), transport:Math.round(Math.max(0,...result.transport.map(item=>item.utilizationRate))*100), area:Math.round(Math.max(0,...result.areas.map(item=>item.utilizationRate))*100) }; }
export function ScenarioComparePage() {
  const scenario=useScenarioStore((state)=>state.scenario);
  const baseline=useScenarioStore((state)=>state.roughCalculation);
  const enabled=useScenarioStore((state)=>state.supermarketEnabled);
  const update=useScenarioStore((state)=>state.updateScenario);
  const toggle=useScenarioStore((state)=>state.toggleSupermarket);
  const proposed=useMemo(()=>calculateRoughMetrics({...scenario,materials:scenario.materials.map((item)=>({...item,targetHuPerReplenishment:Math.max(1,Math.floor((item.targetHuPerReplenishment??2)*0.75))}))},true),[scenario]);
  const stressBase=useMemo(()=>calculateRoughMetrics({...scenario,productionCalendar:{...scenario.productionCalendar,weeklyDemandQty:scenario.productionCalendar.weeklyDemandQty*1.2}},enabled),[scenario,enabled]);
  const stressProposed=useMemo(()=>calculateRoughMetrics({...scenario,productionCalendar:{...scenario.productionCalendar,weeklyDemandQty:scenario.productionCalendar.weeklyDemandQty*1.2},materials:scenario.materials.map((item)=>({...item,targetHuPerReplenishment:Math.max(1,Math.floor((item.targetHuPerReplenishment??2)*0.75))}))},true),[scenario]);
  return <div className="page-stack"><section className="section-card"><p className="eyebrow">T8 BASELINE · PROPOSED · STRESS</p><h2>方案对比</h2><p>两方案使用相同客户需求。候选方案启用超市区，并尝试压缩单次线边补货批量；结果由当前参数即时计算。</p></section>
    <div className="recovery-grid"><ResultCard title="Baseline 当前方案" result={baseline}/><ResultCard title="Proposed Preview 候选" result={proposed}/></div>
    <section className="section-card"><h3>方案差异元素</h3><div className="recovery-grid"><div className="recovery-card"><strong>共同需求</strong>{scenario.productionCalendar.weeklyDemandQty} assy / week</div><div className="recovery-card"><strong>超市区分段补货</strong>{enabled?'当前已启用':'候选启用'}</div><div className="recovery-card"><strong>线边暂存批量</strong>候选减少单次目标 HU，需复核运输负荷与不断料条件。</div></div><button type="button" onClick={()=>{update((current)=>({...current,materials:current.materials.map((item)=>({...item,targetHuPerReplenishment:Math.max(1,Math.floor((item.targetHuPerReplenishment??2)*0.75))}))}));if(!enabled)toggle();}}>采纳到当前会话</button></section>
    <section className="section-card"><h3>需求 +20% 约束爆点</h3><p>Baseline Stress 与 Proposed Stress 均按 {Math.round(scenario.productionCalendar.weeklyDemandQty*1.2)} assy / week 重算。</p><div className="recovery-grid"><ResultCard title="Baseline Stress" result={stressBase}/><ResultCard title="Proposed Stress" result={stressProposed}/></div></section>
  </div>;
}
function ResultCard({title,result}:{title:string;result:RoughCalculationResult}) { const values=metrics(result);return <article className="recovery-card"><strong>{title}</strong><span>补货 {values.trips} trips / shift</span><span>最高运输负荷 {values.transport}%</span><span>最高面积利用 {values.area}%</span><span>路径未解析 {result.transportPlan.unresolvedLegCount} 条</span></article>; }
