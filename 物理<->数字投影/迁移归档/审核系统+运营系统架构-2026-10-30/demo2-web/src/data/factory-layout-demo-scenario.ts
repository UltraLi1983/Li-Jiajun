import standardDemoScenario from './standard-demo-scenario.json';
import type { Demo2Scenario, PathNetwork, Point, RouteSegment, StorageArea, StorageAreaType } from '../types/demo2';

// 恢复版示意场景。原始 120×60m Layout 图片和坐标文件尚未找回。
const base = standardDemoScenario as Demo2Scenario;
const scale = base.layout.scaleMetersPerPixel;
const rectangle = (x: number, y: number, width: number, height: number): Point[] => [{x,y},{x:x+width,y},{x:x+width,y:y+height},{x,y:y+height}];
const area = (id: string, name: string, type: StorageAreaType, x: number, y: number, width: number, height: number): StorageArea => ({
  id, name, type, boundary: rectangle(x,y,width,height), calculatedAreaM2: Math.round(width * height * scale * scale * 10) / 10
});
const lineSideAreas: StorageArea[] = ['A', 'B'].flatMap((line, row) => [1, 2, 3, 4].map((index) => {
  const x = 690 + (index - 1) * 95;
  const y = row === 0 ? 350 : 575;
  return area(`sa-ls-${line}${index}`, `LS-${line}${index}`, 'line_side', x, y, 70, 30);
}));
const deliveryPoints = ['A', 'B'].flatMap((line, row) => [1, 2, 3, 4].map((index) => ({
  id: `DP-${line}${index}`, name: `DP-${line}${index} 配送点`, position: { x: 725 + (index-1)*95, y: row === 0 ? 395 : 625 },
  servesProductionStationIds: [`ps-${line.toLowerCase()}${index}`], storageAreaId: `sa-ls-${line}${index}`, routeNodeId: `DP-${line}${index}`
})));
const stations = ['A', 'B'].flatMap((line, row) => [1, 2, 3, 4].map((index) => ({
  id: `ps-${line.toLowerCase()}${index}`, name: `${line}${index} 工站`, productionLineId: `pl-${line.toLowerCase()}`,
  operationStepId: `op-${line.toLowerCase()}${index}`, position: { x: 725 + (index-1)*95, y: row === 0 ? 300 : 525 }, cycleTimeSec: line === 'A' ? 62 : 64
})));
const nodes: PathNetwork['nodes'] = [
  {id:'N0',name:'主仓出库口',position:{x:340,y:395}},
  {id:'N1',name:'中央主通道',position:{x:555,y:395}},
  {id:'N2',name:'A 线通道入口',position:{x:650,y:395}},
  {id:'N3',name:'B 线通道入口',position:{x:650,y:625}},
  ...deliveryPoints.map(point=>({id:point.id,name:`${point.id} 通道接入`,position:point.position}))
];
const nodeById = new Map(nodes.map(node=>[node.id,node]));
const segment = (fromNodeId: string, toNodeId: string, clearWidthM: number): RouteSegment => {
  const from = nodeById.get(fromNodeId)!.position;
  const to = nodeById.get(toNodeId)!.position;
  return {id:`${fromNodeId}-${toNodeId}`,fromNodeId,toNodeId,distanceM:Math.round(Math.hypot(to.x-from.x,to.y-from.y)*scale*10)/10,bidirectional:true,clearWidthM};
};
// 路段沿主通道和线旁支路走；宽度用于 T5 的工具可达性初筛。
const segments = [
  segment('N0','N1',3.8), segment('N1','N2',3.2),
  segment('N2','DP-A1',2.8),segment('DP-A1','DP-A2',2.8),segment('DP-A2','DP-A3',2.8),segment('DP-A3','DP-A4',2.8),
  segment('N2','N3',3.2),segment('N3','DP-B1',2.2),segment('DP-B1','DP-B2',2.2),segment('DP-B2','DP-B3',2.2),segment('DP-B3','DP-B4',2.2)
];
const allocations: Record<string, string[]> = { 'mat-a1':['DP-A1','DP-A2'], 'mat-a2':['DP-A2','DP-A3','DP-A4'], 'mat-b':['DP-B1','DP-B2'], 'mat-c':['DP-B3','DP-B4'] };
export const factoryLayoutDemoScenario: Demo2Scenario = {
  ...base, id:'factory-layout-demo-scenario', name:'汽车座椅骨架工厂恢复样板',
  layout:{...base.layout,layoutId:'layout-seat-frame-recovered',name:'恢复版工厂 Layout（示意）'},
  storageAreas:[
    area('sa-main-warehouse','主仓库','main_warehouse',80,340,260,110),
    area('sa-high-bay','高位货架区','high_bay',80,510,260,130),
    area('sa-supermarket','超市区','supermarket',400,500,155,100),
    ...lineSideAreas,
    area('sa-wip','WIP 暂存区','wip',1090,500,85,120)
  ],
  productionLines:[
    {id:'pl-a',name:'A 线 / 骨架与滑轨分装',boundary:rectangle(680,265,395,65)},
    {id:'pl-b',name:'B 线 / 总成与终检',boundary:rectangle(680,490,395,65)}
  ],
  productionStations:stations, deliveryPoints,
  pathNetwork:{nodes,segments},
  materials:base.materials.map(m=>({...m,assignedDeliveryPointId:m.assignedDeliveryPointId.toUpperCase(),deliveryPointAllocations:allocations[m.id]?.map(deliveryPointId=>({deliveryPointId,share:1}))})),
  transportResources:[
    {id:'tr-agv',name:'AGV 自动搬运车',type:'agv',quantity:2,speedMPerMin:60,huPerTrip:2,loadingTimeMin:2,unloadingTimeMin:2,availabilityRate:0.9,cvFactor:1.15},
    {id:'tr-dolly',name:'Dolly / Tugger',type:'dolly',quantity:1,speedMPerMin:50,huPerTrip:2,loadingTimeMin:3,unloadingTimeMin:3,availabilityRate:0.9,cvFactor:1.15},
    {id:'tr-forklift',name:'叉车',type:'forklift',quantity:1,speedMPerMin:70,huPerTrip:1,loadingTimeMin:4,unloadingTimeMin:4,availabilityRate:0.85,cvFactor:1.25},
    {id:'tr-pallet-jack',name:'地牛',type:'pallet_jack',quantity:1,speedMPerMin:45,huPerTrip:1,loadingTimeMin:4,unloadingTimeMin:4,availabilityRate:0.85,cvFactor:1.2}
  ],
  waterLevels:base.waterLevels.map(w=>({...w,locationId:w.locationId.startsWith('dp-')?w.locationId.toUpperCase():w.locationId})),
  racks:base.racks.map(rack=>({...rack,levels:rack.levels.map(level=>({...level,lanes:level.lanes.map(lane=>({...lane,skuSlots:lane.skuSlots.map(slot=>({...slot,deliveryPointId:slot.deliveryPointId?.startsWith('dp-')?slot.deliveryPointId.toUpperCase():slot.deliveryPointId}))}))}))}))
};
