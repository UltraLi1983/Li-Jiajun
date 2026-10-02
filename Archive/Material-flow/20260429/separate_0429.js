// ================= 全局变量 =================
let layoutNodes = {};
let selectedNode = null;
let draggingNode = null;
let dragOffset = { x: 0, y: 0 };
let simulationResults = null;
let hoveredNode = null;

// 添加全局变量用于存储当前高亮节点
let highlightedNode = null;
let originalNodeColor = {};

// 存储通过点之间的距离和路径缓存
let opDistanceCache = {};
let opPathCache = {}; // 存储通过点之间的最短路径

// 颜色配置
const nodeColors = {
    'Depot': 'rgb(245, 5, 55)',
    'SubLine': 'rgb(218, 218, 218)',
    'FinalLine': 'rgb(198, 198, 198)',
    'OperationPoint': 'rgb(0, 0, 0)',  // 通过点位颜色改为黑色
    'ChargingPoint': 'rgb(0, 176, 240)', // 充电点颜色
    'Grey': 'rgb(242, 242, 242)',       // 新增灰色
    'LightGrey': 'rgb(240, 240, 240)',   // 新增浅灰色
    'White': 'rgb(255, 255, 255)'        // 新增白色
};

const typeNames = {
    'Depot': '仓库',
    'SubLine': '分装线',
    'FinalLine': '总装线',
    'OperationPoint': '通过点位',          // 通过点名称
    'ChargingPoint': '充电点位'           // 新增充电点名称
};

const routeColors = [
    'rgb(245, 5, 55)',      // 红色
    'rgb(218, 218, 218)',   // 浅灰
    'rgb(198, 198, 198)',   // 中灰
    'rgb(178, 178, 178)',   // 深灰
    'rgb(158, 158, 158)',   // 更深灰
    'rgb(138, 138, 138)',   // 最深灰

];

// ================= 初始化 =================
window.addEventListener('load', () => {
    setupCanvasEvents();
    
    // 添加事件监听器到类型选择框
    document.getElementById('editNodeType').addEventListener('change', handleNodeTypeChange);
});

window.addEventListener('resize', () => {
    drawCanvas();
});

function generateDefaultLayout() {
    // 使用 factory_layout_0427.json 中的数据作为默认布局
    const layoutData = {
  "Sub_0_St_0": {
    "id": "Sub_0_0",
    "type": "SubLine",
    "loadTime": 5,
    "x": 11.763485477178428,
    "y": 10.788381742738588
  },
  "Sub_0_St_1": {
    "id": "Sub_0_1",
    "type": "SubLine",
    "loadTime": 5,
    "x": 17.105809128630703,
    "y": 10.757261410788383
  },
  "Sub_0_St_2": {
    "id": "Sub_0_2",
    "type": "SubLine",
    "loadTime": 5,
    "x": 22.0850622406639,
    "y": 10.88174273858921
  },
  "Sub_1_St_0": {
    "id": "Sub_1_0",
    "type": "SubLine",
    "loadTime": 5,
    "x": 11.784232365145229,
    "y": 14.83402489626556
  },
  "Sub_1_St_1": {
    "id": "Sub_1_1",
    "type": "SubLine",
    "loadTime": 5,
    "x": 17.074688796680498,
    "y": 14.854771784232366
  },
  "Sub_1_St_2": {
    "id": "Sub_1_2",
    "type": "SubLine",
    "loadTime": 5,
    "x": 22.105809128630703,
    "y": 14.719917012448132
  },
  "Final_St_0": {
    "id": "Final_0_0",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 30.741207955233648,
    "y": 3.1432176077374705
  },
  "Final_St_1": {
    "id": "Final_0_1",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 30.699571198848357,
    "y": 6.0936309277996425
  },
  "Final_St_2": {
    "id": "Final_0_2",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 30.791640830990712,
    "y": 9.454682664433939
  },
  "Final_St_3": {
    "id": "Final_0_3",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 30.88425069941849,
    "y": 12.620426843796132
  },
  "Final_St_4": {
    "id": "Final_0_4",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 30.933873220747444,
    "y": 16.0178307532991
  },
  "Final_St_5": {
    "id": "Final_0_5",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 34.0811742418728,
    "y": 16.052189206688922
  },
  "Final_St_6": {
    "id": "Final_0_6",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 34.0419801844678,
    "y": 12.618919039237262
  },
  "Final_St_7": {
    "id": "Final_0_7",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 34.01131704201074,
    "y": 9.404141664941397
  },
  "Final_St_8": {
    "id": "Final_0_8",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 33.93516727398747,
    "y": 6.103700768006927
  },
  "Final_St_9": {
    "id": "Final_0_9",
    "type": "FinalLine",
    "loadTime": 3,
    "x": 33.945631136376385,
    "y": 3.206946835897861
  },
  "WH_0": {
    "id": "WH_0",
    "type": "Depot",
    "loadTime": 0,
    "x": 0,
    "y": 0,
    "connectedTo": [
      "Route_0",
      "Route_2",
      "Route_28"
    ]
  },
  "Route_0": {
    "id": "Route_0",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 4.2,
    "y": 0.9,
    "connectedTo": [
      "Route_1",
      "WH_0"
    ]
  },
  "Route_1": {
    "id": "Route_1",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 8.2,
    "y": 1,
    "connectedTo": [
      "Route_0",
      "Route_2"
    ]
  },
  "Route_2": {
    "id": "Route_2",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 11.8,
    "y": 0.8,
    "connectedTo": [
      "Route_1",
      "Route_3"
    ]
  },
  "Route_3": {
    "id": "Route_3",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 15,
    "y": 1,
    "connectedTo": [
      "Route_4",
      "Route_11",
      "Route_2",
      "Route_28"
    ]
  },
  "Route_4": {
    "id": "Route_4",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 18.7,
    "y": 1,
    "connectedTo": [
      "Route_3",
      "Route_5"
    ]
  },
  "Route_5": {
    "id": "Route_5",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 22.9,
    "y": 1,
    "connectedTo": [
      "Route_4",
      "Route_6"
    ]
  },
  "Route_6": {
    "id": "Route_6",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 26.6,
    "y": 1,
    "connectedTo": [
      "Route_28",
      "Route_5",
      "Route_7"
    ]
  },
  "Route_7": {
    "id": "Route_7",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 26.7,
    "y": 5,
    "connectedTo": [
      "Route_25",
      "Route_8",
      "Route_6",
      "Route_28",
      "Route_26"
    ]
  },
  "Route_8": {
    "id": "Route_8",
    "type": "OperationPoint",
    "loadTime": 2,
    "x": 26.7,
    "y": 8.6,
    "connectedTo": [
      "Route_24",
      "Route_9",
      "Route_6",
      "Route_7",
      "Route_18"
    ]
  },
  "Route_9": {
    "id": "Route_9",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 22.5,
    "y": 8.8,
    "connectedTo": [
      "Route_10",
      "Route_8"
    ]
  },
  "Route_10": {
    "id": "Route_10",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 17.1,
    "y": 8.8,
    "connectedTo": [
      "Route_11",
      "Route_9"
    ]
  },
  "Route_11": {
    "id": "Route_11",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 11.9,
    "y": 8.7,
    "connectedTo": [
      "Route_10",
      "Route_12"
    ]
  },
  "Route_12": {
    "id": "Route_12",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 9,
    "y": 11.4,
    "connectedTo": [
      "Route_11",
      "Route_13"
    ]
  },
  "Route_13": {
    "id": "Route_13",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 8.9,
    "y": 15.3,
    "connectedTo": [
      "Route_12",
      "Route_14"
    ]
  },
  "Route_14": {
    "id": "Route_14",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 12,
    "y": 17.7,
    "connectedTo": [
      "Route_13",
      "Route_15"
    ]
  },
  "Route_15": {
    "id": "Route_15",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 17.5,
    "y": 17.8,
    "connectedTo": [
      "Route_14",
      "Route_16"
    ]
  },
  "Route_16": {
    "id": "Route_16",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 22.6,
    "y": 17.8,
    "connectedTo": [
      "Route_15",
      "Route_17"
    ]
  },
  "Route_17": {
    "id": "Route_17",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 26.7,
    "y": 16.6,
    "connectedTo": [
      "Route_16",
      "Route_18",
      "Route_19"
    ]
  },
  "Route_18": {
    "id": "Route_18",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 26.7,
    "y": 13,
    "connectedTo": [
      "Route_17",
      "Route_8"
    ]
  },
  "Route_19": {
    "id": "Route_19",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 28.7,
    "y": 19.2,
    "connectedTo": [
      "Route_17",
      "Route_20"
    ]
  },
  "Route_20": {
    "id": "Route_20",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 32.7,
    "y": 19.1,
    "connectedTo": [
      "Route_19",
      "Route_21"
    ]
  },
  "Route_21": {
    "id": "Route_21",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 35.9,
    "y": 19.1,
    "connectedTo": [
      "Route_20",
      "Route_22"
    ]
  },
  "Route_22": {
    "id": "Route_22",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 37.1,
    "y": 16.3,
    "connectedTo": [
      "Route_21",
      "Route_23"
    ]
  },
  "Route_23": {
    "id": "Route_23",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 37.1,
    "y": 12.8,
    "connectedTo": [
      "Route_22",
      "Route_24"
    ]
  },
  "Route_24": {
    "id": "Route_24",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 37.3,
    "y": 8.9,
    "connectedTo": [
      "Route_23",
      "Route_25"
    ]
  },
  "Route_25": {
    "id": "Route_25",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 37.2,
    "y": 5.2,
    "connectedTo": [
      "Route_24",
      "Route_26"
    ]
  },
  "Route_26": {
    "id": "Route_26",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 36.7,
    "y": 2.4,
    "connectedTo": [
      "Route_25",
      "Route_27"
    ]
  },
  "Route_27": {
    "id": "Route_27",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 34.1,
    "y": 0.8,
    "connectedTo": [
      "Route_26",
      "Route_28"
    ]
  },
  "Route_28": {
    "id": "Route_28",
    "type": "OperationPoint",
    "loadTime": 0,
    "x": 30.6,
    "y": 0.7,
    "connectedTo": [
      "Route_27",
      "Route_6"
    ]
  }
    };
    
    // 重新构建 layoutNodes，使用节点的 id 属性作为键
    layoutNodes = {};
    for (const key in layoutData) {
        const node = layoutData[key];
        layoutNodes[node.id] = node;
    }

    drawCanvas();
    updateLegend();
}

// 为所有通过点和仓库自动初始化连接（只保留最近的4个点）
function initDefaultOpConnections() {
    const ops = Object.values(layoutNodes).filter(n => n.type === 'OperationPoint');
    const depots = Object.values(layoutNodes).filter(n => n.type === 'Depot');
    
    if (ops.length < 1) return;
    
    // 先清空所有现有连接
    for (const op of ops) {
        op.connectedTo = [];
    }
    for (const depot of depots) {
        depot.connectedTo = [];
    }
    
    // 为通过点之间建立连接
    for (const n1 of ops) {
        // 计算与其他所有通过点的距离
        const distances = [];
        for (const n2 of ops) {
            if (n2.id === n1.id) continue;
            const vx = n2.x - n1.x;
            const vy = n2.y - n1.y;
            const len = Math.sqrt(vx*vx + vy*vy);
            if (len > 0) {
                distances.push({ id: n2.id, distance: len });
            }
        }
        
        // 按距离排序
        distances.sort((a, b) => a.distance - b.distance);
        
        // 只保留最近的4个点
        const closestNeighbors = distances.slice(0, 4);
        
        // 添加连接
        for (const neighbor of closestNeighbors) {
            if (!n1.connectedTo.includes(neighbor.id)) {
                n1.connectedTo.push(neighbor.id);
                // 双向连接
                const neighborNode = layoutNodes[neighbor.id];
                if (neighborNode && !neighborNode.connectedTo.includes(n1.id)) {
                    neighborNode.connectedTo.push(n1.id);
                }
            }
        }
    }
    
    // 为仓库与通过点建立连接
    for (const depot of depots) {
        // 计算与所有通过点的距离
        const distances = [];
        for (const op of ops) {
            const vx = op.x - depot.x;
            const vy = op.y - depot.y;
            const len = Math.sqrt(vx*vx + vy*vy);
            if (len > 0) {
                distances.push({ id: op.id, distance: len });
            }
        }
        
        // 按距离排序
        distances.sort((a, b) => a.distance - b.distance);
        
        // 只保留最近的4个通过点
        const closestOps = distances.slice(0, 4);
        
        // 添加连接
        for (const op of closestOps) {
            if (!depot.connectedTo.includes(op.id)) {
                depot.connectedTo.push(op.id);
                // 双向连接
                const opNode = layoutNodes[op.id];
                if (opNode && !opNode.connectedTo.includes(depot.id)) {
                    opNode.connectedTo.push(depot.id);
                }
            }
        }
    }
}

// ================= Canvas 绘制 =================
function drawCanvas() {
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const width = canvas.width;
    const height = canvas.height;

    // 清空画布
    ctx.clearRect(0, 0, width, height);
    
    // 绘制背景网格
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    // 修改网格间距从30像素（对应2个单位）到15像素（对应1个单位）
    for (let x = 0; x < width; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y < height; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    if (Object.keys(layoutNodes).length === 0) return;

    const allNodes = Object.values(layoutNodes);
    const maxX = Math.max(...allNodes.map(n => n.x)) + 5;
    const maxY = Math.max(...allNodes.map(n => n.y)) + 5;

    const padding = 60;
    const scaleX = (canvas.width - 2 * padding) / (maxX || 1);
    const scaleY = (canvas.height - 2 * padding) / (maxY || 1);
    const scale = Math.min(scaleX, scaleY);

    function toCanvas(x, y) {
        return {
            x: padding + x * scale,
            y: padding + y * scale
        };
    }

    // 绘制负坐标区域的背景色
    // 左侧负X区域
    if(maxX > 0) {
        const negativeXArea = toCanvas(0, 0);
        ctx.fillStyle = 'rgba(240, 248, 255, 0.3)'; // 淡蓝色
        ctx.fillRect(0, 0, negativeXArea.x, height);
        
        // 绘制左侧虚线网格
        ctx.strokeStyle = 'rgba(173, 216, 230, 0.5)';
        ctx.setLineDash([5, 5]);
        // 修改虚线网格间距从30像素（对应2个单位）到15像素（对应1个单位）
        for (let x = negativeXArea.x; x >= 0; x -= 15) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }
    
    // 上侧负Y区域
    if(maxY > 0) {
        const negativeYArea = toCanvas(0, 0);
        ctx.fillStyle = 'rgba(245, 245, 220, 0.3)'; // 淡黄色
        ctx.fillRect(0, 0, width, negativeYArea.y);
        
        // 绘制上侧虚线网格
        ctx.strokeStyle = 'rgba(255, 255, 220, 0.5)';
        ctx.setLineDash([5, 5]);
        // 修改虚线网格间距从30像素（对应2个单位）到15像素（对应1个单位）
        for (let y = negativeYArea.y; y >= 0; y -= 15) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // 绘制配送路线
    if (simulationResults && simulationResults.routes) {
        simulationResults.routes.forEach((route, routeIdx) => {
            // 检查是否需要绘制当前线路
            if (selectedRouteIndex !== 'all' && parseInt(selectedRouteIndex) !== routeIdx) {
                return;
            }
            
            const color = routeColors[routeIdx % routeColors.length];
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 5]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // 确保路线从仓库开始和结束
            const fullRoute = [...route.route];
            if(fullRoute[0] !== 'WH_0' && fullRoute[0] !== 'Depot') {
                fullRoute.unshift('WH_0');
            }
            if(fullRoute[fullRoute.length - 1] !== 'WH_0' && fullRoute[fullRoute.length - 1] !== 'Depot') {
                fullRoute.push('WH_0');
            }

            // 插入必须经过的操作点
            const processedRoute = insertMandatoryPoints(fullRoute, routeIdx);

            ctx.beginPath();
            for (let i = 0; i < processedRoute.length; i++) {
                const node = layoutNodes[processedRoute[i]];
                if (!node) continue;
                const pos = toCanvas(node.x, node.y);
                if (i === 0) {
                    ctx.moveTo(pos.x, pos.y);
                } else {
                    ctx.lineTo(pos.x, pos.y);
                }
            }
            ctx.stroke();
            ctx.setLineDash([]);

            // 绘制路线箭头
            if (processedRoute.length > 1) {
                const lastNode = layoutNodes[processedRoute[processedRoute.length - 2]];
                const secondLast = layoutNodes[processedRoute[processedRoute.length - 1]];
                if (lastNode && secondLast) {
                    const p1 = toCanvas(lastNode.x, lastNode.y);
                    const p2 = toCanvas(secondLast.x, secondLast.y);
                    drawArrow(ctx, p1.x, p1.y, p2.x, p2.y, color);
                }
            }
        });
        }

    // 绘制所有轨道连线（包括仓库、通过点等所有连接关系）
    const allNodesWithConnections = Object.values(layoutNodes).filter(n => n.connectedTo && n.connectedTo.length > 0);
    if (allNodesWithConnections.length > 0) {
        ctx.strokeStyle = '#aaa';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        
        // 使用集合来避免重复绘制
        const drawnConnections = new Set();
        
        for (const node of allNodesWithConnections) {
            const connectedTo = node.connectedTo || [];
            const pos = toCanvas(node.x, node.y);
            
            for (const targetId of connectedTo) {
                const target = layoutNodes[targetId];
                if (!target) continue;
                
                // 创建唯一的连接标识符，避免重复绘制
                const connectionKey = [node.id, targetId].sort().join('->');
                
                if (!drawnConnections.has(connectionKey)) {
                    drawnConnections.add(connectionKey);
                    
                    const targetPos = toCanvas(target.x, target.y);
                    
                    // 根据连接类型设置不同的线条样式
                    if (node.type === 'OperationPoint' && target.type === 'OperationPoint') {
                        ctx.strokeStyle = '#666'; // 通过点之间的连接
                    } else if (node.type === 'Depot' || target.type === 'Depot') {
                        ctx.strokeStyle = '#e74c3c'; // 仓库相关的连接
                    } else {
                        ctx.strokeStyle = '#aaa'; // 其他连接
                    }
                    
                    ctx.beginPath();
                    ctx.moveTo(pos.x, pos.y);
                    ctx.lineTo(targetPos.x, targetPos.y);
                    ctx.stroke();
                }
            }
        }
    }

    // 绘制工站点
    allNodes.forEach(node => {
        const pos = toCanvas(node.x, node.y);
        const isSelected = selectedNode && selectedNode.id === node.id;
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isHighlighted = highlightedNode && highlightedNode === node.id; // 检查是否高亮
        const baseRadius = isHovered ? 12 : 8;  // 减小基础半径
        const radius = isSelected ? 14 : (isHighlighted ? 16 : baseRadius); // 高亮时半径更大

        // 外发光效果（对于选中、悬停或高亮的节点）
        if (isSelected || isHovered || isHighlighted) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius + 6, 0, 2 * Math.PI);  // 相应减小发光范围
            // 为高亮节点使用不同的发光颜色
            ctx.fillStyle = isHighlighted ? 'rgba(255, 215, 0, 0.5)' : 'rgba(255, 215, 0, 0.3)';
            ctx.fill();
        }

        // 主圆
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, 2 * Math.PI);
        ctx.fillStyle = nodeColors[node.type];
        ctx.fill();

        // 边框
        ctx.strokeStyle = isSelected ? '#FFD700' : (isHighlighted ? '#FFA500' : '#333'); // 高亮节点边框为橙色
        ctx.lineWidth = isSelected ? 3 : (isHighlighted ? 2 : 1); // 高亮节点边框更粗
        ctx.stroke();

        // 内圆高亮
        ctx.beginPath();
        ctx.arc(pos.x - 2, pos.y - 2, radius * 0.4, 0, 2 * Math.PI);  // 相应减小内圆
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        // 标签
        ctx.fillStyle = '#333';
        ctx.font = 'bold 9px Microsoft YaHei';  // 减小字体大小
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        let label = node.id;
        if (node.type === 'Depot') {
            label = '🏭 仓库';
        } else if (node.type === 'SubLine') {
            // 提取Sub_x_y格式中的x和y
            const match = node.id.match(/Sub_(\d+)_(\d+)/);
            if (match) {
                label = `分${match[1]}-${match[2]}`;
            } else {
                label = '分装';
            }
        } else if (node.type === 'FinalLine') {
            // 提取Final_x_y格式中的x和y
            const match = node.id.match(/Final_(\d+)_(\d+)/);
            if (match) {
                label = `总${match[1]}-${match[2]}`;
            } else {
                label = '总装';
            }
        } else if (node.type === 'OperationPoint') {
            label = '🔍 通过';
        } else if (node.type === 'ChargingPoint') {
            label = '🔋 充电';
        }

        // 标签背景
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(pos.x - textWidth / 2 - 2, pos.y + radius + 2, textWidth + 4, 12);

        ctx.fillStyle = '#333';
        ctx.fillText(label, pos.x, pos.y + radius + 3);

        // 显示装载时间（仓库和通过点不显示）
        if (node.type !== 'Depot' && node.type !== 'OperationPoint') {
            if (node.loadTime > 0 || node.type === 'ChargingPoint') {
                ctx.font = '9px Arial';
                ctx.fillStyle = '#666';
                ctx.fillText(`${node.loadTime}min`, pos.x, pos.y + radius + 15);
            }
        }
    });
    
    // 绘制AGV
    drawAGVs(ctx);
}

function drawArrow(ctx, fromX, fromY, toX, toY, color) {
    const headLength = 12;
    const angle = Math.atan2(toY - fromY, toX - fromX);
    
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(toX, toY);
    ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.stroke();
}

function updateLegend() {
    const legend = document.getElementById('legend');
    let html = `
        <div class="legend-item">
            <div class="legend-color" style="background: ${nodeColors.Depot};"></div>
            <span>仓库</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: ${nodeColors.SubLine};"></div>
            <span>分装线</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: ${nodeColors.FinalLine};"></div>
            <span>总装线</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: ${nodeColors.OperationPoint};"></div>
            <span>通过点位</span>
        </div>
        <div class="legend-item">
            <div class="legend-color" style="background: ${nodeColors.ChargingPoint};"></div>
            <span>充电点位</span>
        </div>
        <div class="legend-item">
            <div style="width: 20px; height: 2px; background: #666; margin: 9px 5px;"></div>
            <span>通过点之间连接</span>
        </div>
        <div class="legend-item">
            <div style="width: 20px; height: 2px; background: #e74c3c; margin: 9px 5px;"></div>
            <span>仓库相关连接</span>
        </div>
    `;

    if (simulationResults && simulationResults.routes) {
        simulationResults.routes.forEach((route, idx) => {
            html += `
                <div class="legend-item">
                    <div class="legend-color" style="background: ${routeColors[idx % routeColors.length]};"></div>
                    <span>车辆 ${idx + 1}</span>
                </div>
            `;
        });
    }

    legend.innerHTML = html;
}

// ================= Canvas 交互 =================
function setupCanvasEvents() {
    const canvas = document.getElementById('mainCanvas');

    function getMousePos(e) {
        const rect = canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }

    function toWorld(canvasX, canvasY) {
        const allNodes = Object.values(layoutNodes);
        const maxX = Math.max(...allNodes.map(n => n.x)) + 5;
        const maxY = Math.max(...allNodes.map(n => n.y)) + 5;
        const padding = 60;
        const scaleX = (canvas.width - 2 * padding) / (maxX || 1);
        const scaleY = (canvas.height - 2 * padding) / (maxY || 1);
        const scale = Math.min(scaleX, scaleY);

        return {
            x: (canvasX - padding) / scale,
            y: (canvasY - padding) / scale
        };
    }

    function findNodeAt(canvasX, canvasY) {
        const allNodes = Object.values(layoutNodes);
        const maxX = Math.max(...allNodes.map(n => n.x)) + 5;
        const maxY = Math.max(...allNodes.map(n => n.y)) + 5;
        const padding = 60;
        const scaleX = (canvas.width - 2 * padding) / (maxX || 1);
        const scaleY = (canvas.height - 2 * padding) / (maxY || 1);
        const scale = Math.min(scaleX, scaleY);

        function toCanvas(x, y) {
            return {
                x: padding + x * scale,
                y: padding + y * scale
            };
        }

        for (const node of allNodes) {
            const pos = toCanvas(node.x, node.y);
            const dist = Math.sqrt(Math.pow(canvasX - pos.x, 2) + Math.pow(canvasY - pos.y, 2));
            if (dist <= 14) {  // 相应减小检测半径
                return node;
            }
        }
        return null;
    }

    // 鼠标按下
    canvas.addEventListener('mousedown', (e) => {
        const pos = getMousePos(e);
        const node = findNodeAt(pos.x, pos.y);
        
        if (node) {
            draggingNode = node;
            const worldPos = toWorld(pos.x, pos.y);
            dragOffset = { x: node.x - worldPos.x, y: node.y - worldPos.y };
        }
    });

    // 鼠标移动
    canvas.addEventListener('mousemove', (e) => {
        const pos = getMousePos(e);

        // 显示鼠标坐标
        const worldPos = toWorld(pos.x, pos.y);
        const coordTooltip = document.getElementById('coordTooltip');
        if (coordTooltip) {
            coordTooltip.textContent = `坐标: (${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)})`;
            coordTooltip.style.left = (e.pageX + 15) + 'px';
            coordTooltip.style.top = (e.pageY - 50) + 'px'; // 放在鼠标上方
            coordTooltip.style.opacity = '1';
        }

        if (draggingNode) {
            const worldPos = toWorld(pos.x, pos.y);
            draggingNode.x = Math.max(0, worldPos.x + dragOffset.x);
            draggingNode.y = Math.max(0, worldPos.y + dragOffset.y);
            
            if (selectedNode && selectedNode.id === draggingNode.id) {
                document.getElementById('editNodeX').value = draggingNode.x.toFixed(1);
                document.getElementById('editNodeY').value = draggingNode.y.toFixed(1);
            }
            
            drawCanvas();
        } else {
            const node = findNodeAt(pos.x, pos.y);
            if (node !== hoveredNode) {
                hoveredNode = node;
                canvas.style.cursor = node ? 'pointer' : 'crosshair';
                drawCanvas();
                
                // 显示提示
                const tooltip = document.getElementById('tooltip');
                if (node) {
                    let displayName = node.id;
                    if (node.type === 'Depot') {
                        displayName = '仓库';
                    } else if (node.type === 'SubLine') {
                        const match = node.id.match(/Sub_(\d+)_(\d+)/);
                        if (match) {
                            displayName = `分装线 ${match[1]}-${match[2]}`;
                        }
                    } else if (node.type === 'FinalLine') {
                        const match = node.id.match(/Final_(\d+)_(\d+)/);
                        if (match) {
                            displayName = `总装线 ${match[1]}-${match[2]}`;
                        }
                    } else if (node.type === 'OperationPoint') {
                        displayName = '通过点';
                    } else if (node.type === 'ChargingPoint') {
                        displayName = '充电点';
                    }
                    
                    tooltip.innerHTML = `
                        <strong>${displayName}</strong><br>
                        ID: ${node.id}<br>
                        类型: ${typeNames[node.type]}<br>
                        坐标: (${node.x.toFixed(1)}, ${node.y.toFixed(1)})<br>
                        装载时间: ${node.loadTime}分钟
                    `;
                    tooltip.style.opacity = '1';
                    tooltip.style.left = (e.pageX + 15) + 'px';
                    tooltip.style.top = (e.pageY - 30) + 'px';
                } else {
                    tooltip.style.opacity = '0';
                }
            } else if (node) {
                const tooltip = document.getElementById('tooltip');
                tooltip.style.left = (e.pageX + 15) + 'px';
                tooltip.style.top = (e.pageY - 30) + 'px';
            }
        }
    });

    // 鼠标释放
    canvas.addEventListener('mouseup', () => {
        draggingNode = null;
    });

    // 鼠标离开
    canvas.addEventListener('mouseleave', () => {
        hoveredNode = null;
        draggingNode = null;
        document.getElementById('tooltip').style.opacity = '0';
        // 隐藏坐标提示
        const coordTooltip = document.getElementById('coordTooltip');
        if (coordTooltip) {
            coordTooltip.style.opacity = '0';
        }
        drawCanvas();
    });

    // 双击编辑
    canvas.addEventListener('dblclick', (e) => {
        const pos = getMousePos(e);
        const node = findNodeAt(pos.x, pos.y);
        
        if (node) {
            openNodeEditor(node);
        }
    });
    
    // 点击画布时高亮节点
    canvas.addEventListener('click', (e) => {
        const pos = getMousePos(e);
        const node = findNodeAt(pos.x, pos.y);
        
        if (node) {
            highlightedNode = node.id;
            drawCanvas();
            // 高亮面板中的对应节点
            highlightNodeInPanel(node.id);
        }
    });
}

// ================= 点位编辑 =================
function openNodeEditor(node) {
    selectedNode = node;
    
    document.getElementById('nodeEditor').classList.add('active');
    document.getElementById('noSelection').style.display = 'none';
    
    document.getElementById('editorTitle').textContent = `编辑工站: ${node.id}`;
    document.getElementById('editorInfo').textContent = `当前类型: ${typeNames[node.type]}`;
    document.getElementById('editNodeType').value = node.type;
    document.getElementById('editNodeId').value = node.id;
    document.getElementById('editNodeX').value = node.x.toFixed(1);
    document.getElementById('editNodeY').value = node.y.toFixed(1);
    document.getElementById('editNodeLoadTime').value = node.loadTime;
    
    // 根据类型显示/隐藏装载时间输入
    const loadTimeContainer = document.getElementById('loadTimeContainer');
    if (node.type === 'OperationPoint' || node.type === 'Depot') {
        loadTimeContainer.style.display = 'none';
    } else {
        loadTimeContainer.style.display = 'flex';
    }
    
    // 根据类型显示/隐藏连接选择
    const connectionsContainer = document.getElementById('connectionsContainer');
    if (node.type === 'OperationPoint' || node.type === 'Depot') {
        connectionsContainer.style.display = 'flex';
        updateConnectionsCheckboxes(node);
    } else {
        connectionsContainer.style.display = 'none';
    }
    
    // 添加事件监听器到类型选择框
    document.getElementById('editNodeType').addEventListener('change', handleNodeTypeChange);
    
    drawCanvas();
}

// 更新连接选择框中的选项
function updateConnectionsCheckboxes(node) {
    const container = document.getElementById('connectionsCheckboxGroup');
    container.innerHTML = '';
    
    // 获取所有通过点（不包括自身）
    const allOps = Object.values(layoutNodes).filter(n => 
        n.type === 'OperationPoint' && n.id !== node.id
    );
    
    // 按数字排序
    allOps.sort((a, b) => {
        const numA = parseInt(a.id.replace('Route_', ''));
        const numB = parseInt(b.id.replace('Route_', ''));
        return numA - numB;
    });
    
    // 获取当前已选择的连接
    const connectedTo = node.connectedTo || [];
    
    for (const op of allOps) {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = op.id;
        checkbox.checked = connectedTo.includes(op.id);
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(op.id));
        container.appendChild(label);
    }
}

// 处理节点类型变更的函数
function handleNodeTypeChange() {
    if (!selectedNode) return;
    
    const newType = document.getElementById('editNodeType').value;
    const currentId = document.getElementById('editNodeId').value;
    
    // 如果当前ID不符合新类型的要求，自动生成新ID
    if (!validateIdFormat(newType, currentId)) {
        const newId = getNextAvailableId(newType);
        document.getElementById('editNodeId').value = newId;
    }
    
    // 根据新类型更新装载时间容器的显示
    const loadTimeContainer = document.getElementById('loadTimeContainer');
    if (newType === 'OperationPoint' || newType === 'Depot') {
        loadTimeContainer.style.display = 'none';
    } else {
        loadTimeContainer.style.display = 'flex';
    }
    
    // 根据新类型更新连接选择容器的显示
    const connectionsContainer = document.getElementById('connectionsContainer');
    if (newType === 'OperationPoint' || newType === 'Depot') {
        connectionsContainer.style.display = 'flex';
        updateConnectionsCheckboxes(selectedNode);
    } else {
        connectionsContainer.style.display = 'none';
    }
}

function applyNodeEdit() {
    if (!selectedNode) return;
    
    const newType = document.getElementById('editNodeType').value;
    const newId = document.getElementById('editNodeId').value;
    
    // 检查ID是否重复
    if (newId !== selectedNode.id && layoutNodes[newId]) {
        alert('❌ 工站ID已存在！');
        return;
    }
    
    // 根据类型验证ID格式
    if (!validateIdFormat(newType, newId)) {
        alert('❌ 工站ID格式不正确！');
        return;
    }
    
        // 更新节点
    const oldId = selectedNode.id;
    selectedNode.type = newType;
    selectedNode.id = newId;
    layoutNodes[newId] = {...selectedNode};
    if (newId !== oldId) {
        delete layoutNodes[oldId]; // 删除旧ID
    }
    selectedNode = layoutNodes[newId]; // 更新引用
    
    selectedNode.x = parseFloat(document.getElementById('editNodeX').value);
    selectedNode.y = parseFloat(document.getElementById('editNodeY').value);
    
    // 充电点、通过点和仓库的装载时间始终为0，其他类型按输入值
    if (selectedNode.type === 'ChargingPoint' || selectedNode.type === 'OperationPoint' || selectedNode.type === 'Depot') {
        selectedNode.loadTime = 0;
    } else {
        selectedNode.loadTime = parseInt(document.getElementById('editNodeLoadTime').value);
    }
    
    // 保存连接选择（通过点和仓库有效）
    if (selectedNode.type === 'OperationPoint' || selectedNode.type === 'Depot') {
        const checkedBoxes = document.querySelectorAll('#connectionsCheckboxGroup input[type="checkbox"]:checked');
        selectedNode.connectedTo = Array.from(checkedBoxes).map(cb => cb.value);
        
        // 保证双向连接对称：在被连接的节点中也加上当前节点
        for (const targetId of selectedNode.connectedTo) {
            const targetNode = layoutNodes[targetId];
            if (targetNode && targetNode.type === 'OperationPoint') {
                if (!targetNode.connectedTo) targetNode.connectedTo = [];
                if (!targetNode.connectedTo.includes(selectedNode.id)) {
                    targetNode.connectedTo.push(selectedNode.id);
                }
            }
        }
    }
    
    document.getElementById('editorInfo').textContent = `当前类型: ${typeNames[selectedNode.type]}`;
    
    drawCanvas();
    updateLegend();
    
    // 清除模拟结果，需要重新运行
    simulationResults = null;
    document.getElementById('statsPanel').style.display = 'none';
    
    alert('✅ 修改已应用！');
}

// 验证ID格式的函数
function validateIdFormat(type, id) {
    switch (type) {
        case 'Depot':
            return /^WH_\d+$/.test(id);
        case 'OperationPoint':
            return /^Route_\d+$/.test(id);
        case 'SubLine':
            return /^Sub_\d+_\d+$/.test(id);
        case 'FinalLine':
            return /^Final_\d+_\d+$/.test(id);
        case 'ChargingPoint':
            return /^Charging_\d+$/.test(id);
        default:
            return false;
    }
}

// 获取下一个可用ID的函数
function getNextAvailableId(type) {
    // 获取当前所有相同类型的节点ID
    const existingIds = Object.values(layoutNodes)
        .filter(node => node.type === type)
        .map(node => node.id);

    switch (type) {
        case 'Depot':
            // 查找是否存在仓库，如果没有则使用WH_0
            const depotExists = Object.values(layoutNodes).some(node => node.type === 'Depot');
            if (!depotExists) {
                return 'WH_0';
            } else {
                // 如果已经有仓库，返回现有的仓库ID
                return Object.values(layoutNodes).find(node => node.type === 'Depot').id;
            }
        case 'OperationPoint':
            let opCounter = 0;
            // 检查 Route_opCounter 是否已存在，如果存在则递增
            while (existingIds.some(id => id === `Route_${opCounter}`)) {
                opCounter++;
            }
            return `Route_${opCounter}`;
        case 'SubLine':
            let subCounter1 = 0;
            let subCounter2 = 0;
            let newSubId = `Sub_${subCounter1}_${subCounter2}`;
            
            // 找到第一个未使用的Sub_x_y格式ID
            while (existingIds.some(id => id === newSubId)) {
                subCounter2++;
                if (subCounter2 > 100) { // 防止无限循环
                    subCounter1++;
                    subCounter2 = 0;
                }
                newSubId = `Sub_${subCounter1}_${subCounter2}`;
            }
            return newSubId;
        case 'FinalLine':
            let finalCounter1 = 0;
            let finalCounter2 = 0;
            let newFinalId = `Final_${finalCounter1}_${finalCounter2}`;
            
            // 找到第一个未使用的Final_x_y格式ID
            while (existingIds.some(id => id === newFinalId)) {
                finalCounter2++;
                if (finalCounter2 > 100) { // 防止无限循环
                    finalCounter1++;
                    finalCounter2 = 0;
                }
                newFinalId = `Final_${finalCounter1}_${finalCounter2}`;
            }
            return newFinalId;
        case 'ChargingPoint':
            let chgCounter = 0;
            while (existingIds.some(id => id === `Charging_${chgCounter}`)) {
                chgCounter++;
            }
            return `Charging_${chgCounter}`;
        default:
            return '';
    }
}

function cancelNodeEdit() {
    selectedNode = null;
    document.getElementById('nodeEditor').classList.remove('active');
    document.getElementById('noSelection').style.display = 'block';
    drawCanvas();
}

function deleteSelectedNode() {
    if (!selectedNode) return;
    
    if (selectedNode.id === 'WH_0' || selectedNode.id === 'Depot') {
        alert('❌ 不能删除仓库！');
        return;
    }
    
    if (confirm(`确定要删除工站 "${selectedNode.id}" 吗？`)) {
        delete layoutNodes[selectedNode.id];
        selectedNode = null;
        document.getElementById('nodeEditor').classList.remove('active');
        document.getElementById('noSelection').style.display = 'block';
        drawCanvas();
        updateLegend();
        simulationResults = null;
        document.getElementById('statsPanel').style.display = 'none';
    }
}

function addNewNode() {
    // 创建模态窗口让用户选择类型和序号
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modalOverlay');
    
    // 获取所有现有节点ID，用于后续检查
    const existingIds = Object.keys(layoutNodes);
    
    // 生成每种类型的可用ID
    const availableDepotId = getNextAvailableId('Depot');
    const availableOpIds = getNextAvailableId('OperationPoint');
    const availableSubIds = getNextAvailableId('SubLine');
    const availableFinalIds = getNextAvailableId('FinalLine');
    const availableChargingIds = getNextAvailableId('ChargingPoint');
    
    // 生成选项列表
    const options = [];
    
    // 为每种类型生成一些可用的ID选项
    options.push({type: 'SubLine', id: availableSubIds});
    // 生成额外的SubLine选项
    const subParts = availableSubIds.match(/Sub_(\d+)_(\d+)/);
    if(subParts) {
        const [_, x, y] = subParts;
        // 生成几个额外的选项
        for(let i = 0; i < 5; i++) {
            const nextY = parseInt(y) + i;
            const testId = `Sub_${x}_${nextY}`;
            if(!existingIds.includes(testId)) {
                options.push({type: 'SubLine', id: testId});
                break;
            }
        }
        for(let i = 1; i <= 3; i++) {
            const nextX = parseInt(x) + i;
            const testId = `Sub_${nextX}_${y}`;
            if(!existingIds.includes(testId)) {
                options.push({type: 'SubLine', id: testId});
                break;
            }
        }
    }
    
    options.push({type: 'FinalLine', id: availableFinalIds});
    // 生成额外的FinalLine选项
    const finalParts = availableFinalIds.match(/Final_(\d+)_(\d+)/);
    if(finalParts) {
        const [_, x, y] = finalParts;
        for(let i = 0; i < 5; i++) {
            const nextY = parseInt(y) + i;
            const testId = `Final_${x}_${nextY}`;
            if(!existingIds.includes(testId)) {
                options.push({type: 'FinalLine', id: testId});
                break;
            }
        }
        for(let i = 1; i <= 3; i++) {
            const nextX = parseInt(x) + i;
            const testId = `Final_${nextX}_${y}`;
            if(!existingIds.includes(testId)) {
                options.push({type: 'FinalLine', id: testId});
                break;
            }
        }
    }
    
    options.push({type: 'OperationPoint', id: availableOpIds});
    options.push({type: 'ChargingPoint', id: availableChargingIds});
    
    // 创建HTML内容
    let optionsHtml = '';
    options.forEach(option => {
        optionsHtml += `<option value="${option.id}|${option.type}">${typeNames[option.type]} - ${option.id}</option>`;
    });
    
    modal.innerHTML = `
        <div class="modal-content">
            <h3>➕ 添加新工站</h3>
            <div class="modal-form">
                <label for="newNodeTypeSelect">选择工站类型和ID:</label>
                <select id="newNodeTypeSelect" style="width: 100%; padding: 8px; margin: 10px 0;">
                    <option value="">-- 请选择 --</option>
                    ${optionsHtml}
                </select>
                <div style="margin-top: 20px; display: flex; justify-content: space-between;">
                    <button class="btn btn-primary" onclick="confirmAddNewNode()">添加</button>
                    <button class="btn btn-secondary" onclick="closeModal()">取消</button>
                </div>
            </div>
        </div>
    `;
    
    overlay.style.display = 'flex';
}

function confirmAddNewNode() {
    const selection = document.getElementById('newNodeTypeSelect').value;
    if (!selection) {
        alert('❌ 请选择工站类型和ID！');
        return;
    }
    
    const [id, type] = selection.split('|');
    
    // 检查ID是否已在当前布局中存在
    if (layoutNodes[id]) {
        alert(`❌ 工站ID ${id} 已存在！请重新选择。`);
        return;
    }
    
        layoutNodes[id] = {
        id: id,
        type: type,
        loadTime: type === 'ChargingPoint' ? 0 : (type === 'OperationPoint' ? 0 : (type === 'SubLine' ? 5 : 3)),
        x: 10 + Math.random() * 20,
        y: 10 + Math.random() * 20
    };
    
    // 如果新增的是通过点，自动初始化所有通过点的连接
    if (type === 'OperationPoint') {
        initDefaultOpConnections();
    }
    
    drawCanvas();
    updateLegend();
    simulationResults = null;
    document.getElementById('statsPanel').style.display = 'none';
    
    closeModal();
    alert(`✅ 工站 ${id} 已成功添加！`);
}

function resetLayout() {
    if (confirm('确定要重置为默认布局吗？当前修改将丢失。')) {
        // 生成使用新ID格式的默认布局
        generateDefaultLayout();
        
        // 清除选中状态
        selectedNode = null;
        document.getElementById('nodeEditor').classList.remove('active');
        document.getElementById('noSelection').style.display = 'block';
        
        // 清除高亮状态
        highlightedNode = null;
        
        // 清除模拟结果
        simulationResults = null;
        document.getElementById('statsPanel').style.display = 'none';
        
        // 重新绘制画布以反映重置后的状态
        drawCanvas();
    }
}

// ================= 导入/导出 =================
function importLayout(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    if (fileName.endsWith('.json')) {
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // 验证导入的数据是否符合ID格式要求
                let isValid = true;
                let invalidItems = [];
                
                if (Array.isArray(data)) {
                    for (const item of data) {
                        if (!validateIdFormat(item.type, item.id)) {
                            isValid = false;
                            invalidItems.push(item.id);
                        }
                    }
                    
                    if (isValid) {
                        layoutNodes = {};
                        data.forEach(item => {
                            layoutNodes[item.id] = item;
                        });
                    }
                } else {
                    for (const key in data) {
                        const node = data[key];
                        if (!validateIdFormat(node.type, node.id)) {
                            isValid = false;
                            invalidItems.push(node.id);
                        }
                    }
                    
                    if (isValid) {
                        // 重新构建 layoutNodes，使用节点的 id 属性作为键
                        layoutNodes = {};
                        for (const key in data) {
                            const node = data[key];
                            layoutNodes[node.id] = node;
                        }
                    }
                }
                
                if (!isValid) {
                    alert(`❌ 导入失败：以下节点ID格式不符合要求：${invalidItems.join(', ')}`);
                    return;
                }

                // JSON导入：保持原有的点位关系，不自动初始化连接
                console.log('JSON布局导入成功，保持原有连接关系');

                drawCanvas();
                updateLegend();
                simulationResults = null;
                document.getElementById('statsPanel').style.display = 'none';
                alert('✅ JSON布局导入成功！\n\n📋 导入说明：\n• 保持原有的点位连接关系\n• 如需修改连接，请双击通过点进行编辑');
            } catch (error) {
                alert('❌ 导入失败：' + error.message);
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.csv')) {
        reader.onload = (e) => {
            try {
                const lines = e.target.result.split('\n');
                
                // 验证表头
                const headers = lines[0].trim().split(',');
                if (headers.length < 5 || 
                    !headers.includes('工站ID') || 
                    !headers.includes('类型') || 
                    !headers.includes('X坐标') || 
                    !headers.includes('Y坐标') || 
                    !headers.includes('装载时间')) {
                    alert('❌ CSV文件格式不正确！');
                    return;
                }
                
                layoutNodes = {};
                
                // 跳过表头
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const parts = line.split(',');
                    if (parts.length >= 5) {
                        const id = parts[0].trim();
                        const type = parts[1].trim();
                        
                        // 验证ID格式
                        if (!validateIdFormat(type, id)) {
                            alert(`❌ 导入失败：节点 ${id} 的ID格式不符合要求`);
                            return;
                        }
                        
                        layoutNodes[id] = {
                            id: id,
                            type: type,
                            x: parseFloat(parts[2]),
                            y: parseFloat(parts[3]),
                            loadTime: parseInt(parts[4])
                        };
                    }
                }

                // CSV导入：系统自动生成建议的点位关系
                initDefaultOpConnections();
                
                drawCanvas();
                updateLegend();
                simulationResults = null;
                document.getElementById('statsPanel').style.display = 'none';
                alert('✅ CSV布局导入成功！\n\n📋 导入说明：\n• 系统已自动生成建议的点位连接关系\n• 如需调整连接，请双击通过点进行编辑\n• 建议检查并优化生成的连接关系');
            } catch (error) {
                alert('❌ 导入失败：' + error.message);
            }
        };
        reader.readAsText(file);
    }

    event.target.value = '';
}

function exportLayout() {
    if (Object.keys(layoutNodes).length === 0) {
        alert('布局为空！');
        return;
    }

    const format = prompt('请选择导出格式 (json/csv):', 'json');
    if (!format) return;

    if (format.toLowerCase() === 'json') {
        const dataStr = JSON.stringify(layoutNodes, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'factory_layout.json';
        link.click();
        URL.revokeObjectURL(url);
        alert('✅ JSON导出成功！');
    } else if (format.toLowerCase() === 'csv') {
        let csv = '工站ID,类型,X坐标,Y坐标,装载时间\n';
        Object.values(layoutNodes).forEach(node => {
            csv += `${node.id},${node.type},${node.x},${node.y},${node.loadTime}\n`;
        });
        
        // 添加BOM
        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'factory_layout.csv';
        link.click();
        URL.revokeObjectURL(url);
        alert('✅ CSV导出成功！');
    } else {
        alert('❌ 不支持的格式！');
    }
}

// 导入布局数据的函数
function importLayoutFromObject(data) {
    if (!data) return;
    
    layoutNodes = {};
    
    if (Array.isArray(data)) {
        data.forEach(item => {
            layoutNodes[item.id] = item;
        });
    } else {
        layoutNodes = data;
    }
    
    // 为新导入的通过点自动初始化连接
    initDefaultOpConnections();
    
    drawCanvas();
    updateLegend();
    simulationResults = null;
    document.getElementById('statsPanel').style.display = 'none';
}

// 加载布局数据的函数
function loadLayoutFromData(data) {
    importLayoutFromObject(data);
}

// ================= 模拟引擎 =================
function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function seededRandom(seed) {
    let state = seed;
    return function() {
        state = (state * 16807 + 0) % 2147483647;
        return (state - 1) / 2147483646;
    };
}

// 计算两个点之间的直线距离
function calculateDistance(n1, n2, scaleFactor) {
    const dx = (n1.x - n2.x) * scaleFactor;
    const dy = (n1.y - n2.y) * scaleFactor;
    return Math.sqrt(dx*dx + dy*dy);
}

// 找到距离指定节点最近的通过点
function findNearestOperationPoint(nodeId, scaleFactor) {
    const node = layoutNodes[nodeId];
    if (!node) return null;
    
    const operationPoints = Object.values(layoutNodes).filter(n => n.type === 'OperationPoint');
    if (operationPoints.length === 0) return null;
    
    // 如果节点本身就是通过点，直接返回自身
    if (node.type === 'OperationPoint') {
        return node;
    }
    
    let nearestOp = null;
    let minDistance = Infinity;
    
    for (const op of operationPoints) {
        // 使用直线距离计算，但考虑连接关系来模拟轨道距离
        const directDistance = calculateDistance(node, op, scaleFactor);
        
        // 如果通过点与当前节点有直接连接，优先考虑
        let distance = directDistance;
        if (node.connectedTo && node.connectedTo.includes(op.id)) {
            // 有直接连接的通过点，距离稍微优惠
            distance *= 0.8;
        }
        
        if (distance < minDistance) {
            minDistance = distance;
            nearestOp = op;
        }
    }
    
    return nearestOp;
}

// 预计算所有通过点之间的距离
function precomputeOpDistances(scaleFactor) {
    const operationPoints = Object.values(layoutNodes).filter(n => n.type === 'OperationPoint');
    if (operationPoints.length === 0) return;
    
    // 清空缓存
    opDistanceCache = {};
    
    // 计算每对通过点之间的距离
    for (const op1 of operationPoints) {
        opDistanceCache[op1.id] = {};
        for (const op2 of operationPoints) {
            if (op1.id !== op2.id) {
                // 使用轨道网络计算距离
                try {
                    // 直接使用Dijkstra算法计算通过点之间的距离
                    const startNode = layoutNodes[op1.id];
                    const endNode = layoutNodes[op2.id];
                    
                    // 初始化距离表
                    const distances = {};
                    const visited = new Set();
                    
                    // 初始化所有节点的距离为无穷大
                    for (const nodeId in layoutNodes) {
                        distances[nodeId] = Infinity;
                    }
                    
                    // 起点距离为0
                    distances[op1.id] = 0;
                    
                    // 优先队列，存储待处理的节点
                    const priorityQueue = Object.keys(layoutNodes);
                    
                    while (priorityQueue.length > 0) {
                        // 找到距离最小的节点
                        let minDistance = Infinity;
                        let currentId = null;
                        
                        for (const nodeId of priorityQueue) {
                            if (distances[nodeId] < minDistance) {
                                minDistance = distances[nodeId];
                                currentId = nodeId;
                            }
                        }
                        
                        // 如果找不到最小距离节点或已到达终点，退出循环
                        if (!currentId || currentId === op2.id) break;
                        
                        // 从队列中移除当前节点
                        const index = priorityQueue.indexOf(currentId);
                        priorityQueue.splice(index, 1);
                        visited.add(currentId);
                        
                        const currentNode = layoutNodes[currentId];
                        
                        // 处理当前节点的邻居
                        if (currentNode.type === 'OperationPoint' && currentNode.connectedTo) {
                            // 对于通过点，使用其连接关系
                            for (const neighborId of currentNode.connectedTo) {
                                if (visited.has(neighborId)) continue;
                                
                                const neighborNode = layoutNodes[neighborId];
                                if (!neighborNode) continue;
                                
                                // 计算通过点之间的轨道长度
                                const distance = calculateDistance(currentNode, neighborNode, scaleFactor);
                                const newDistance = distances[currentId] + distance;
                                
                                if (newDistance < distances[neighborId]) {
                                    distances[neighborId] = newDistance;
                                }
                            }
                        }
                    }
                    
                    if (distances[op2.id] !== Infinity) {
                        opDistanceCache[op1.id][op2.id] = distances[op2.id];
                    } else {
                        opDistanceCache[op1.id][op2.id] = Infinity;
                    }
                } catch (error) {
                    console.warn(`无法计算${op1.id}到${op2.id}的距离: ${error.message}`);
                    opDistanceCache[op1.id][op2.id] = Infinity;
                }
            } else {
                opDistanceCache[op1.id][op2.id] = 0;
            }
        }
    }
    
    console.log('通过点距离预计算完成:', opDistanceCache);
}

// 使用预计算的通过点距离计算路径距离
function calculateTrackDistance(startId, endId, scaleFactor) {
    // 如果起点和终点相同，距离为0
    if (startId === endId) return 0;
    
    const startNode = layoutNodes[startId];
    const endNode = layoutNodes[endId];
    
    // 确保节点存在
    if (!startNode || !endNode) {
        throw new Error(`节点不存在：${!startNode ? startId : endId}`);
    }
    
    // 步骤1：系统将每个工站点位的最近通过点识别出来
    let startOpId = startId;
    let startDistance = 0;
    
    if (startNode.type !== 'OperationPoint') {
        const nearestOp = findNearestOperationPoint(startId, scaleFactor);
        if (nearestOp) {
            startOpId = nearestOp.id;
            startDistance = calculateDistance(startNode, nearestOp, scaleFactor);
        } else {
            // 系统中应该至少有一个通过点
            throw new Error('系统中没有通过点！');
        }
    }
    
    let endOpId = endId;
    let endDistance = 0;
    
    if (endNode.type !== 'OperationPoint') {
        const nearestOp = findNearestOperationPoint(endId, scaleFactor);
        if (nearestOp) {
            endOpId = nearestOp.id;
            endDistance = calculateDistance(endNode, nearestOp, scaleFactor);
        } else {
            // 系统中应该至少有一个通过点
            throw new Error('系统中没有通过点！');
        }
    }
    
    // 如果起点和终点的最近通过点相同，直接返回距离
    if (startOpId === endOpId) {
        return startDistance + endDistance;
    }
    
    // 步骤2：使用预计算的通过点距离缓存
    if (opDistanceCache[startOpId] && opDistanceCache[startOpId][endOpId] !== undefined) {
        const cachedDistance = opDistanceCache[startOpId][endOpId];
        if (cachedDistance !== Infinity) {
            return cachedDistance + startDistance + endDistance;
        }
    }
    
    // 如果没有缓存，抛出错误（因为预计算应该已经完成）
    throw new Error(`无法找到通过点${startOpId}到${endOpId}的预计算距离！请检查通过点之间的连接关系。`);
}

function getTravelTime(n1, n2, config) {
    // 使用轨道网络计算距离（通过点之间的轨道长度）
    const distance = calculateTrackDistance(n1.id, n2.id, config.scaleFactor);
    // 结合AGV车速转化为时间单位
    const baseTime = distance / config.baseSpeed;
    
    return baseTime;
}

function closeModal() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modalOverlay');
    modal.innerHTML = '';
    overlay.style.display = 'none';
}

function clearSimulationResults() {
    simulationResults = null;
    document.getElementById('statsPanel').style.display = 'none';
    drawCanvas();
    updateLegend();
    alert('✅ 模拟结果已清空！');
}

function checkMaintenanceDelay(arrivalTime, duration, maintStartMin, maintEndMin) {
    if (arrivalTime < maintEndMin) {
        if (arrivalTime + duration > maintStartMin) {
            const waitTime = maintEndMin - arrivalTime;
            return Math.max(0, waitTime);
    }
    }
    return 0;
}

function runSimulation() {
    const numVehicles = parseInt(document.getElementById('numVehicles').value);
    const maintStart = document.getElementById('maintStart').value;
    const maintEnd = document.getElementById('maintEnd').value;
    const cvFactor = parseFloat(document.getElementById('cvFactor').value);
    const baseSpeed = parseFloat(document.getElementById('baseSpeed').value);
    const scaleFactor = parseFloat(document.getElementById('scaleFactor').value);
    const iterations = parseInt(document.getElementById('iterations').value);
    const seed = parseInt(document.getElementById('seed').value);

    if (Object.keys(layoutNodes).length === 0) {
        alert('布局为空！请先生成或导入布局。');
        return;
    }

    // 检查是否存在通过点
    const operationPoints = Object.values(layoutNodes).filter(n => n.type === 'OperationPoint');
    if (operationPoints.length === 0) {
        alert('系统中没有通过点！请先布置通过点并建立连接关系。');
        return;
    }

    // 预计算所有通过点之间的距离
    precomputeOpDistances(scaleFactor);

    // 显示模拟运行前的警告
    if (!confirm('⚠️ 模拟运行提示\n\n系统将基于通过点之间的连接关系生成路径。\n\n当前模拟引擎会：\n1. 预计算所有通过点之间的轨道距离\n2. 识别每个工站的最近通过点\n3. 使用预计算的通过点距离计算路径\n4. 基于轨道长度和工站配送时间平衡AGV工作量\n5. 生成最优配送路线\n\n是否继续运行模拟？')) {
        return;
    }

    document.getElementById('loading').classList.add('active');

    // 模拟完成后，移除加载状态并显示结果
    setTimeout(() => {
        try {
            const config = {
                numVehicles,
                maintStart,
                maintEnd,
                cvFactor,
                baseSpeed,
                scaleFactor,
                iterations,
                seed
            };
            
            const result = simulate(config);
            simulationResults = result;
            displayResults(config, result);
        } catch (error) {
            alert(`模拟运行出错：${error.message}`);
            console.error('模拟运行错误:', error);
        } finally {
            document.getElementById('loading').classList.remove('active');
        }
    }, 100);
}

function simulate(config) {
    const maintStartMin = timeToMinutes(config.maintStart);
    const maintEndMin = timeToMinutes(config.maintEnd);
    
    // 只考虑非充电点的任务
    const tasks = Object.keys(layoutNodes).filter(nodeId => 
        nodeId !== 'WH_0' && nodeId !== 'Depot' && layoutNodes[nodeId].type !== 'ChargingPoint');
    
    // 预处理：为每个任务工站找到最近的通过点
    const taskNearestOps = {};
    for (const taskId of tasks) {
        const taskNode = layoutNodes[taskId];
        const nearestOp = findNearestOperationPoint(taskId, config.scaleFactor);
        if (nearestOp) {
            taskNearestOps[taskId] = nearestOp.id;
        }
    }
    
    let bestCost = Infinity;
    let bestSolution = null;
    
    // 使用种子创建随机数生成器
    const rng = seededRandom(config.seed);
    
    for (let iter = 0; iter < config.iterations; iter++) {
        // 记录每个工站的进入通过点（用于离开时返回同一个点）
        const stationEntryOps = {};
        // 随机打乱任务顺序
        const shuffledTasks = [...tasks];
        for (let i = shuffledTasks.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [shuffledTasks[i], shuffledTasks[j]] = [shuffledTasks[j], shuffledTasks[i]];
        }
        
        // 初始化车辆
        const vehicles = [];
        for (let i = 0; i < config.numVehicles; i++) {
            vehicles.push({
                id: i,
                currentTime: 0,
                route: []
            });
        }
        
        const currentTasks = [...shuffledTasks];
        
        // 分配任务给车辆
        while (currentTasks.length > 0) {
            let bestVehicleIdx = -1;
            let bestTaskIdx = -1;
            let minCost = Infinity;
            
            // 寻找成本最低的车辆-任务组合
            for (let vIdx = 0; vIdx < vehicles.length; vIdx++) {
                const vehicle = vehicles[vIdx];
                
                // 获取车辆当前位置（如果是工站，需要找到对应的通过点）
                let currentPosition = vehicle.route.length === 0 ? 
                    layoutNodes['WH_0'] || layoutNodes['Depot'] : layoutNodes[vehicle.route[vehicle.route.length - 1]];
                
                // 如果当前位置是工站，需要找到对应的通过点
                if (currentPosition.type !== 'OperationPoint' && currentPosition.type !== 'Depot') {
                    const nearestOpId = taskNearestOps[currentPosition.id];
                    if (nearestOpId) {
                        currentPosition = layoutNodes[nearestOpId];
                    }
                }
                
                for (let tIdx = 0; tIdx < currentTasks.length; tIdx++) {
                    const taskId = currentTasks[tIdx];
                    const targetNode = layoutNodes[taskId];
                    const targetNearestOpId = taskNearestOps[taskId];
                    
                    if (!targetNearestOpId) continue;
                    
                    // 计算从当前位置到目标工站的最近通过点的轨道距离
                    const travelTimeToOp = getTravelTime(currentPosition, layoutNodes[targetNearestOpId], config);
                    
                    // 计算从通过点到工站的直线距离时间
                    const opToStationDistance = calculateDistance(layoutNodes[targetNearestOpId], targetNode, config.scaleFactor);
                    const opToStationTime = opToStationDistance / config.baseSpeed;
                    
                    const totalTravelTime = travelTimeToOp + opToStationTime;
                    const arrivalTime = vehicle.currentTime + totalTravelTime;
                    
                    const loadTime = targetNode.loadTime;
                    const waitTime = checkMaintenanceDelay(
                        arrivalTime, loadTime, maintStartMin, maintEndMin
                    );
                    const cost = arrivalTime + waitTime + loadTime;
                    
                    if (cost < minCost) {
                        minCost = cost;
                        bestVehicleIdx = vIdx;
                        bestTaskIdx = tIdx;
                    }
                }
            }
            
            if (bestVehicleIdx !== -1) {
                const taskId = currentTasks.splice(bestTaskIdx, 1)[0];
                const vehicle = vehicles[bestVehicleIdx];
                const targetNode = layoutNodes[taskId];
                const targetNearestOpId = taskNearestOps[taskId];
                
                // 获取车辆当前位置（如果是工站，需要找到对应的通过点）
                let currentPosition = vehicle.route.length === 0 ? 
                    layoutNodes['WH_0'] || layoutNodes['Depot'] : layoutNodes[vehicle.route[vehicle.route.length - 1]];
                
                // 如果当前位置是工站，需要找到对应的通过点
                if (currentPosition.type !== 'OperationPoint' && currentPosition.type !== 'Depot') {
                    const nearestOpId = taskNearestOps[currentPosition.id];
                    if (nearestOpId) {
                        currentPosition = layoutNodes[nearestOpId];
                    }
                }
                
                // 计算从当前位置到目标工站的最近通过点的轨道距离
                const travelTimeToOp = getTravelTime(currentPosition, layoutNodes[targetNearestOpId], config);
                
                // 计算从通过点到工站的直线距离时间
                const opToStationDistance = calculateDistance(layoutNodes[targetNearestOpId], targetNode, config.scaleFactor);
                const opToStationTime = opToStationDistance / config.baseSpeed;
                
                const totalTravelTime = travelTimeToOp + opToStationTime;
                vehicle.currentTime += totalTravelTime;
                
                const loadTime = targetNode.loadTime;
                const waitTime = checkMaintenanceDelay(
                    vehicle.currentTime, loadTime, maintStartMin, maintEndMin
                );
                vehicle.currentTime += waitTime + loadTime;
                
                // 记录工站的进入通过点
                stationEntryOps[taskId] = targetNearestOpId;
                
                // 在路线中添加通过点和工站
                if (currentPosition.id !== targetNearestOpId) {
                    vehicle.route.push(targetNearestOpId); // 添加进入通过点
                }
                vehicle.route.push(taskId); // 添加工站
                
                // 关键修复：添加离开工站返回到通过点的步骤
                // 确保AGV离开工站时返回到进入时的同一个通过点
                vehicle.route.push(targetNearestOpId); // 添加离开通过点
            } else {
                break;
            }
        }
        
        // 计算所有车辆返回仓库的时间
        let totalSystemTime = 0;
        for (const vehicle of vehicles) {
            if (vehicle.route.length > 0) {
                const lastNode = layoutNodes[vehicle.route[vehicle.route.length - 1]];
                
                // 如果最后位置是工站，需要先返回到进入时的通过点
                let returnFromNode = lastNode;
                if (lastNode.type !== 'OperationPoint' && lastNode.type !== 'Depot') {
                    const entryOpId = stationEntryOps[lastNode.id];
                    if (entryOpId) {
                        returnFromNode = layoutNodes[entryOpId];
                        vehicle.route.push(entryOpId); // 添加返回通过点（必须与进入时相同）
                    } else {
                        // 如果没有记录，使用最近通过点作为备选
                        const nearestOpId = taskNearestOps[lastNode.id];
                        if (nearestOpId) {
                            returnFromNode = layoutNodes[nearestOpId];
                            vehicle.route.push(nearestOpId);
                        }
                    }
                }
                
                const returnTime = getTravelTime(returnFromNode, layoutNodes['WH_0'] || layoutNodes['Depot'], config);
                vehicle.currentTime += returnTime;
                vehicle.route.push('WH_0');
            }
            totalSystemTime += vehicle.currentTime;
        }
        
        // 更新最佳解
        if (totalSystemTime < bestCost) {
            bestCost = totalSystemTime;
            bestSolution = vehicles.map(v => ({
                route: [...v.route],
                time: v.currentTime
            }));
        }
    }
    
    return {
        routes: bestSolution,
        totalCost: bestCost,
        nodes: layoutNodes
    };
}

// ================= 结果显示 =================
function displayResults(config, result) {
    drawCanvas();
    updateLegend();
    updateRouteSelect(); // 更新AGV线路选择下拉框
    displayStats(config, result);
    displayRouteDetails(config, result);
}

function displayStats(config, result) {
    const totalStations = Object.keys(layoutNodes).filter(id => 
        layoutNodes[id].type !== 'TurnPoint' && id !== 'WH_0' && id !== 'Depot').length;
    const avgTimePerVehicle = result.totalCost / config.numVehicles;
    const maxVehicleTime = Math.max(...result.routes.map(r => r.time));
    const minVehicleTime = Math.min(...result.routes.map(r => r.time));

    document.getElementById('statsPanel').style.display = 'block';
    const statsGrid = document.getElementById('statsGrid');
    statsGrid.innerHTML = `
        <div class="stat-card">
            <div class="label">总工站数</div>
            <div class="value">${totalStations}</div>
        </div>
        <div class="stat-card">
            <div class="label">AGV车辆数</div>
            <div class="value">${config.numVehicles}</div>
        </div>
        <div class="stat-card">
            <div class="label">平均单车耗时</div>
            <div class="value">${avgTimePerVehicle.toFixed(1)} 分钟</div>
        </div>
        <div class="stat-card">
            <div class="label">最长单车耗时</div>
            <div class="value">${maxVehicleTime.toFixed(1)} 分钟</div>
        </div>
    `;
}

// 修改显示路线详情的函数，添加事件监听器
function displayRouteDetails(config, result) {
    const routeDetails = document.getElementById('routeDetails');
    let html = '';

    result.routes.forEach((route, idx) => {
        // 确保路线显示时从仓库开始并回到仓库
        const displayRoute = [...route.route];
        if(displayRoute.length > 0) {
            // 如果路线不是从仓库开始，添加仓库作为起点
            if(displayRoute[0] !== 'WH_0' && displayRoute[0] !== 'Depot') {
                displayRoute.unshift('WH_0');
            }
            // 如果路线最后不是仓库，添加仓库作为终点
            if(displayRoute[displayRoute.length - 1] !== 'WH_0' && displayRoute[displayRoute.length - 1] !== 'Depot') {
                displayRoute.push('WH_0');
            }
        }
        
        // 插入必须经过的点
        const processedDisplayRoute = insertMandatoryPoints(displayRoute, idx);
        
        const stationsCount = processedDisplayRoute.filter(id => {
            const node = layoutNodes[id];
            return node && node.type !== 'ChargingPoint' && node.type !== 'OperationPoint' && id !== 'WH_0' && id !== 'Depot';
        }).length;
        
        const depotCount = processedDisplayRoute.filter(id => id === 'WH_0' || id === 'Depot').length;
        const operationPointCount = processedDisplayRoute.filter(id => layoutNodes[id] && layoutNodes[id].type === 'OperationPoint').length;
        const chargingPointCount = processedDisplayRoute.filter(id => layoutNodes[id] && layoutNodes[id].type === 'ChargingPoint').length;
        
        const badgesHtml = processedDisplayRoute.map(id => {
            let badgeClass = 'badge-depot';
            let label = id;
            if (id === 'WH_0' || id === 'Depot') {
                badgeClass = 'badge-depot';
                label = '仓库';
            } else if (layoutNodes[id] && layoutNodes[id].type === 'SubLine') {
                badgeClass = 'badge-sub';
                // 显示简化的分装线标签
                const match = id.match(/Sub_(\d+)_(\d+)/);
                if (match) {
                    label = `分${match[1]}-${match[2]}`;
                }
            } else if (layoutNodes[id] && layoutNodes[id].type === 'FinalLine') {
                badgeClass = 'badge-final';
                // 显示简化的总装线标签
                const match = id.match(/Final_(\d+)_(\d+)/);
                if (match) {
                    label = `总${match[1]}-${match[2]}`;
                }
            } else if (layoutNodes[id] && layoutNodes[id].type === 'OperationPoint') {
                badgeClass = 'badge-operation';
                label = '通过';
            } else if (layoutNodes[id] && layoutNodes[id].type === 'ChargingPoint') {
                badgeClass = 'badge-charging';
                label = '充电';
            }
            // 添加data-node-id属性用于联动高亮
            return `<span class="route-badge ${badgeClass}" data-node-id="${id}">${label}</span>`;
        }).join(' → ');

        html += `
            <div class="route-item">
                <div class="route-header">
                    <span class="route-name">🚗 车辆 ${idx + 1}</span>
                    <span class="route-time">${route.time.toFixed(1)} 分钟 | ${stationsCount} 个工站 | ${operationPointCount} 个通过点 | ${chargingPointCount} 个充电点</span>
                </div>
                <div class="route-badges">${badgesHtml}</div>
            </div>
        `;
    });

    routeDetails.innerHTML = html;
    
    // 为路线中的节点添加事件监听器以实现联动高亮
    addEventListenersToRouteBadges();
}

// 添加事件监听器到路线中的节点徽章
function addEventListenersToRouteBadges() {
    const routeBadges = document.querySelectorAll('.route-badge');
    routeBadges.forEach(badge => {
        // 鼠标悬停时高亮画布上的对应节点
        badge.addEventListener('mouseenter', function() {
            const nodeId = this.getAttribute('data-node-id');
            if (nodeId) {
                highlightNode(nodeId);
            }
        });
        
        // 鼠标离开时取消高亮
        badge.addEventListener('mouseleave', function() {
            clearHighlightFromCanvas();
            // 移除面板中的高亮样式
            this.classList.remove('panel-highlight');
        });
        
        // 点击时高亮画布上的对应节点
        badge.addEventListener('click', function() {
            const nodeId = this.getAttribute('data-node-id');
            if (nodeId) {
                // 设置为当前高亮节点
                highlightedNode = nodeId;
                // 高亮画布上的节点
                drawCanvas();
                
                // 高亮面板中的节点
                // 先移除其他节点的高亮样式
                document.querySelectorAll('.route-badge.panel-highlight').forEach(el => {
                    el.classList.remove('panel-highlight');
                });
                // 为当前节点添加高亮样式
                this.classList.add('panel-highlight');
            }
        });
        
        // 双击时打开编辑器
        badge.addEventListener('dblclick', function() {
            const nodeId = this.getAttribute('data-node-id');
            if (nodeId) {
                openNodeEditor(layoutNodes[nodeId]);
            }
        });
    });
}

// 高亮画布上的特定节点
function highlightNodeInCanvas(nodeId) {
    if (!layoutNodes[nodeId]) return;
    
    const node = layoutNodes[nodeId];
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');

    // 计算节点在画布上的位置
    const allNodes = Object.values(layoutNodes);
    const maxX = Math.max(...allNodes.map(n => n.x)) + 5;
    const maxY = Math.max(...allNodes.map(n => n.y)) + 5;

    const padding = 60;
    const scaleX = (canvas.width - 2 * padding) / (maxX || 1);
    const scaleY = (canvas.height - 2 * padding) / (maxY || 1);
    const scale = Math.min(scaleX, scaleY);

    function toCanvas(x, y) {
        return {
            x: padding + x * scale,
            y: padding + y * scale
        };
    }

    const pos = toCanvas(node.x, node.y);
    const radius = 22; // 高亮半径

    // 临时绘制高亮效果
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 10, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 215, 0, 0.5)'; // 金色半透明外圈
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 5, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(255, 255, 0, 0.3)'; // 黄色半透明内圈
    ctx.fill();
}

// 清除画布上的高亮效果
function clearHighlightFromCanvas() {
    drawCanvas(); // 重绘画布以清除高亮效果
}

// 新增函数：插入必须经过的点（考虑通过点之间的连接关系）
function insertMandatoryPoints(route, vehicleIndex) {
    if (!route || route.length === 0) return route;

    // 获取所有操作点 (OperationPoint)
    const operationPoints = Object.values(layoutNodes).filter(node => node.type === 'OperationPoint');
    
    if (operationPoints.length === 0) return route;

    // 创建路线副本以避免修改原始数据
    let newRoute = [...route];

    // 找到仓库在路线中的位置 (通常是第一个或最后一个，取决于路线是否闭环)
    const depotId = 'WH_0';
    const firstDepotIndex = newRoute.indexOf(depotId);
    
    // 如果路线中没有仓库，直接返回（异常情况）
    if (firstDepotIndex === -1) return newRoute;

    // 构造新路线: 仓库 -> 工站1 -> 工站2 -> ... -> 仓库
    // 对于每对相邻工站，计算通过轨道网络的路径
    let resultRoute = [];
    
    // 添加起始仓库
    resultRoute.push(newRoute[firstDepotIndex]);
    
    // 处理仓库到第一个工站的路径
    if (firstDepotIndex + 1 < newRoute.length) {
        const firstStation = newRoute[firstDepotIndex + 1];
        const depotToStationPath = findPathBetweenNodes(depotId, firstStation);
        if (depotToStationPath && depotToStationPath.length > 0) {
            // 跳过第一个点（仓库），因为已经添加了
            for (let i = 1; i < depotToStationPath.length; i++) {
                resultRoute.push(depotToStationPath[i]);
            }
        } else {
            // 如果找不到路径，直接添加工站
            resultRoute.push(firstStation);
        }
    }
    
    // 处理工站之间的路径
    for (let i = firstDepotIndex + 1; i < newRoute.length - 1; i++) {
        const currentStation = newRoute[i];
        const nextStation = newRoute[i + 1];
        
        // 跳过仓库
        if (currentStation === depotId || nextStation === depotId) {
            if (nextStation !== depotId) {
                resultRoute.push(nextStation);
            }
            continue;
        }
        
        // 计算两个工站之间的轨道路径
        const path = findPathBetweenNodes(currentStation, nextStation);
        if (path && path.length > 0) {
            // 跳过第一个点（当前工站），因为已经添加了
            for (let j = 1; j < path.length; j++) {
                resultRoute.push(path[j]);
            }
        } else {
            // 如果找不到路径，直接添加下一个工站
            resultRoute.push(nextStation);
        }
    }
    
    // 确保路线以仓库结束
    if (resultRoute[resultRoute.length - 1] !== depotId) {
        const lastStation = resultRoute[resultRoute.length - 1];
        const stationToDepotPath = findPathBetweenNodes(lastStation, depotId);
        if (stationToDepotPath && stationToDepotPath.length > 0) {
            // 跳过第一个点（最后一个工站），因为已经添加了
            for (let i = 1; i < stationToDepotPath.length; i++) {
                resultRoute.push(stationToDepotPath[i]);
            }
        } else {
            // 如果找不到路径，直接添加仓库
            resultRoute.push(depotId);
        }
    }

    return resultRoute;
}

// 使用BFS算法在轨道网络中查找两个节点之间的路径
function findPathBetweenNodes(startId, endId) {
    if (startId === endId) return [startId];
    
    const startNode = layoutNodes[startId];
    const endNode = layoutNodes[endId];
    
    if (!startNode || !endNode) return null;
    
    const visited = new Set();
    const queue = [[startId]];
    
    while (queue.length > 0) {
        const path = queue.shift();
        const currentId = path[path.length - 1];
        
        if (currentId === endId) {
            return path;
        }
        
        if (visited.has(currentId)) {
            continue;
        }
        
        visited.add(currentId);
        
        const currentNode = layoutNodes[currentId];
        if (currentNode && currentNode.connectedTo) {
            for (const neighborId of currentNode.connectedTo) {
                if (!visited.has(neighborId)) {
                    const newPath = [...path, neighborId];
                    queue.push(newPath);
                }
            }
        }
    }
    
    return null;
}

// 在现有代码中添加高亮功能
function highlightNode(nodeId) {
    if (!nodeId) return;

    // 更新高亮状态
    highlightedNode = nodeId;

    // 重新绘制画布以应用高亮效果
    drawCanvas();
    
    // 高亮模拟结果中的对应节点
    highlightRouteNode(nodeId);
}

function highlightRouteNode(nodeId) {
    // 查找并高亮模拟结果面板中的对应节点
    const routeNodes = document.querySelectorAll('.route-badge');
    routeNodes.forEach(node => {
        if (node.dataset.nodeId === nodeId) {
            node.classList.add('panel-highlight');
        } else {
            node.classList.remove('panel-highlight');
        }
    });
}

// 添加到模拟结果面板中的节点高亮功能
function highlightNodeInPanel(nodeId) {
    // 先移除之前的所有高亮样式
    document.querySelectorAll('.route-badge.panel-highlight').forEach(el => {
        el.classList.remove('panel-highlight');
    });
    
    // 查找并高亮模拟结果面板中对应ID的节点
    const panelNodes = document.querySelectorAll(`.route-badge[data-node-id="${nodeId}"]`);
    panelNodes.forEach(nodeElement => {
        nodeElement.classList.add('panel-highlight');
    });
}

function addEventListenersToRouteNodes() {
    // 为每个路线节点添加鼠标事件
    const routeNodes = document.querySelectorAll('.route-node');
    routeNodes.forEach(nodeElement => {
        nodeElement.addEventListener('mouseenter', function() {
            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                highlightNode(nodeId);
            }
        });
        
        nodeElement.addEventListener('mouseleave', function() {
            // 当鼠标离开时，清除高亮可能不是我们想要的效果
            // 我们保留最后悬停的节点高亮
        });
        
        nodeElement.addEventListener('click', function() {
            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                // 在画布上高亮对应的节点
                highlightedNode = nodeId;
                drawNodes();
            }
        });
        
        // 双击编辑功能
        nodeElement.addEventListener('dblclick', function() {
            const nodeId = this.dataset.nodeId;
            if (nodeId) {
                openNodeEditor(nodeId); // 打开节点编辑器
            }
        });
    });
}

// 修改显示统计信息的函数以添加事件监听器
function showStats(stats, routes) {
    // 显示统计数据的现有代码...
    
    // 显示路线详情
    const routeDetailsDiv = document.getElementById('routeDetails');
    routeDetailsDiv.innerHTML = '';
    
    routes.forEach((route, index) => {
        const routeDiv = document.createElement('div');
        routeDiv.className = 'route';
        routeDiv.innerHTML = `<h3>路线 ${index + 1}</h3>`;
        
        const nodeList = document.createElement('div');
        nodeList.className = 'route-nodes';
        
        route.nodes.forEach(nodeId => {
            const nodeSpan = document.createElement('span');
            nodeSpan.className = 'route-node';
            nodeSpan.textContent = nodeId;
            nodeSpan.dataset.nodeId = nodeId; // 存储节点ID以便引用
            nodeList.appendChild(nodeSpan);
        });
        
        routeDiv.appendChild(nodeList);
        routeDetailsDiv.appendChild(routeDiv);
    });
    
    // 为新添加的路线节点添加事件监听器
    setTimeout(addEventListenersToRouteNodes, 100);
}

// 添加清空模拟结果功能
function clearSimulationResults() {
    // 清除模拟结果数据
    simulationResults = null;
    
    // 重新绘制画布以清除路线
    drawCanvas();
    
    // 隐藏统计面板
    const statsPanel = document.getElementById('statsPanel');
    if (statsPanel) {
        statsPanel.style.display = 'none';
    }
    
    // 清空统计网格内容
    const statsGrid = document.getElementById('statsGrid');
    if (statsGrid) {
        statsGrid.innerHTML = '';
    }
    
    // 清空路线详情内容
    const routeDetails = document.getElementById('routeDetails');
    if (routeDetails) {
        routeDetails.innerHTML = '';
    }
    
    // 移除所有高亮的节点样式
    document.querySelectorAll('.route-badge').forEach(badge => {
        badge.classList.remove('panel-highlight');
    });
    
    // 更新图例
    updateLegend();
}

// ================= 动画控制 =================
// 动画控制变量
let animationId = null;
let startTime = 0;
let currentTime = 0;
let animationSpeed = 1.0; // 默认速度
let targetDuration = 30; // 默认30秒
let isPaused = false;
let pauseTime = 0;
let selectedRouteIndex = 'all'; // 默认显示所有线路

// 更新动画时长
function updateDuration() {
    const durationSelect = document.getElementById('animationDuration');
    const customContainer = document.getElementById('customDurationContainer');
    const customInput = document.getElementById('customDuration');
    
    if (durationSelect.value === 'custom') {
        customContainer.style.display = 'block';
        customInput.addEventListener('change', function() {
            if (this.value) {
                targetDuration = parseInt(this.value);
            }
        });
    } else {
        customContainer.style.display = 'none';
        targetDuration = parseInt(durationSelect.value);
    }
}

// 更新播放速度
function updateSpeed() {
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    
    animationSpeed = parseFloat(speedSlider.value);
    speedValue.textContent = animationSpeed.toFixed(1) + 'x';
}

// 更新选中的AGV线路
function updateSelectedRoute() {
    const routeSelect = document.getElementById('agvRouteSelect');
    selectedRouteIndex = routeSelect.value;
    drawCanvas(); // 重绘画布以显示选中的线路
}

// 更新AGV线路选择下拉框
function updateRouteSelect() {
    const routeSelect = document.getElementById('agvRouteSelect');
    if (!routeSelect) return;
    
    // 清空现有选项
    routeSelect.innerHTML = '<option value="all">所有线路</option>';
    
    // 添加线路选项
    if (simulationResults && simulationResults.routes) {
        simulationResults.routes.forEach((route, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `AGV ${index + 1}`;
            routeSelect.appendChild(option);
        });
    }
    
    // 重置选中状态
    selectedRouteIndex = 'all';
    routeSelect.value = 'all';
}

// 播放动画
function playAnimation() {
    if (!simulationResults || !simulationResults.routes) {
        alert('请先运行模拟生成路线！');
        return;
    }
    
    if (animationId) return; // 动画已在播放
    
    if (isPaused) {
        // 恢复暂停的动画
        startTime = performance.now() - pauseTime * 1000;
        isPaused = false;
    } else {
        // 开始新动画
        startTime = performance.now();
        currentTime = 0;
    }
    
    animationId = requestAnimationFrame(animate);
}

// 动画主循环
function animate(timestamp) {
    if (isPaused) return;
    
    const elapsed = (timestamp - startTime) * animationSpeed / 1000; // 转换为秒
    currentTime = elapsed;
    
    // 更新进度条
    updateProgressBar(elapsed);
    
    // 重绘场景
    drawCanvas();
    
    // 检查是否完成
    if (elapsed < targetDuration) {
        animationId = requestAnimationFrame(animate);
    } else {
        // 动画完成
        animationId = null;
    }
}

// 暂停动画
function pauseAnimation() {
    if (!animationId) return;
    
    isPaused = true;
    pauseTime = (performance.now() - startTime) * animationSpeed / 1000;
    cancelAnimationFrame(animationId);
    animationId = null;
}

// 重置动画
function resetAnimation() {
    isPaused = false;
    currentTime = 0;
    pauseTime = 0;
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    // 重置进度条
    document.getElementById('animationProgress').style.width = '0%';
    // 重绘初始状态
    drawCanvas();
}

// 更新进度条
function updateProgressBar(elapsedTime) {
    const progress = Math.min((elapsedTime / targetDuration) * 100, 100);
    document.getElementById('animationProgress').style.width = progress + '%';
}

// 计算AGV位置
function calculateAGVPosition(route, currentTime) {
    if (!route || route.route.length < 2) return null;
    
    // 计算时间比例，确保在目标时长内完成整个循环
    const timeRatio = Math.min(currentTime / targetDuration, 1);
    
    // 计算总路线长度（使用轨道网络距离）
    let totalDistance = 0;
    const segments = [];
    
    // 获取完整的轨道路径（包含所有中间通过点）
    const fullRoute = [...route.route];
    if (fullRoute[0] !== 'WH_0' && fullRoute[0] !== 'Depot') {
        fullRoute.unshift('WH_0');
    }
    if (fullRoute[fullRoute.length - 1] !== 'WH_0' && fullRoute[fullRoute.length - 1] !== 'Depot') {
        fullRoute.push('WH_0');
    }
    
    const processedRoute = insertMandatoryPoints(fullRoute, route.id || 0);
    
    for (let i = 0; i < processedRoute.length - 1; i++) {
        const startNode = layoutNodes[processedRoute[i]];
        const endNode = layoutNodes[processedRoute[i + 1]];
        
        if (!startNode || !endNode) continue;
        
        // 使用轨道网络距离计算两点之间的距离
        const distance = calculateTrackDistance(startNode.id, endNode.id, 1); // scaleFactor=1，因为已经是实际距离
        totalDistance += distance;
        segments.push({
            start: startNode,
            end: endNode,
            distance: distance,
            cumulativeDistance: totalDistance
        });
    }
    
    // 计算当前应该行驶的距离
    const currentDistance = totalDistance * timeRatio;
    
    // 找到当前所在的路段
    let accumulatedDistance = 0;
    for (const segment of segments) {
        if (accumulatedDistance + segment.distance >= currentDistance) {
            // 在当前段内，计算具体位置
            const segmentRatio = (currentDistance - accumulatedDistance) / segment.distance;
            const x = segment.start.x + (segment.end.x - segment.start.x) * segmentRatio;
            const y = segment.start.y + (segment.end.y - segment.start.y) * segmentRatio;
            return { x, y };
        }
        accumulatedDistance += segment.distance;
    }
    
    // 如果时间超过总时间，返回最后一个点（应该是仓库）
    const lastNode = layoutNodes[route.route[route.route.length - 1]];
    return lastNode ? { x: lastNode.x, y: lastNode.y } : null;
}

// 绘制AGV
function drawAGVs(ctx) {
    if (!simulationResults || !simulationResults.routes) return;
    
    // 获取画布尺寸和缩放信息
    const canvas = document.getElementById('mainCanvas');
    const width = canvas.width;
    const height = canvas.height;
    
    if (Object.keys(layoutNodes).length === 0) return;

    const allNodes = Object.values(layoutNodes);
    const maxX = Math.max(...allNodes.map(n => n.x)) + 5;
    const maxY = Math.max(...allNodes.map(n => n.y)) + 5;

    const padding = 60;
    const scaleX = (canvas.width - 2 * padding) / (maxX || 1);
    const scaleY = (canvas.height - 2 * padding) / (maxY || 1);
    const scale = Math.min(scaleX, scaleY);

    function toCanvas(x, y) {
        return {
            x: padding + x * scale,
            y: padding + y * scale
        };
    }
    
    // 绘制选中的AGV线路
    simulationResults.routes.forEach((route, routeIdx) => {
        // 检查是否需要绘制当前线路
        if (selectedRouteIndex !== 'all' && parseInt(selectedRouteIndex) !== routeIdx) {
            return;
        }
        
        const color = routeColors[routeIdx % routeColors.length];
        
        // 计算AGV当前位置
        const position = calculateAGVPosition(route, currentTime);
        if (position) {
            const canvasPos = toCanvas(position.x, position.y);
            
            // 绘制AGV
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(canvasPos.x, canvasPos.y, 10, 0, 2 * Math.PI);
            ctx.fill();
            
            // 绘制AGV边框
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(canvasPos.x, canvasPos.y, 10, 0, 2 * Math.PI);
            ctx.stroke();
            
            // 绘制AGV方向
            if (route.route.length > 1) {
                const nextIndex = Math.min(route.route.length - 1, Math.floor(currentTime / targetDuration * route.route.length));
                const nextNode = layoutNodes[route.route[nextIndex]];
                if (nextNode) {
                    const nextPos = toCanvas(nextNode.x, nextNode.y);
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(canvasPos.x, canvasPos.y);
                    ctx.lineTo(nextPos.x, nextPos.y);
                    ctx.stroke();
                }
            }
        }
    });
}