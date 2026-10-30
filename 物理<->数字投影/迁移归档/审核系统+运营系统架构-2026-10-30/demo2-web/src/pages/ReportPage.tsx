import { useScenarioStore } from '../app/scenarioStore';

export function ReportPage() {
  const scenario=useScenarioStore((state)=>state.scenario);
  const result=useScenarioStore((state)=>state.roughCalculation);
  const trips=result.materials.reduce((sum,item)=>sum+item.replenishmentTripsPerShift,0);
  const topArea=[...result.areas].sort((a,b)=>b.utilizationRate-a.utilizationRate)[0];
  const topTransport=[...result.transport].sort((a,b)=>b.utilizationRate-a.utilizationRate)[0];
  return <div className="page-stack"><section className="section-card"><p className="eyebrow">T9 RECOVERY REPORT</p><h2>当前方案计算报告</h2><p>{scenario.name} · 当前周需求 {scenario.productionCalendar.weeklyDemandQty} 总成。以下由当前会话参数计算，不使用样例静态 KPI。</p><button type="button" onClick={()=>window.print()}>打印 / 保存为 PDF</button></section>
    <div className="recovery-grid"><article className="recovery-card"><strong>补货压力</strong>{trips} trips / shift</article><article className="recovery-card"><strong>最高面积压力</strong>{topArea?.storageAreaName??'—'} · {Math.round((topArea?.utilizationRate??0)*100)}%</article><article className="recovery-card"><strong>最高运输资源压力</strong>{topTransport?.resourceName??'—'} · {Math.round((topTransport?.utilizationRate??0)*100)}%</article></div>
    <section className="section-card"><h3>物料与配送关系</h3><div className="recovery-grid">{result.materials.map((material)=><article className="recovery-card" key={material.materialId}><strong>{material.materialName}</strong><span>{material.huDemandPerShift} HU / shift · {material.replenishmentTripsPerShift} trips / shift</span><span>{material.deliveryPointCalculations.map((point)=>point.deliveryPointId).join('、')}</span></article>)}</div></section>
    <section className="section-card"><h3>当前约束</h3>{result.expansionRisks.map((risk)=><p key={risk.id}><strong>{risk.title} · {risk.riskStatus}</strong><br/>{risk.description}</p>)}</section>
    <section className="section-card"><h3>计算边界</h3><p>本报告为恢复版 rough calculation。原始 Layout 图片与精确坐标未找回，当前场地和路径数字仅供演示，不用于施工或采购决策。</p></section>
  </div>;
}
