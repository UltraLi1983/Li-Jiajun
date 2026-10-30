import { useState } from 'react';
import { useScenarioStore } from '../app/scenarioStore';

export function ElevationViewPage() {
  const scenario=useScenarioStore((state)=>state.scenario);
  const result=useScenarioStore((state)=>state.roughCalculation);
  const [areaId,setAreaId]=useState(scenario.storageAreas.find((area)=>area.type==='line_side')?.id??scenario.storageAreas[0]?.id??'');
  const [slotKey,setSlotKey]=useState('');
  const area=scenario.storageAreas.find((item)=>item.id===areaId);
  const points=scenario.deliveryPoints.filter((point)=>point.storageAreaId===areaId);
  const levels=result.waterLevels.filter((level)=>level.locationId.toLowerCase()===areaId.toLowerCase()||points.some((point)=>point.id.toLowerCase()===level.locationId.toLowerCase()));
  const selected=levels.find((level)=>`${level.locationId}:${level.materialId}`===slotKey)??levels[0];
  const material=scenario.materials.find((item)=>item.id===selected?.materialId);
  return <div className="page-stack"><section className="section-card"><p className="eyebrow">T7 ELEVATION VIEW</p><h2>库位与线边水位</h2><p>按区域查看物料 HU 水位；精益建议水位用于优化，物理容量用于极限判断。</p></section>
    <div className="recovery-grid"><section className="section-card"><h3>区域</h3><div className="recovery-list">{scenario.storageAreas.map((item)=><button type="button" key={item.id} className={item.id===areaId?'active':''} onClick={()=>{setAreaId(item.id);setSlotKey('');}}>{item.name}</button>)}</div></section>
      <section className="section-card"><h3>{area?.name??'未选择'} · 立面</h3>{levels.length? <div className="recovery-list">{levels.map((level)=><button type="button" key={`${level.locationId}:${level.materialId}`} className={selected===level?'active':''} onClick={()=>setSlotKey(`${level.locationId}:${level.materialId}`)}>{scenario.materials.find((item)=>item.id===level.materialId)?.name??level.materialId} · {level.locationId} · {level.currentHuQty}/{level.physicalCapacityHuQty} HU</button>)}</div>:<p>该区域没有已配置的物料库位水位。功能区不显示虚构库容。</p>}</section>
      <section className="section-card"><h3>Selected Slot Water</h3>{selected?<><strong>{material?.name??selected.materialId}</strong><p>{selected.locationId}</p><div className="recovery-grid"><div className="info-cell">Current<strong>{selected.currentHuQty} HU</strong></div><div className="info-cell">Min<strong>{selected.minHuQty} HU</strong></div><div className="info-cell">精益建议水位<strong>{selected.leanSuggestedHuQty} HU</strong></div><div className="info-cell">Max<strong>{selected.maxHuQty} HU</strong></div><div className="info-cell">Physical Cap<strong>{selected.physicalCapacityHuQty} HU</strong></div></div><p>{selected.maxHuQty>selected.physicalCapacityHuQty?'最大水位超过物理容量，需调整库位或补货批量。':selected.maxHuQty>selected.leanSuggestedHuQty?'当前未超物理容量；仍有压缩现场水位的优化空间。':'当前水位处于建议范围。'}</p></>:<p>选择有物料任务的库位查看水位。</p>}</section></div>
  </div>;
}
