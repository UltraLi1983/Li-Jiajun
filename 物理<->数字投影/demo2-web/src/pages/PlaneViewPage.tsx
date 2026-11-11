import { useScenarioStore } from '../app/scenarioStore';
import { OperationalLayoutMap } from '../components/OperationalLayoutMap';
import { ImportedOperationalMap } from '../components/ImportedOperationalMap';

export function PlaneViewPage() {
  const scenario = useScenarioStore((state) => state.scenario);
  const activeLayout = useScenarioStore((state) => state.activeImportedLayout);
  const roughCalculation = useScenarioStore((state) => state.roughCalculation);
  if (activeLayout) return <div className="page-stack"><section className="section-card"><p className="eyebrow">T6.1 PLANE OPERATION VIEW</p><h2>全厂平面运营视图</h2><p>当前 Layout：{activeLayout.unitName || activeLayout.fileName} · {activeLayout.buildingName || '楼栋待定义'} / {activeLayout.floorLabel || '楼层待定义'}。图层来自已选图纸；物料流与运力结果待映射后计算。</p></section><ImportedOperationalMap layout={activeLayout} /></div>;
  return <div className="page-stack">
    <section className="section-card"><p className="eyebrow">T6.1 PLANE OPERATION VIEW</p><h2>全厂平面运营视图</h2><p>区域、工站、配送点和路径段来自同一份恢复场景。点击对象可查看当前计算说明。</p></section>
    <OperationalLayoutMap scenario={scenario} roughCalculation={roughCalculation} />
  </div>;
}
