import { useState } from 'react';
import { useScenarioStore } from '../app/scenarioStore';
import { OperationalLayoutMap } from '../components/OperationalLayoutMap';

export function LayoutAnnotationPage() {
  const scenario = useScenarioStore((state)=>state.scenario);
  const result = useScenarioStore((state)=>state.roughCalculation);
  const update = useScenarioStore((state)=>state.updateLayoutDraft);
  const save = useScenarioStore((state)=>state.saveCurrentDraft);
  const resetToSample = useScenarioStore((state)=>state.resetToSample);
  const persistence = useScenarioStore((state)=>state.persistence);
  const [selectedId,setSelectedId] = useState(scenario.deliveryPoints[0]?.id ?? '');
  const point = scenario.deliveryPoints.find((item)=>item.id===selectedId);
  const onImage = (file?:File) => {
    if(!file) return;
    const reader=new FileReader();
    reader.onload=()=>update({layout:{backgroundDataUrl:String(reader.result),sourceFileName:file.name,sourceType:'image'}});
    reader.readAsDataURL(file);
  };
  return <div className="page-stack">
    <section className="section-card"><p className="eyebrow">T3 FACTORY SCENE</p><h2>工厂场景与 Layout 标注</h2><p>{persistence.message} · revision {persistence.revision}</p>
      <div className="recovery-grid"><label className="recovery-field">导入 Layout 图片<input type="file" accept="image/*" onChange={(event)=>onImage(event.target.files?.[0])}/></label><label className="recovery-field">比例尺 m/px<input type="number" min="0.001" step="0.001" value={scenario.layout.scaleMetersPerPixel} onChange={(event)=>update({layout:{scaleMetersPerPixel:Number(event.target.value)}})}/></label><button type="button" onClick={save}>保存本地草稿</button><button type="button" onClick={()=>{if(window.confirm('恢复演示样板会清除当前浏览器保存的草稿。确定继续吗？')){resetToSample();setSelectedId('DP-A1');}}}>恢复演示样板</button></div>
    </section>
    {scenario.layout.backgroundDataUrl && <img src={scenario.layout.backgroundDataUrl} alt="导入的工厂 Layout" style={{width:'100%',maxHeight:480,objectFit:'contain',background:'#f8fafc',borderRadius:14}}/>}
    <OperationalLayoutMap scenario={scenario} roughCalculation={result} compact />
    <section className="section-card"><h3>配送点人工编辑</h3><div className="recovery-grid"><label className="recovery-field">选择配送点<select value={selectedId} onChange={(event)=>setSelectedId(event.target.value)}>{scenario.deliveryPoints.map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {point && <><label className="recovery-field">X 坐标<input type="number" value={point.position.x} onChange={(event)=>update({deliveryPoints:scenario.deliveryPoints.map((item)=>item.id===point.id?{...item,position:{...item.position,x:Number(event.target.value)}}:item)})}/></label><label className="recovery-field">Y 坐标<input type="number" value={point.position.y} onChange={(event)=>update({deliveryPoints:scenario.deliveryPoints.map((item)=>item.id===point.id?{...item,position:{...item.position,y:Number(event.target.value)}}:item)})}/></label><label className="recovery-field">连接通道节点<select value={point.routeNodeId??''} onChange={(event)=>update({deliveryPoints:scenario.deliveryPoints.map((item)=>item.id===point.id?{...item,routeNodeId:event.target.value||undefined}:item)})}><option value="">未连接 / 待确认</option>{scenario.pathNetwork.nodes.map((node)=><option key={node.id} value={node.id}>{node.name}</option>)}</select></label></>}
    </div></section>
    <section className="section-card"><h3>路径段状态</h3><div className="recovery-grid">{scenario.pathNetwork.segments.map((segment)=><label className="recovery-field" key={segment.id}><span><input type="checkbox" checked={segment.enabled!==false} onChange={(event)=>update({pathNetwork:{...scenario.pathNetwork,segments:scenario.pathNetwork.segments.map((item)=>item.id===segment.id?{...item,enabled:event.target.checked}:item)}})}/> {segment.fromNodeId} → {segment.toNodeId} · {segment.distanceM}m</span></label>)}</div></section>
  </div>;
}
