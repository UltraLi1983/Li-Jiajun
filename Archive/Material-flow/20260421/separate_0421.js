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

// 颜色配置
const nodeColors = {
    'Depot': 'rgb(245, 5, 55)',
    'SubLine': 'rgb(218, 218, 218)',
    'FinalLine': 'rgb(198, 198, 198)',
    'OperationPoint': 'rgb(0, 0, 0)',  // 通过点位颜色改为黑色
    'ChargingPoint': 'rgb(0, 0, 255)'    // 新增充电点颜色
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
    'rgb(255, 165, 0)',     // 橙色
    'rgb(0, 128, 0)'        // 绿色
];

// ================= 初始化 =================
window.addEventListener('load', () => {
    generateDefaultLayout();
    setupCanvasEvents();
});

window.addEventListener('resize', () => {
    drawCanvas();
});

function generateDefaultLayout() {
    layoutNodes = {};

    layoutNodes['Depot'] = {
        id: 'Depot',
        type: 'Depot',
        loadTime: 0,
        x: 0,
        y: 0
    };

    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            const nodeId = `Sub_${i}_St_${j}`;
            layoutNodes[nodeId] = {
                id: nodeId,
                type: 'SubLine',
                loadTime: 5,
                x: 10 + i * 5,
                y: j * 5
            };
        }
    }

    for (let i = 0; i < 15; i++) {
        const nodeId = `Final_St_${i}`;
        layoutNodes[nodeId] = {
            id: nodeId,
            type: 'FinalLine',
            loadTime: 3,
            x: 30,
            y: i * 2
        };
    }

    // 添加默认操作点位
    layoutNodes['OP_1'] = {
        id: 'OP_1',
        type: 'OperationPoint',
        loadTime: 2,
        x: 5,
        y: 10
    };

    // 添加默认充电点位
    layoutNodes['CP_1'] = {
        id: 'CP_1',
        type: 'ChargingPoint',
        loadTime: 0, // 充电时间暂时设为0
        x: 2,
        y: 2
    };

    drawCanvas();
    updateLegend();
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
            const color = routeColors[routeIdx % routeColors.length];
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 5]);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // 确保路线从仓库开始和结束
            const fullRoute = [...route.route];
            if(fullRoute[0] !== 'Depot') {
                fullRoute.unshift('Depot');
            }
            if(fullRoute[fullRoute.length - 1] !== 'Depot') {
                fullRoute.push('Depot');
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

    // 绘制工站点
    allNodes.forEach(node => {
        const pos = toCanvas(node.x, node.y);
        const isSelected = selectedNode && selectedNode.id === node.id;
        const isHovered = hoveredNode && hoveredNode.id === node.id;
        const isHighlighted = highlightedNode && highlightedNode === node.id; // 检查是否高亮
        const baseRadius = isHovered ? 20 : 16;
        const radius = isSelected ? 22 : (isHighlighted ? 24 : baseRadius); // 高亮时半径更大

        // 外发光效果（对于选中、悬停或高亮的节点）
        if (isSelected || isHovered || isHighlighted) {
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, radius + 8, 0, 2 * Math.PI);
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
        ctx.lineWidth = isSelected ? 4 : (isHighlighted ? 3 : 2); // 高亮节点边框更粗
        ctx.stroke();

        // 内圆高亮
        ctx.beginPath();
        ctx.arc(pos.x - 3, pos.y - 3, radius * 0.4, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        // 标签
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        let label = node.id;
        if (node.id === 'Depot') {
            label = '🏭 仓库';
        } else if (node.id.startsWith('Sub_')) {
            label = `分${node.id.split('_')[1]}-${node.id.split('_')[3]}`;
        } else if (node.id.startsWith('Final_')) {
            label = `总${node.id.split('_')[2]}`;
        } else if (node.type === 'OperationPoint') {
            label = '🔍 通过';
        } else if (node.type === 'ChargingPoint') {
            label = '🔋 充电';
        }

        // 标签背景
        const textWidth = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.fillRect(pos.x - textWidth / 2 - 3, pos.y + radius + 3, textWidth + 6, 16);

        ctx.fillStyle = '#333';
        ctx.fillText(label, pos.x, pos.y + radius + 5);

        // 显示装载时间（充电点不显示）
        if (node.loadTime > 0 && node.type !== 'ChargingPoint') {
            ctx.font = '10px Arial';
            ctx.fillStyle = '#666';
            ctx.fillText(`${node.loadTime}min`, pos.x, pos.y + radius + 20);
        }
    });
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
            if (dist <= 22) {
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
                    tooltip.innerHTML = `
                        <strong>${node.id}</strong><br>
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
    document.getElementById('editNodeId').value = node.id;
    document.getElementById('editNodeType').value = node.type;
    document.getElementById('editNodeX').value = node.x.toFixed(1);
    document.getElementById('editNodeY').value = node.y.toFixed(1);
    document.getElementById('editNodeLoadTime').value = node.loadTime;
    
    // 隐藏充电点的装载时间输入
    const loadTimeInput = document.getElementById('editNodeLoadTime').parentElement;
    if (node.type === 'ChargingPoint') {
        loadTimeInput.style.display = 'none';
    } else {
        loadTimeInput.style.display = 'flex';
    }
    
    drawCanvas();
}

function applyNodeEdit() {
    if (!selectedNode) return;
    
    selectedNode.type = document.getElementById('editNodeType').value;
    selectedNode.x = parseFloat(document.getElementById('editNodeX').value);
    selectedNode.y = parseFloat(document.getElementById('editNodeY').value);
    
    // 充电点的装载时间始终为0
    if (selectedNode.type === 'ChargingPoint') {
        selectedNode.loadTime = 0;
    } else {
        selectedNode.loadTime = parseInt(document.getElementById('editNodeLoadTime').value);
    }
    
    document.getElementById('editorInfo').textContent = `当前类型: ${typeNames[selectedNode.type]}`;
    
    drawCanvas();
    updateLegend();
    
    // 清除模拟结果，需要重新运行
    simulationResults = null;
    document.getElementById('statsPanel').style.display = 'none';
    
    alert('✅ 修改已应用！');
}

function cancelNodeEdit() {
    selectedNode = null;
    document.getElementById('nodeEditor').classList.remove('active');
    document.getElementById('noSelection').style.display = 'block';
    drawCanvas();
}

function deleteSelectedNode() {
    if (!selectedNode) return;
    
    if (selectedNode.id === 'Depot') {
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
    const id = prompt('请输入工站ID:', `New_St_${Date.now()}`);
    if (!id) return;
    
    if (layoutNodes[id]) {
        alert('❌ 工站ID已存在！');
        return;
    }
    
    const type = prompt('请输入工站类型 (SubLine/FinalLine/OperationPoint/ChargingPoint):', 'SubLine');
    if (!type || (type !== 'SubLine' && type !== 'FinalLine' && type !== 'OperationPoint' && type !== 'ChargingPoint')) {
        alert('❌ 无效的工站类型！');
        return;
    }
    
    layoutNodes[id] = {
        id: id,
        type: type,
        loadTime: type === 'ChargingPoint' ? 0 : (type === 'OperationPoint' ? 2 : (type === 'SubLine' ? 5 : 3)),
        x: 10 + Math.random() * 20,
        y: 10 + Math.random() * 20
    };
    
    drawCanvas();
    updateLegend();
    simulationResults = null;
    document.getElementById('statsPanel').style.display = 'none';
}

function resetLayout() {
    if (confirm('确定要重置为默认布局吗？当前修改将丢失。')) {
        generateDefaultLayout();
        selectedNode = null;
        document.getElementById('nodeEditor').classList.remove('active');
        document.getElementById('noSelection').style.display = 'block';
        simulationResults = null;
        document.getElementById('statsPanel').style.display = 'none';
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
                layoutNodes = {};

                if (Array.isArray(data)) {
                    data.forEach(item => {
                        layoutNodes[item.id] = item;
                    });
                } else {
                    layoutNodes = data;
                }

                drawCanvas();
                updateLegend();
                simulationResults = null;
                document.getElementById('statsPanel').style.display = 'none';
                alert('✅ JSON布局导入成功！');
            } catch (error) {
                alert('❌ 导入失败：' + error.message);
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.csv')) {
        reader.onload = (e) => {
            try {
                const lines = e.target.result.split('\n');
                layoutNodes = {};
                
                // 跳过表头
                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    
                    const parts = line.split(',');
                    if (parts.length >= 5) {
                        const id = parts[0].trim();
                        layoutNodes[id] = {
                            id: id,
                            type: parts[1].trim(),
                            x: parseFloat(parts[2]),
                            y: parseFloat(parts[3]),
                            loadTime: parseInt(parts[4])
                        };
                    }
                }

                drawCanvas();
                updateLegend();
                simulationResults = null;
                document.getElementById('statsPanel').style.display = 'none';
                alert('✅ CSV布局导入成功！');
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

function customNormalRandom(rng, mean, std) {
    const u1 = rng();
    const u2 = rng();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function calculateDistance(n1, n2, scaleFactor) {
    const dx = (n1.x - n2.x) * scaleFactor;
    const dy = (n1.y - n2.y) * scaleFactor;
    return Math.sqrt(dx*dx + dy*dy);
}

function getTravelTime(n1, n2, config, rng) {
    const distance = calculateDistance(n1, n2, config.scaleFactor);
    const baseTime = distance / config.baseSpeed;
    
    // 添加随机波动
    const fluctuation = Math.max(0.1, customNormalRandom(rng, 1.0, config.cvFactor));
    return baseTime * fluctuation;
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

    document.getElementById('loading').classList.add('active');

    // 模拟完成后，移除加载状态并显示结果
    setTimeout(() => {
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
        document.getElementById('loading').classList.remove('active');
    }, 100);
}

function simulate(config) {
    const maintStartMin = timeToMinutes(config.maintStart);
    const maintEndMin = timeToMinutes(config.maintEnd);
    
    // 只考虑非转折点的任务
    const tasks = Object.keys(layoutNodes).filter(nodeId => 
        nodeId !== 'Depot' && layoutNodes[nodeId].type !== 'TurnPoint');
    
    let bestCost = Infinity;
    let bestSolution = null;
    
    // 使用种子创建随机数生成器
    const rng = seededRandom(config.seed);
    
    for (let iter = 0; iter < config.iterations; iter++) {
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
                const currentNode = vehicle.route.length === 0 ? 
                    layoutNodes['Depot'] : layoutNodes[vehicle.route[vehicle.route.length - 1]];
                
                for (let tIdx = 0; tIdx < currentTasks.length; tIdx++) {
                    const taskId = currentTasks[tIdx];
                    const targetNode = layoutNodes[taskId];
                    const travelTime = getTravelTime(currentNode, targetNode, config, rng);
                    const arrivalTime = vehicle.currentTime + travelTime;
                    
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
                
                const currentNode = vehicle.route.length === 0 ? 
                    layoutNodes['Depot'] : layoutNodes[vehicle.route[vehicle.route.length - 1]];
                const travelTime = getTravelTime(currentNode, layoutNodes[taskId], config, rng);
                vehicle.currentTime += travelTime;
                
                const loadTime = layoutNodes[taskId].loadTime;
                const waitTime = checkMaintenanceDelay(
                    vehicle.currentTime, loadTime, maintStartMin, maintEndMin
                );
                vehicle.currentTime += waitTime + loadTime;
                vehicle.route.push(taskId);
            } else {
                break;
            }
        }
        
        // 计算所有车辆返回仓库的时间
        let totalSystemTime = 0;
        for (const vehicle of vehicles) {
            if (vehicle.route.length > 0) {
                const returnTime = getTravelTime(
                    layoutNodes[vehicle.route[vehicle.route.length - 1]], 
                    layoutNodes['Depot'], 
                    config,
                    rng
                );
                vehicle.currentTime += returnTime;
                vehicle.route.push('Depot');
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
    displayStats(config, result);
    displayRouteDetails(config, result);
}

function displayStats(config, result) {
    const totalStations = Object.keys(layoutNodes).filter(id => layoutNodes[id].type !== 'TurnPoint' && id !== 'Depot').length;
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
            if(displayRoute[0] !== 'Depot') {
                displayRoute.unshift('Depot');
            }
            // 如果路线最后不是仓库，添加仓库作为终点
            if(displayRoute[displayRoute.length - 1] !== 'Depot') {
                displayRoute.push('Depot');
            }
        }
        
        // 插入必须经过的点
        const processedDisplayRoute = insertMandatoryPoints(displayRoute, idx);
        
        const stationsCount = processedDisplayRoute.filter(id => {
            const node = layoutNodes[id];
            return node && node.type !== 'ChargingPoint' && node.type !== 'OperationPoint' && id !== 'Depot';
        }).length;
        
        const depotCount = processedDisplayRoute.filter(id => id === 'Depot').length;
        const operationPointCount = processedDisplayRoute.filter(id => layoutNodes[id] && layoutNodes[id].type === 'OperationPoint').length;
        const chargingPointCount = processedDisplayRoute.filter(id => layoutNodes[id] && layoutNodes[id].type === 'ChargingPoint').length;
        
        const badgesHtml = processedDisplayRoute.map(id => {
            let badgeClass = 'badge-depot';
            let label = id;
            if (id === 'Depot') {
                badgeClass = 'badge-depot';
                label = '仓库';
            } else if (layoutNodes[id] && layoutNodes[id].type === 'SubLine') {
                badgeClass = 'badge-sub';
            } else if (layoutNodes[id] && layoutNodes[id].type === 'FinalLine') {
                badgeClass = 'badge-final';
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
                highlightNodeInCanvas(nodeId);
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
        
        // 双击时打开节点编辑器
        badge.addEventListener('dblclick', function() {
            const nodeId = this.getAttribute('data-node-id');
            if (nodeId && layoutNodes[nodeId]) {
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

// 新增函数：插入必须经过的点
function insertMandatoryPoints(route, vehicleIndex) {
    // 这里可以实现必须经过特定点的逻辑
    // 目前只是返回原路线，后续可以根据需求实现具体的插入逻辑
    return route;
}

// 在现有代码中添加高亮功能
function highlightNode(nodeId) {
    if (!nodeId) return;

    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');

    // 恢复之前高亮的节点颜色
    if (highlightedNode && originalNodeColor[highlightedNode]) {
        // 恢复之前的颜色（如果需要的话）
    }

    // 更新高亮状态
    highlightedNode = nodeId;

    // 重新绘制画布以应用高亮效果
    drawNodes();
    
    // 高亮模拟结果中的对应节点
    highlightRouteNode(nodeId);
}

function highlightRouteNode(nodeId) {
    // 查找并高亮模拟结果面板中的对应节点
    const routeNodes = document.querySelectorAll('.route-node');
    routeNodes.forEach(node => {
        if (node.dataset.nodeId === nodeId) {
            node.classList.add('highlighted');
        } else {
            node.classList.remove('highlighted');
        }
    });
}

function highlightNodeInCanvas(nodeId) {
    // 在画布上高亮特定节点
    if (!nodes || !nodes[nodeId]) return;
    
    const node = nodes[nodeId];
    const canvas = document.getElementById('mainCanvas');
    const ctx = canvas.getContext('2d');
    
    // 保存原始颜色
    if (!originalNodeColor[nodeId]) {
        originalNodeColor[nodeId] = node.color || getNodeColorByType(node.type);
    }
    
    // 绘制高亮圆圈
    ctx.beginPath();
    ctx.arc(node.x, node.y, NODE_RADIUS + 5, 0, Math.PI * 2);
    ctx.strokeStyle = '#FFD700'; // 金色高亮边框
    ctx.lineWidth = 3;
    ctx.stroke();
}

// 修改drawNodes函数以支持高亮
function drawNodes() {
    // ... 现有的绘图代码 ...
    
    // 绘制所有节点
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        
        // 根据是否被选中设置不同的样式
        if (highlightedNode === nodeId) {
            // 绘制高亮样式
            ctx.beginPath();
            ctx.arc(node.x, node.y, NODE_RADIUS + 5, 0, Math.PI * 2);
            ctx.strokeStyle = '#FFD700'; // 金色高亮边框
            ctx.lineWidth = 3;
            ctx.stroke();
            
            // 绘制节点
            ctx.beginPath();
            ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = getNodeColorByType(node.type);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            // 正常绘制节点
            ctx.beginPath();
            ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = getNodeColorByType(node.type);
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
        
        // 绘制节点标签
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.id, node.x, node.y);
    }
    
    // 如果有高亮节点，再次绘制高亮效果确保它在最上层
    if (highlightedNode && nodes[highlightedNode]) {
        const node = nodes[highlightedNode];
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 3;
        ctx.stroke();
    }
}

// 修改鼠标移动事件以实现实时高亮
canvas.addEventListener('mousemove', function(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    let hoveredNode = null;
    
    // 检查是否有节点被鼠标悬停
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        const distance = Math.sqrt((mouseX - node.x) ** 2 + (mouseY - node.y) ** 2);
        
        if (distance <= NODE_RADIUS) {
            hoveredNode = nodeId;
            break;
        }
    }
    
    // 实时更新高亮状态
    if (hoveredNode !== highlightedNode) {
        highlightedNode = hoveredNode;
        drawNodes(); // 重绘以反映新的高亮状态
        
        // 同时高亮模拟结果中的对应节点
        if (hoveredNode) {
            highlightRouteNode(hoveredNode);
        } else {
            // 清除所有高亮
            const allHighlighted = document.querySelectorAll('.route-node.highlighted');
            allHighlighted.forEach(node => node.classList.remove('highlighted'));
        }
    }
});

// 添加画布点击事件以处理节点选择
canvas.addEventListener('click', function(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        const distance = Math.sqrt((mouseX - node.x) ** 2 + (mouseY - node.y) ** 2);
        
        if (distance <= NODE_RADIUS) {
            selectNode(nodeId); // 调用现有的节点选择函数
            break;
        }
    }
});

// 添加画布双击事件以打开编辑器
canvas.addEventListener('dblclick', function(e) {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        const distance = Math.sqrt((mouseX - node.x) ** 2 + (mouseY - node.y) ** 2);
        
        if (distance <= NODE_RADIUS) {
            openNodeEditor(nodeId); // 打开节点编辑器
            break;
        }
    }
});

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

// 添加CSS样式用于高亮效果
const style = document.createElement('style');
style.textContent = `
    .route-node.highlighted {
        background-color: #FFEB3B !important;
        color: #000 !important;
        border: 2px solid #FF9800 !important;
        transform: scale(1.05);
        transition: all 0.2s ease;
    }
    
    .route-node {
        cursor: pointer;
        transition: all 0.2s ease;
    }
`;
document.head.appendChild(style);
