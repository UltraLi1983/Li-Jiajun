import { useState } from 'react';
import { useScenarioStore } from '../app/scenarioStore';
import { OperationalLayoutMap } from '../components/OperationalLayoutMap';
import { ImportedLayoutWorkspace } from '../components/ImportedLayoutWorkspace';

export function LayoutAnnotationPage() {
  const scenario = useScenarioStore((state)=>state.scenario);
  const result = useScenarioStore((state)=>state.roughCalculation);
  const update = useScenarioStore((state)=>state.updateLayoutDraft);
  const save = useScenarioStore((state)=>state.saveCurrentDraft);
  const resetToSample = useScenarioStore((state)=>state.resetToSample);
  const restorePreviousDraft = useScenarioStore((state)=>state.restorePreviousDraft);
  const persistence = useScenarioStore((state)=>state.persistence);
  const [selectedId,setSelectedId] = useState(scenario.deliveryPoints[0]?.id ?? '');
  const point = scenario.deliveryPoints.find((item)=>item.id===selectedId);
  const updatePointPosition = (axis:'x'|'y', value:number) => {
    if(!point) return;
    const position = {...point.position,[axis]:value};
    const nodes = scenario.pathNetwork.nodes.map((node)=>node.id===point.routeNodeId && node.id===point.id?{...node,position}:node);
    const nodeById = new Map(nodes.map((node)=>[node.id,node]));
    const scale = scenario.layout.calculationScaleMPerPx ?? scenario.layout.scaleMetersPerPixel;
    const segments = scenario.pathNetwork.segments.map((segment)=>{
      if(segment.fromNodeId!==point.id && segment.toNodeId!==point.id) return segment;
      const from = nodeById.get(segment.fromNodeId)?.position;
      const to = nodeById.get(segment.toNodeId)?.position;
      return from && to ? {...segment,distanceM:Math.round(Math.hypot(to.x-from.x,to.y-from.y)*scale*10)/10} : segment;
    });
    update({deliveryPoints:scenario.deliveryPoints.map((item)=>item.id===point.id?{...item,position}:item),pathNetwork:{...scenario.pathNetwork,nodes,segments}});
  };
  const exportCurrentScene = () => {
    const file = new Blob([JSON.stringify(scenario, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = `demo2-scene-${new Date().toISOString().slice(0,10)}.json`;
    link.click();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  };
  return <div className="page-stack">
    <section className="section-card"><p className="eyebrow">T3 FACTORY SCENE</p><h2>工厂场景与 Layout 标注</h2><p>{persistence.message} · revision {persistence.revision}</p>
      <div className="recovery-grid"><div className="recovery-card"><span>当前可计算场景比例尺</span><strong>{scenario.layout.scaleMetersPerPixel.toFixed(5)} m/px</strong></div><button type="button" onClick={save}>保存本地草稿</button><button type="button" onClick={exportCurrentScene}>导出当前场景 JSON</button><button type="button" onClick={()=>{if(window.confirm('将当前草稿备份后切换到演示样板。确定继续吗？')){resetToSample();setSelectedId('DP-A1');}}}>恢复演示样板</button><button type="button" onClick={()=>{restorePreviousDraft();setSelectedId('DP-A1');}}>恢复上次草稿</button></div>
    </section>
    <ImportedLayoutWorkspace />
    {scenario.layout.backgroundDataUrl && <p className="section-card">当前可计算场景：{scenario.layout.sourceFileName ?? 'Layout 图片'}。此处沿用已标注的重建样板；原始障碍物边界尚未恢复。</p>}
    <OperationalLayoutMap scenario={scenario} roughCalculation={result} compact />
    <section className="section-card"><h3>当前可计算场景 · 配送点人工编辑</h3><div className="recovery-grid"><label className="recovery-field">选择配送点<select value={selectedId} onChange={(event)=>setSelectedId(event.target.value)}>{scenario.deliveryPoints.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {point && <><label className="recovery-field">X 坐标<input type="number" value={point.position.x} onChange={(event)=>updatePointPosition('x',Number(event.target.value))}/></label><label className="recovery-field">Y 坐标<input type="number" value={point.position.y} onChange={(event)=>updatePointPosition('y',Number(event.target.value))}/></label><label className="recovery-field">连接通道节点<select value={point.routeNodeId??''} onChange={(event)=>update({deliveryPoints:scenario.deliveryPoints.map((item)=>item.id===point.id?{...item,routeNodeId:event.target.value||undefined}:item)})}><option value="">未连接 / 待确认</option>{scenario.pathNetwork.nodes.map((node)=><option key={node.id} value={node.id}>{node.name}</option>)}</select></label></>}
    </div></section>
    <section className="section-card"><h3>路径段状态</h3><div className="recovery-grid">{scenario.pathNetwork.segments.map((segment)=><label className="recovery-field" key={segment.id}><span><input type="checkbox" checked={segment.enabled!==false} onChange={(event)=>update({pathNetwork:{...scenario.pathNetwork,segments:scenario.pathNetwork.segments.map((item)=>item.id===segment.id?{...item,enabled:event.target.checked}:item)}})}/> {segment.fromNodeId} → {segment.toNodeId} · {segment.distanceM}m</span></label>)}</div></section>
  </div>;
}
