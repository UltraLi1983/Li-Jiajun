// ========== 核心计算逻辑 (从Python移植) ==========

class ProcessStep {
    constructor(name, stdProcTime, numMachines, perfRate, availRate, qualRate, cvProc = 0, isTransport = false, handlingUnit = 1, allocationPct = 100) {
        this.name = name;
        this.std_proc_time = stdProcTime;
        this.num_machines = numMachines;
        this.perf_rate = perfRate;
        this.avail_rate = availRate;
        this.qual_rate = qualRate;
        this.cv_proc = cvProc;
        this.is_transport = isTransport;
        this.handling_unit = handlingUnit;
        this.allocation_percentage = allocationPct;  // 优化4：分配百分比

        this.effective_time = 0;
        this.utilization = 0;
        this.theoretical_capacity = 0;
        this.effective_capacity = 0;
        this.oee_value = 0;
        this.adjusted_demand = 0;
        this.cumulative_yield_to_end = 1;
        this.additional_machines = 0;
        this.total_machines_needed = 0;
        this.projected_utilization = 0;
        this.is_overloaded = false;
        this.target_wip = 0;
        this.wip_int = 0;  // WIP in HU units
        this.wip_int_proj = 0;
        this.step_index = null;
        this.current_cv_arrival = 1;
        this.recommended_days = 0;
        this.day_capacity = 0;  // 天产能

        // === NEW: Production Days & Output Metrics ===
        this.scheduled_days = 0;  // 设置的工作天数
        this.output_based_on_scheduled_days = 0;  // 基于设置天数的产出
        this.output_based_on_recommended_days = 0;  // 基于建议天数的产出

        // === NEW: WIP Storage Metrics ===
        this.wip_storage_absolute = 0;  // WIP存储需求（绝对值，件数）
        this.wip_storage_hu = 0;  // WIP存储需求（HU个数）
        this.wip_storage_absolute_proj = 0;  // 扩产后WIP存储需求（绝对值）
        this.wip_storage_hu_proj = 0;  // 扩产后WIP存储需求（HU个数）
        this.wip_storage_upstream_name = '';  // WIP Storage的上游工序名称（优先英文）
    }
}

// 辅助函数：从工序名称中提取英文名称
function extractEnglishName(fullName) {
    if (!fullName) return '';
    // 尝试匹配 "中文 / English" 格式
    const match = fullName.match(/.*?\/\s*(.+)/);
    if (match) {
        return match[1].trim();
    }
    // 如果没有分隔符，返回原名
    return fullName;
}

function calculateWipScenario(steps, demand, availableTime, targetUtil, shiftsPerDay, hoursPerShift, scheduledDays = 0) {
    if (demand <= 0) return { results: [], taktTime: 0 };

    const taktTimeFinal = availableTime / demand;
    const tempSteps = [];

    // Step 1: 初始化并计算累积良率（反向遍历）
    for (const step of steps) {
        tempSteps.push(new ProcessStep(
            step.name, step.std_proc_time, step.num_machines,
            step.perf_rate, step.avail_rate, step.qual_rate,
            step.cv_proc, step.is_transport, step.handling_unit || 1, step.allocation_percentage || 100
        ));
    }

    for (let i = tempSteps.length - 1; i >= 0; i--) {
        const step = tempSteps[i];
        if (i === tempSteps.length - 1) {
            step.cumulative_yield_to_end = step.qual_rate;
        } else {
            step.cumulative_yield_to_end = step.qual_rate * tempSteps[i + 1].cumulative_yield_to_end;
        }
    }

    const results = [];
    let currentCvArrival = 1;

    for (let i = 0; i < tempSteps.length; i++) {
        const s = tempSteps[i];
        s.step_index = i + 1;

        const effectiveAvailability = s.perf_rate * s.avail_rate;
        s.effective_time = s.std_proc_time / (s.perf_rate * s.avail_rate);
        s.theoretical_capacity = s.num_machines > 0 ? (availableTime / s.std_proc_time) * s.num_machines : 0;
        s.effective_capacity = s.num_machines > 0 ? (availableTime / s.effective_time) * s.num_machines : 0;
        s.oee_value = s.perf_rate * s.avail_rate * s.qual_rate;
        s.adjusted_demand = Math.max(0, demand / (s.cumulative_yield_to_end || 1));
        s.day_capacity = s.effective_capacity;
        s.utilization = s.effective_capacity > 0 ? s.adjusted_demand / s.effective_capacity : 0;
        s.projected_utilization = s.utilization / targetUtil;
        s.is_overloaded = s.projected_utilization > 1;
        s.additional_machines = s.is_overloaded ? Math.ceil((s.adjusted_demand / targetUtil / (availableTime / s.effective_time) - s.num_machines)) : 0;
        s.total_machines_needed = Math.max(s.num_machines, s.num_machines + s.additional_machines);
        s.recommended_days = s.effective_capacity > 0 ? Math.ceil(s.adjusted_demand / s.effective_capacity) : 0;
        s.current_cv_arrival = currentCvArrival;

        function calcWipDetails(utilization, currentCvArrival, cvProc, effTime, machines, localDemand, availTime, handlingUnit) {
            const outputRate = machines > 0 ? localDemand / availTime : 0;
            const waitTime = effTime * Math.max(0, utilization - 1);
            const localDemandRate = localDemand > 0 ? localDemand : 1;
            const throughputRate = localDemand / availTime;

            const base = effTime * throughputRate;
            const queue = waitTime * throughputRate;
            const total = base + queue;
            return { base, queue, total };
        }

        const curr = calcWipDetails(s.utilization, s.current_cv_arrival, s.cv_proc, s.effective_time, s.num_machines, s.adjusted_demand, availableTime, s.handling_unit);
        s.base_wip = curr.base;
        s.queue_wip = curr.queue;
        s.target_wip = curr.total;

        const proj = calcWipDetails(s.projected_utilization, s.current_cv_arrival, s.cv_proc, s.effective_time, s.total_machines_needed, s.adjusted_demand, availableTime, s.handling_unit);
        s.base_wip_projected = proj.base;
        s.queue_wip_projected = proj.queue;
        s.target_wip_projected = proj.total;

        // 将WIP转换为HU单位（向上取整到HU的整数倍）
        s.wip_int = curr.total > 0 ? Math.ceil(curr.total / s.handling_unit) : 0;
        s.wip_int_proj = proj.total > 0 ? Math.ceil(proj.total / s.handling_unit) : 0;

        const calcUtil = Math.min(s.utilization, 0.999);
        currentCvArrival = Math.sqrt((calcUtil ** 2 * s.cv_proc ** 2) + ((1 - calcUtil ** 2) * s.current_cv_arrival ** 2));
        if (currentCvArrival < 0) currentCvArrival = 0.1;

        // === NEW: Calculate Production Days & Output ===
        // 设置的工作天数（从Settings来）
        s.scheduled_days = scheduledDays;

        // 计算基于设置天数的产出
        const secondsPerDayForCalc = shiftsPerDay * hoursPerShift * 3600;
        if (secondsPerDayForCalc > 0 && s.num_machines > 0 && s.effective_time > 0) {
            const availableSecondsScheduled = s.scheduled_days * secondsPerDayForCalc;
            s.output_based_on_scheduled_days = availableSecondsScheduled / s.effective_time * s.num_machines;
        } else {
            s.output_based_on_scheduled_days = 0;
        }

        // 计算基于建议天数的产出
        if (secondsPerDayForCalc > 0 && s.recommended_days > 0 && s.effective_time > 0) {
            const availableSecondsRecommended = s.recommended_days * secondsPerDayForCalc;
            s.output_based_on_recommended_days = availableSecondsRecommended / s.effective_time * s.num_machines;
        } else {
            s.output_based_on_recommended_days = s.adjusted_demand;
        }

        // === NEW: WIP Storage Calculation (基于转运间隔和上下工序节拍) ===
        const currentIdx = tempSteps.indexOf(s);
        let upstreamProcess = null;
        let transportInterval = 0.0;
        let upstreamHU = 1;

        // 向前查找上游工序和运输间隔
        for (let j = currentIdx - 1; j >= 0; j--) {
            const prevStep = tempSteps[j];
            if (!prevStep.is_transport) {
                upstreamProcess = prevStep;
                break;
            } else if (prevStep.is_transport) {
                transportInterval = prevStep.std_proc_time;
            }
        }

        // 计算WIP Storage需求
        // 逻辑：为了维持下游工序连续生产，需要WIP缓冲来应对：
        // 1. 节拍不匹配（上游产出速率 vs 下游消耗速率）
        // 2. 工序变异（CV）导致的波动
        // 3. 转运间隔导致的供应中断（如果存在）
        
        const shiftTotalTime = shiftsPerDay * hoursPerShift * 3600;
        
        if (upstreamProcess && shiftTotalTime > 0) {
            const upstreamEffectiveCycleTime = upstreamProcess.effective_time / upstreamProcess.num_machines;
            const downstreamEffectiveCycleTime = s.effective_time / s.num_machines;

            if (upstreamEffectiveCycleTime > 0 && downstreamEffectiveCycleTime > 0) {
                upstreamHU = upstreamProcess.handling_unit || 1;

                // 如果有转运间隔，考虑转运导致的供应中断
                if (transportInterval > 0) {
                    // 有中间转运的情况：考虑转运间隔和节拍差异
                    const arrivalsPerShift = shiftTotalTime / transportInterval;
                    const cvAdjustFactorWIP = Math.max(0.5, 1 - upstreamProcess.cv_proc * 0.2);
                    const upstreamProductionPerInterval = (transportInterval / upstreamEffectiveCycleTime) * cvAdjustFactorWIP;
                    const downstreamConsumptionPerInterval = transportInterval / downstreamEffectiveCycleTime;
                    const netConsumptionPerInterval = downstreamConsumptionPerInterval - upstreamProductionPerInterval;

                    if (netConsumptionPerInterval > 0) {
                        const totalNetDeficit = netConsumptionPerInterval * arrivalsPerShift;
                        // WIP Storage必须是HU的整数倍
                        s.wip_storage_hu = Math.ceil(Math.max(0, totalNetDeficit) / upstreamHU);
                        s.wip_storage_absolute = s.wip_storage_hu * upstreamHU;
                        s.wip_storage_upstream_name = extractEnglishName(upstreamProcess.name);  // 保存上游工序英文名称
                    } else {
                        s.wip_storage_absolute = 0;
                        s.wip_storage_hu = 0;
                        s.wip_storage_upstream_name = '';
                    }
                } else {
                    // 没有中间转运的情况：基于节拍不匹配和变异缓冲计算WIP
                    const upstreamProductionRate = 1.0 / upstreamEffectiveCycleTime;
                    const downstreamConsumptionRate = 1.0 / downstreamEffectiveCycleTime;

                    // 目标：确保下游能连续生产12小时（1个整班）
                    if (downstreamConsumptionRate > upstreamProductionRate) {
                        // 情况1：下游比上游快，需要初始WIP缓冲
                        const netConsumptionRate = downstreamConsumptionRate - upstreamProductionRate;
                        const targetContinuousHours = 12;
                        const targetContinuousSeconds = targetContinuousHours * 3600;
                        const initialWipNeeded = netConsumptionRate * targetContinuousSeconds;

                        // 考虑上游CV带来的变异缓冲需求
                        const variabilityBuffer = upstreamProcess.cv_proc * downstreamConsumptionRate * 3600;
                        const totalWipStorage = initialWipNeeded + variabilityBuffer;

                        s.wip_storage_hu = Math.ceil(Math.max(0, totalWipStorage) / upstreamHU);
                        s.wip_storage_absolute = s.wip_storage_hu * upstreamHU;
                        s.wip_storage_upstream_name = extractEnglishName(upstreamProcess.name);  // 保存上游工序英文名称
                    } else {
                        // 情况2：上游比下游快或持平
                        // 计算变异缓冲
                        const variabilityBuffer = upstreamProcess.cv_proc * downstreamConsumptionRate * 3600;

                        // 只有当变异缓冲足够大（超过0.5个HU）时才计算
                        // 避免极小值被向上取整为1 HU
                        if (variabilityBuffer > upstreamHU * 0.5) {
                            s.wip_storage_hu = Math.ceil(variabilityBuffer / upstreamHU);
                            s.wip_storage_absolute = s.wip_storage_hu * upstreamHU;
                            s.wip_storage_upstream_name = extractEnglishName(upstreamProcess.name);  // 保存上游工序英文名称
                        } else {
                            // 变异缓冲太小，不需要额外的WIP Storage
                            s.wip_storage_absolute = 0;
                            s.wip_storage_hu = 0;
                            s.wip_storage_upstream_name = '';
                        }
                    }
                }

                // 扩产后的WIP Storage
                const upstreamEffectiveCycleTimeProj = upstreamProcess.effective_time / upstreamProcess.num_machines;
                const downstreamEffectiveCycleTimeProj = s.effective_time / s.total_machines_needed;
                const upstreamHUProj = upstreamProcess.handling_unit || 1;  // 提前定义，供后续使用

                if (upstreamEffectiveCycleTimeProj > 0 && downstreamEffectiveCycleTimeProj > 0) {
                    if (transportInterval > 0) {
                        const cvAdjustFactorProj = Math.max(0.5, 1 - upstreamProcess.cv_proc * 0.2);
                        const upstreamProductionPerIntervalProj = (transportInterval / upstreamEffectiveCycleTimeProj) * cvAdjustFactorProj;
                        const downstreamConsumptionPerIntervalProj = transportInterval / downstreamEffectiveCycleTimeProj;
                        const netConsumptionPerIntervalProj = downstreamConsumptionPerIntervalProj - upstreamProductionPerIntervalProj;

                        if (netConsumptionPerIntervalProj > 0) {
                            const arrivalsPerShift = shiftTotalTime / transportInterval;
                            const totalNetDeficitProj = netConsumptionPerIntervalProj * arrivalsPerShift;
                            s.wip_storage_hu_proj = Math.ceil(Math.max(0, totalNetDeficitProj) / upstreamHUProj);
                            s.wip_storage_absolute_proj = s.wip_storage_hu_proj * upstreamHUProj;
                            s.wip_storage_upstream_name = extractEnglishName(upstreamProcess.name);  // 保存上游工序英文名称
                        } else {
                            s.wip_storage_absolute_proj = 0;
                            s.wip_storage_hu_proj = 0;
                        }
                    } else {
                        const upstreamProductionRateProj = 1.0 / upstreamEffectiveCycleTimeProj;
                        const downstreamConsumptionRateProj = 1.0 / downstreamEffectiveCycleTimeProj;

                        if (downstreamConsumptionRateProj > upstreamProductionRateProj) {
                            const netConsumptionRateProj = downstreamConsumptionRateProj - upstreamProductionRateProj;
                            const targetContinuousHours = 12;
                            const targetContinuousSeconds = targetContinuousHours * 3600;
                            const initialWipNeededProj = netConsumptionRateProj * targetContinuousSeconds;
                            const variabilityBufferProj = upstreamProcess.cv_proc * downstreamConsumptionRateProj * 3600;
                            const totalWipStorageProj = initialWipNeededProj + variabilityBufferProj;
                            
                            s.wip_storage_hu_proj = Math.ceil(Math.max(0, totalWipStorageProj) / upstreamHUProj);
                            s.wip_storage_absolute_proj = s.wip_storage_hu_proj * upstreamHUProj;
                            s.wip_storage_upstream_name = extractEnglishName(upstreamProcess.name);  // 保存上游工序英文名称
                        } else {
                            const variabilityBufferProj = upstreamProcess.cv_proc * downstreamConsumptionRateProj * 3600;
                            if (variabilityBufferProj > upstreamHUProj * 0.5) {
                                s.wip_storage_hu_proj = Math.ceil(variabilityBufferProj / upstreamHUProj);
                                s.wip_storage_absolute_proj = s.wip_storage_hu_proj * upstreamHUProj;
                                s.wip_storage_upstream_name = extractEnglishName(upstreamProcess.name);  // 保存上游工序英文名称
                            } else {
                                s.wip_storage_absolute_proj = 0;
                                s.wip_storage_hu_proj = 0;
                            }
                        }
                    }
                } else {
                    s.wip_storage_absolute_proj = 0;
                    s.wip_storage_hu_proj = 0;
                }
            } else {
                s.wip_storage_absolute = 0;
                s.wip_storage_hu = 0;
                s.wip_storage_absolute_proj = 0;
                s.wip_storage_hu_proj = 0;
            }
        } else {
            s.wip_storage_absolute = 0;
            s.wip_storage_hu = 0;
            s.wip_storage_absolute_proj = 0;
            s.wip_storage_hu_proj = 0;
        }
        results.push(s);
    }

    return { results, taktTime: taktTimeFinal };
}

function getStatus(utilization, isOverloaded) {
    if (isOverloaded) return "🔴 超载 (Overloaded)";
    if (utilization > 0.85) return "🟡 高风险 (High Risk)";
    return "🟢 健康 (Healthy)";
}

// ========== 前端交互逻辑 ==========

const defaultProcesses = [
    {name: "Laser Cutting", time: 300.0, machines: 2, perf: 0.90, avail: 0.95, qual: 0.98, cv: 0.3, hu: 50, allocPct: 100},
    {name: "Manual Welding", time: 720.0, machines: 3, perf: 0.85, avail: 0.90, qual: 0.95, cv: 0.6, hu: 20, allocPct: 100},
    {name: "Component Assembly", time: 480.0, machines: 2, perf: 0.92, avail: 0.96, qual: 0.99, cv: 0.4, hu: 30, allocPct: 100},
    {name: "Final Packaging", time: 180.0, machines: 1, perf: 0.95, avail: 0.98, qual: 0.99, cv: 0.2, hu: 100, allocPct: 100}
];

// 存储运输配置
let transportConfigs = [];

document.addEventListener('DOMContentLoaded', () => {
    defaultProcesses.forEach((proc, index) => addProcessRow(proc));
    // 初始化默认的运输配置
    updateTransportConfigs();
});

function addProcessRow(data = null) {
    const container = document.getElementById('processContainer');
    const processIndex = container.querySelectorAll('.process-row').length;
    const rowId = `process-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const row = document.createElement('div');
    row.className = 'process-row';
    row.id = rowId;
    row.dataset.type = 'process';

    row.innerHTML = `
        <div class="row align-items-center">
            <div class="col-12 col-md-2 mb-2 mb-md-0">
                <label class="form-label small text-muted">Name / 工序名称</label>
                <input type="text" class="form-control proc-name" value="${data ? data.name : ''}" placeholder="工序名称">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">C.T.(s) / 节拍 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control cycle-time" value="${data ? data.time : ''}" placeholder="秒" min="0" step="0.1">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">Machines / 机器数 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control machines" value="${data ? data.machines : ''}" placeholder="台数" min="1">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">Perf / 性能 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control perf-rate" value="${data ? data.perf : ''}" placeholder="0-1" min="0" max="1" step="0.01">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">Avail / 可用性 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control avail-rate" value="${data ? data.avail : ''}" placeholder="0-1" min="0" max="1" step="0.01">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">Qual / 良率 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control qual-rate" value="${data ? data.qual : ''}" placeholder="0-1" min="0" max="1" step="0.01">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">CV / 变异 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control cv-proc" value="${data ? data.cv : ''}" placeholder="0-2" min="0" max="2" step="0.1">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">HU / 包装单位 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control handling-unit" value="${data ? data.hu : '1'}" placeholder="件/HU" min="1" step="1">
            </div>
            <div class="col-6 col-md-1 mb-2 mb-md-0">
                <label class="form-label small text-muted">Alloc. % / 分配比例 <span class="badge bg-success data-source-badge" title="数据来源：手动输入 / Manual">M</span></label>
                <input type="number" class="form-control allocation-pct" value="${data ? data.allocPct || 100 : 100}" placeholder="%" min="0" max="100" step="1">
            </div>
            <div class="col-12 col-md-1 d-flex align-items-end gap-2">
                <button class="btn btn-outline-secondary btn-sm btn-transport-toggle" onclick="toggleTransport(this)" title="启用/禁用此工序后的运输">
                    <i class="bi bi-truck"></i> 运输: <span class="transport-status">关</span>
                </button>
                <button class="btn btn-danger btn-sm btn-remove" onclick="removeProcessRow('${rowId}')"><i class="bi bi-trash"></i></button>
            </div>
        </div>
    `;
    container.appendChild(row);
    
    // 添加运输配置行（默认禁用）
    addTransportConfigRow(row, false);
    
    updateTransportConfigs();
}

function addTransportConfigRow(processRow, enabled = false) {
    const container = document.getElementById('processContainer');
    const transportRow = document.createElement('div');
    transportRow.className = 'transport-config-row';
    transportRow.dataset.type = 'transport';
    transportRow.dataset.afterProcess = processRow.id;
    transportRow.style.display = enabled ? 'block' : 'none';
    
    // 获取前后工序名称
    const processName = processRow.querySelector('.proc-name').value || '未命名';
    
    transportRow.innerHTML = `
        <div class="row align-items-center">
            <div class="col-12 col-md-3 mb-2 mb-md-0">
                <div class="d-flex align-items-center">
                    <span class="transport-arrow"><i class="bi bi-truck"></i></span>
                    <div>
                        <div class="transport-label">运输配置</div>
                        <small class="text-muted transport-route-label">从 "${processName}" 到下一工序</small>
                    </div>
                </div>
            </div>
            <div class="col-6 col-md-2 mb-2 mb-md-0">
                <label class="form-label small transport-label">Transport Time / 运输时间 (秒)</label>
                <input type="number" class="form-control transport-time" value="30" min="0" step="1" ${!enabled ? 'disabled' : ''}>
            </div>
            <div class="col-6 col-md-2 mb-2 mb-md-0">
                <label class="form-label small transport-label">Transport CV / 运输变异系数</label>
                <input type="number" class="form-control transport-cv" value="0.5" min="0" max="2" step="0.1" ${!enabled ? 'disabled' : ''}>
            </div>
            <div class="col-12 col-md-3 mb-2 mb-md-0">
                <small class="text-muted">
                    <i class="bi bi-info-circle"></i> 
                    运输时间影响工序间的等待时间和在制品数量
                </small>
            </div>
            <div class="col-12 col-md-2 d-flex justify-content-end">
                <button class="btn btn-sm btn-outline-danger" onclick="toggleTransportFromRow(this)" ${!enabled ? 'style="display:none"' : ''}>
                    <i class="bi bi-x-circle"></i> 禁用此运输
                </button>
            </div>
        </div>
    `;
    
    // 在工序行之后插入
    processRow.after(transportRow);
}

function toggleTransport(btn) {
    const processRow = btn.closest('.process-row');
    const transportRow = processRow.nextElementSibling;
    
    if (transportRow && transportRow.dataset.type === 'transport') {
        const isEnabled = transportRow.style.display !== 'none';
        transportRow.style.display = isEnabled ? 'none' : 'block';
        
        // 更新按钮状态
        const statusSpan = btn.querySelector('.transport-status');
        statusSpan.textContent = isEnabled ? '关' : '开';
        btn.classList.toggle('active', !isEnabled);
        
        // 启用/禁用输入框
        const inputs = transportRow.querySelectorAll('input');
        inputs.forEach(input => input.disabled = isEnabled);
        
        // 显示/禁用按钮
        const disableBtn = transportRow.querySelector('.btn-outline-danger');
        if (disableBtn) {
            disableBtn.style.display = isEnabled ? 'none' : 'inline-block';
        }
        
        updateTransportConfigs();
    }
}

function toggleTransportFromRow(btn) {
    const transportRow = btn.closest('.transport-config-row');
    const processRow = transportRow.previousElementSibling;
    const toggleBtn = processRow.querySelector('.btn-transport-toggle');
    
    if (toggleBtn) {
        toggleTransport(toggleBtn);
    }
}

function updateTransportConfigs() {
    const container = document.getElementById('processContainer');
    const processRows = container.querySelectorAll('.process-row');
    const transportRows = container.querySelectorAll('.transport-config-row');
    
    // 更新运输行的路线标签
    transportRows.forEach((transportRow, index) => {
        const processRow = transportRow.previousElementSibling;
        if (processRow && processRow.dataset.type === 'process') {
            const fromName = processRow.querySelector('.proc-name').value || '未命名';
            
            // 找到下一个工序作为终点
            let toName = '下一工序';
            let nextRow = transportRow.nextElementSibling;
            while (nextRow) {
                if (nextRow.dataset.type === 'process') {
                    toName = nextRow.querySelector('.proc-name').value || '未命名';
                    break;
                }
                nextRow = nextRow.nextElementSibling;
            }
            
            const label = transportRow.querySelector('.transport-route-label');
            if (label) {
                label.textContent = `从 "${fromName}" 到 "${toName}"`;
            }
        }
    });
}

function removeProcessRow(rowId) {
    const row = document.getElementById(rowId);
    if (row && confirm('Delete this process? / 确定要删除此工序吗？')) {
        const transportRow = row.nextElementSibling;
        if (transportRow && transportRow.dataset.type === 'transport') {
            transportRow.remove();
        }
        row.remove();
        updateTransportConfigs();
    }
}

function resetForm() {
    if (confirm('Reset all data? / 确定要重置表单吗？所有数据将被清除。')) {
        document.getElementById('demand1').value = 2000;
        document.getElementById('demand2').value = 2200;
        document.getElementById('demand3').value = 2500;
        document.getElementById('days1').value = 22;
        document.getElementById('days2').value = 21;
        document.getElementById('days3').value = 23;
        document.getElementById('shifts').value = 2;
        document.getElementById('hoursPerShift').value = 12;
        document.getElementById('targetUtil').value = 0.85;
        document.getElementById('processContainer').innerHTML = '';
        document.getElementById('resultsSection').style.display = 'none';
        defaultProcesses.forEach(proc => addProcessRow(proc));
    }
}

// ========== 班次和工时联动验证 ==========

function validateShiftsAndHours() {
    const shiftsInput = document.getElementById('shifts');
    const hoursInput = document.getElementById('hoursPerShift');
    const warningDiv = document.getElementById('shiftHoursWarning');
    const warningText = document.getElementById('shiftHoursWarningText');

    let shifts = parseInt(shiftsInput.value) || 0;
    let hours = parseFloat(hoursInput.value) || 0;

    // 规则1: 每日班次不能超过3个
    if (shifts > 3) {
        shifts = 3;
        shiftsInput.value = 3;
    }

    // 规则2: 每班工时不能超过12小时
    if (hours > 12) {
        hours = 12;
        hoursInput.value = 12;
    }

    // 规则3: 班次和工时关联限制
    // 2班制：每班≤12小时
    // 3班制：每班≤8小时
    let maxHours = 12;
    if (shifts === 3) {
        maxHours = 8;
    }

    let hasWarning = false;
    let warningMessage = '';

    if (shifts === 3 && hours > 8) {
        hours = 8;
        hoursInput.value = 8;
        warningMessage = '3班制时，每班工时不能超过8小时。已自动调整为8小时。';
        hasWarning = true;
    } else if (shifts === 2 && hours > 12) {
        // 这个情况已经被上面的规则2拦截，但保留以防逻辑变更
        hours = 12;
        hoursInput.value = 12;
        warningMessage = '每班工时不能超过12小时。已自动调整为12小时。';
        hasWarning = true;
    } else if (shifts > 3) {
        warningMessage = '每日班次不能超过3班。已自动调整为3班。';
        hasWarning = true;
    }

    // 显示/隐藏警告
    if (hasWarning) {
        warningText.textContent = warningMessage;
        warningDiv.style.display = 'block';
        setTimeout(() => {
            warningDiv.style.display = 'none';
        }, 5000);
    } else {
        warningDiv.style.display = 'none';
    }
}

function calculate() {
    try {
        const processes = collectProcessData();
        const settings = collectSettingsData();

        if (!validateData(processes, settings)) {
            alert('Please check input data. / 请检查输入数据，确保所有必填字段都已正确填写。');
            return;
        }

        // 构建步骤列表（含独立配置的运输步骤）
        const steps = [];
        const container = document.getElementById('processContainer');
        const processRows = container.querySelectorAll('.process-row');

        for (let i = 0; i < processRows.length; i++) {
            const procRow = processRows[i];
            const proc = processes[i];

            // 添加工序步骤
            steps.push({
                name: proc.name,
                std_proc_time: proc.cycle_time,
                num_machines: proc.num_machines,
                perf_rate: proc.perf_rate,
                avail_rate: proc.avail_rate,
                qual_rate: proc.qual_rate,
                cv_proc: proc.cv_proc,
                is_transport: false,
                handling_unit: proc.handling_unit,
                allocation_percentage: proc.allocation_percentage  // 优化4：分配百分比
            });

            // 检查此工序后的运输配置
            const transportRow = procRow.nextElementSibling;
            if (transportRow && transportRow.dataset.type === 'transport' && transportRow.style.display !== 'none') {
                // 获取下一工序名称
                let nextProcName = '终点';
                let nextRow = transportRow.nextElementSibling;
                while (nextRow) {
                    if (nextRow.dataset.type === 'process') {
                        nextProcName = nextRow.querySelector('.proc-name').value || '未命名';
                        break;
                    }
                    nextRow = nextRow.nextElementSibling;
                }

                // 读取独立运输配置
                const transportTime = parseFloat(transportRow.querySelector('.transport-time').value) || 0;
                const transportCV = parseFloat(transportRow.querySelector('.transport-cv').value) || 0.5;

                if (transportTime > 0) {
                    steps.push({
                        name: `运输 (${proc.name}→${nextProcName})`,
                        std_proc_time: transportTime,
                        num_machines: 1,
                        perf_rate: 1.0,
                        avail_rate: 1.0,
                        qual_rate: 1.0,
                        cv_proc: transportCV,
                        is_transport: true
                    });
                }
            }
        }

        const shifts = settings.shifts;
        const hoursPerShift = settings.hours_per_shift;
        const targetUtil = settings.target_util;

        // 计算三个月的数据
        const allResults = [];
        const monthLabels = ['N+1月', 'N+2月', 'N+3月'];

        for (let monthIdx = 0; monthIdx < 3; monthIdx++) {
            const demand = settings.demands[monthIdx];
            const days = settings.days_list[monthIdx];
            const availableTime = days * shifts * hoursPerShift * 3600;

            const { results, taktTime } = calculateWipScenario(
                steps,
                demand,
                availableTime,
                targetUtil,
                shifts,
                hoursPerShift,
                days  // scheduledDays
            );

            allResults.push({
                month: monthLabels[monthIdx],
                demand: demand,
                days: days,
                results: results,
                taktTime: taktTime
            });
        }

        displayResults(allResults, settings, shifts, hoursPerShift, targetUtil);
    } catch (e) {
        alert('Calculation Error / 计算出错：' + e.message);
        console.error(e);
    }
}

function collectProcessData() {
    const rows = document.querySelectorAll('.process-row');
    const processes = [];
    rows.forEach(row => {
        const cycleTimeVal = row.querySelector('.cycle-time').value;
        const machinesVal = row.querySelector('.machines').value;
        const perfVal = row.querySelector('.perf-rate').value;
        const availVal = row.querySelector('.avail-rate').value;
        const qualVal = row.querySelector('.qual-rate').value;
        const cvVal = row.querySelector('.cv-proc').value;
        const huVal = row.querySelector('.handling-unit').value;
        const allocPctVal = row.querySelector('.allocation-pct') ? row.querySelector('.allocation-pct').value : 100;

        processes.push({
            name: row.querySelector('.proc-name').value,
            cycle_time: cycleTimeVal !== '' ? parseFloat(cycleTimeVal) : NaN,
            num_machines: machinesVal !== '' ? parseInt(machinesVal) : NaN,
            perf_rate: perfVal !== '' ? parseFloat(perfVal) : NaN,
            avail_rate: availVal !== '' ? parseFloat(availVal) : NaN,
            qual_rate: qualVal !== '' ? parseFloat(qualVal) : NaN,
            cv_proc: cvVal !== '' ? parseFloat(cvVal) : NaN,
            handling_unit: huVal !== '' ? parseInt(huVal) : 1,
            allocation_percentage: allocPctVal !== '' ? parseFloat(allocPctVal) : 100
        });
    });
    return processes;
}

function collectSettingsData() {
    const demands = [
        parseFloat(document.getElementById('demand1').value),
        parseFloat(document.getElementById('demand2').value),
        parseFloat(document.getElementById('demand3').value)
    ];
    const days = [
        parseInt(document.getElementById('days1').value),
        parseInt(document.getElementById('days2').value),
        parseInt(document.getElementById('days3').value)
    ];

    return {
        demands: demands,
        days_list: days,
        shifts: parseInt(document.getElementById('shifts').value),
        hours_per_shift: parseFloat(document.getElementById('hoursPerShift').value),
        target_util: parseFloat(document.getElementById('targetUtil').value)
    };
}

function validateData(processes, settings) {
    if (processes.length === 0) {
        console.warn('No processes found');
        return false;
    }
    for (let i = 0; i < processes.length; i++) {
        const proc = processes[i];
        if (!proc.name) { console.warn(`Process ${i+1} missing name`); return false; }
        if (isNaN(proc.cycle_time)) { console.warn(`Process ${i+1} invalid cycle_time:`, proc.cycle_time); return false; }
        if (isNaN(proc.num_machines)) { console.warn(`Process ${i+1} invalid num_machines:`, proc.num_machines); return false; }
        if (isNaN(proc.perf_rate)) { console.warn(`Process ${i+1} invalid perf_rate:`, proc.perf_rate); return false; }
        if (isNaN(proc.avail_rate)) { console.warn(`Process ${i+1} invalid avail_rate:`, proc.avail_rate); return false; }
        if (isNaN(proc.qual_rate)) { console.warn(`Process ${i+1} invalid qual_rate:`, proc.qual_rate); return false; }
    }
    if (isNaN(settings.demands[0]) || isNaN(settings.demands[1]) || isNaN(settings.demands[2])) { console.warn('Invalid demands'); return false; }
    if (isNaN(settings.days_list[0]) || isNaN(settings.days_list[1]) || isNaN(settings.days_list[2])) { console.warn('Invalid days'); return false; }
    if (isNaN(settings.shifts)) { console.warn('Invalid shifts'); return false; }
    if (isNaN(settings.hours_per_shift)) { console.warn('Invalid hours_per_shift'); return false; }
    if (isNaN(settings.target_util)) { console.warn('Invalid target_util'); return false; }
    return true;
}

function displayResults(allResults, settings, shifts, hoursPerShift, targetUtil) {
    document.getElementById('resultsSection').style.display = 'block';

    const monthLabels = ['N+1月', 'N+2月', 'N+3月'];
    let allMonthHtml = '';

    for (let m = 0; m < 3; m++) {
        const monthData = allResults[m];
        const results = monthData.results;
        const monthLabel = monthData.month;

        // 计算摘要
        let procCount = 0;
        let totalNewMachines = 0;
        let totalWipStorageAbsolute = 0;
        let totalWipStorageHU = 0;
        let maxUtilization = 0;
        let bottleneck = 'None';
        let globalRecommendedDays = 0;
        const overloadedProcesses = [];
        const wipStorageDetails = [];  // 存储每个工序的WIP Storage明细

        const displayData = [];

        for (const r of results) {
            if (!r.is_transport) {
                procCount++;
                r.step_index = procCount;
            } else {
                r.step_index = null;
            }

            const status = getStatus(r.utilization, r.is_overloaded);

            if (r.is_overloaded) totalNewMachines += r.additional_machines;

            // 累加WIP Storage（仅非运输工序）
            if (!r.is_transport) {
                totalWipStorageAbsolute += r.wip_storage_absolute_proj || 0;
                totalWipStorageHU += r.wip_storage_hu_proj || 0;
                
                // 记录WIP Storage明细
                if (r.wip_storage_hu_proj > 0) {
                    wipStorageDetails.push({
                        hu: r.wip_storage_hu_proj,
                        name: extractEnglishName(r.name)  // 使用英文名称
                    });
                }
            }

            if (!r.is_transport && r.utilization > maxUtilization) {
                maxUtilization = r.utilization;
                bottleneck = r.name;
            }

            if (r.recommended_days !== null && r.recommended_days > globalRecommendedDays) {
                globalRecommendedDays = r.recommended_days;
            }

            let exceedsMaxDays = false;
            let additionalMachinesForDays = 0;
            if (!r.is_transport && r.recommended_days > monthData.days) {
                exceedsMaxDays = true;
                const secondsPerDay = shifts * hoursPerShift * 3600;
                const totalRequiredSeconds = r.adjusted_demand * r.effective_time;
                const availableSeconds = monthData.days * secondsPerDay;
                const requiredMachines = Math.ceil(totalRequiredSeconds / (availableSeconds * targetUtil));
                additionalMachinesForDays = requiredMachines - r.num_machines;

                overloadedProcesses.push({
                    name: r.name,
                    recommendedDays: r.recommended_days,
                    additionalMachines: additionalMachinesForDays
                });
            }

            displayData.push({
                step_index: r.step_index, name: r.name, std_proc_time: r.std_proc_time,
                oee_value: r.oee_value, day_capacity: r.day_capacity, qual_rate: r.qual_rate,
                adjusted_demand: Math.round(r.adjusted_demand),
                num_machines: r.num_machines,
                utilization: r.utilization, additional_machines: r.is_overloaded ? r.additional_machines : 0,
                projected_utilization: r.projected_utilization, recommended_days: r.recommended_days,
                handling_unit: r.handling_unit,
                target_wip: r.wip_int_proj, status: status, is_transport: r.is_transport,
                exceeds_max_days: exceedsMaxDays, additional_for_max_days: additionalMachinesForDays,
                // 新增字段
                scheduled_days: r.scheduled_days,
                output_based_on_scheduled_days: r.output_based_on_scheduled_days,
                output_based_on_recommended_days: r.output_based_on_recommended_days,
                wip_storage_absolute: r.wip_storage_absolute,
                wip_storage_hu: r.wip_storage_hu,
                wip_storage_absolute_proj: r.wip_storage_absolute_proj || 0,
                wip_storage_hu_proj: r.wip_storage_hu_proj || 0,
                wip_storage_upstream_name: r.wip_storage_upstream_name || '',  // 上游工序名称
                allocation_percentage: r.allocation_percentage || 100  // 优化4：分配百分比
            });
        }

        let totalTransportTime = 0;
        for (const r of results) {
            if (r.is_transport) {
                totalTransportTime += r.std_proc_time;
            }
        }

        let warningHtml = '';
        if (overloadedProcesses.length > 0) {
            warningHtml = `
                <div class="alert alert-warning mb-3">
                    <i class="bi bi-exclamation-triangle"></i>
                    <strong>Schedule Exceeds Max Days:</strong><br>
                    The following processes require more days than available (${monthData.days} days). Additional machines are needed to complete on schedule:<br>
                    <ul class="mb-0 mt-2">
                        ${overloadedProcesses.map(p => `<li><strong>${p.name}</strong>: Recommended ${p.recommendedDays} days, requires <strong>${p.additionalMachines}</strong> additional machine(s)</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        allMonthHtml += `
            <div class="tab-pane fade" id="month${m}" role="tabpanel">
                <div class="card mt-3">
                    <div class="card-header"><i class="bi bi-table"></i> Detailed Results / 详细分析结果 — ${monthLabel} (Demand: ${Math.round(monthData.demand)} 件 / Max Days: ${monthData.days} 天)</div>
                    <div class="card-body">
                ${warningHtml}
                <div class="row mb-4">
                    <div class="col-md-4">
                        <div class="summary-card">
                            <div class="summary-label">Global Rec. Days / 全局建议天数</div>
                            ${globalRecommendedDays > 31 ? `
                                <div class="summary-value" style="color: #ff6b6b">${globalRecommendedDays}⚠️</div>
                                <div class="summary-label">超可用天数 (Max 31天) - 瓶颈决定</div>
                            ` : `
                                <div class="summary-value">${globalRecommendedDays}</div>
                                <div class="summary-label">天 (days) - 瓶颈决定</div>
                            `}
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="summary-card">
                            <div class="summary-label">Bottleneck / 瓶颈工序</div>
                            <div class="summary-value" style="font-size:1rem">${bottleneck}</div>
                            <div class="summary-label">利用率: ${(maxUtilization * 100).toFixed(1)}%</div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="summary-card">
                            <div class="summary-label">Total WIP Storage / 总WIP存储</div>
                            <div class="summary-value" style="font-size:1.5rem">${Math.round(totalWipStorageAbsolute)}</div>
                            <div class="summary-label">件 (${totalWipStorageHU} HU)</div>
                            ${wipStorageDetails.length > 0 ? `
                                <div class="summary-label" style="font-size:0.7rem; margin-top:8px; line-height:1.4">
                                    ${wipStorageDetails.map(d => `${d.hu}HU/${d.name}`).join(' + ')}
                                </div>
                            ` : ''}
                        </div>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-striped table-hover result-table">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Process Name / 工序名称</th>
                                <th>C.T.(s)</th>
                                <th>OEE (with breaks)</th>
                                <th>Day Capa.</th>
                                <th>Qual</th>
                                <th>Adj. Demand</th>
                                <th>Scheduled Days</th>
                                <th>Output (Scheduled)</th>
                                <th>Rec. Days</th>
                                <th>Output (Recommended)</th>
                                <th>Machines</th>
                                <th>Utilization</th>
                                <th>Proj. Util.</th>
                                <th>HU</th>
                                <th>Alloc. %</th>
                                <th>WIP Storage (pcs & HU)</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${buildTableRows(displayData)}
                        </tbody>
                    </table>
                </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 使用选项卡显示三个月
    document.getElementById('summaryCards').innerHTML = `
        <ul class="nav nav-tabs mb-3" id="monthTabs" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="month0-tab" data-bs-toggle="tab" data-bs-target="#month0" type="button" role="tab"><i class="bi bi-calendar-month"></i> N+1月</button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="month1-tab" data-bs-toggle="tab" data-bs-target="#month1" type="button" role="tab"><i class="bi bi-calendar-month"></i> N+2月</button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="month2-tab" data-bs-toggle="tab" data-bs-target="#month2" type="button" role="tab"><i class="bi bi-calendar-month"></i> N+3月</button>
            </li>
        </ul>
        <div class="tab-content" id="monthTabsContent">
            ${allMonthHtml.replace(/tab-pane fade/g, (match, offset) => offset === 0 ? 'tab-pane fade show active' : 'tab-pane fade')}
        </div>
    `;

    document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

function buildTableRows(displayData) {
    let html = '';
    displayData.forEach(step => {
        let rowClass = step.is_transport ? 'transport-row' : 'process-row-highlight';
        let statusClass = '';
        if (step.status.includes('健康')) statusClass = 'status-healthy';
        else if (step.status.includes('高风险')) statusClass = 'status-high-risk';
        else if (step.status.includes('超载')) statusClass = 'status-overloaded';

        let nameContent = step.name;
        let idContent = step.step_index !== null ? step.step_index : '-';

        // 优先显示英文名称
        nameContent = extractEnglishName(step.name);

        if (step.is_transport) {
            const match = step.name.match(/运输 \((.+?)→(.+?)\)/);
            if (match) {
                const fromName = extractEnglishName(match[1]);
                const toName = extractEnglishName(match[2]);
                nameContent = `<span class="transport-icon"><i class="bi bi-truck"></i></span> <span class="transport-name">${fromName} → ${toName}</span>`;
            } else {
                nameContent = `<span class="transport-icon"><i class="bi bi-truck"></i></span> <span class="transport-name">${extractEnglishName(step.name)}</span>`;
            }
            idContent = '<i class="bi bi-arrow-right-short text-muted"></i>';
        }

        let recDaysContent;
        if (step.is_transport) {
            recDaysContent = '<span class="text-muted">-</span>';
        } else if (step.scheduled_days < step.recommended_days) {
            // 设定天数 < 推荐天数：红字提示
            recDaysContent = `<span class="text-danger fw-bold">${step.recommended_days}⚠️</span>`;
        } else {
            recDaysContent = `<span class="fw-bold">${step.recommended_days}</span>`;
        }

        // 新增列的内容
        let scheduledDaysContent = step.is_transport ? '<span class="text-muted">-</span>' : `${step.scheduled_days}`;
        let outputScheduledContent = step.is_transport ? '<span class="text-muted">-</span>' : Math.round(step.output_based_on_scheduled_days).toLocaleString();
        let outputRecommendedContent = step.is_transport ? '<span class="text-muted">-</span>' : Math.round(step.output_based_on_recommended_days).toLocaleString();

        // 优化3：Machines栏显示需增设备（仅当利用率>100%时）
        let machinesContent;
        if (step.is_transport) {
            machinesContent = `<span class="text-muted">-</span>`;
        } else if (step.utilization > 1.0 && step.additional_machines > 0) {
            // 利用率超过100%，显示需增设备
            machinesContent = `${step.num_machines}<br><small class="text-danger fw-bold">+${step.additional_machines}台</small>`;
        } else {
            machinesContent = `${step.num_machines}`;
        }

        // 优化2：WIP Storage括号内显示上游工序名称
        // 显示当前的WIP Storage（非扩产后），避免受allocation_percentage影响
        let wipStorageContent = '-';
        if (!step.is_transport && step.wip_storage_absolute > 0) {
            const upstreamName = step.wip_storage_upstream_name || step.name;
            wipStorageContent = `${step.wip_storage_absolute.toFixed(1)}<br><small class="text-muted">(${step.wip_storage_hu}HU/${upstreamName})</small>`;
        } else if (!step.is_transport) {
            wipStorageContent = '0';
        }

        html += `
            <tr class="${rowClass}">
                <td class="text-center">${idContent}</td>
                <td>${nameContent}</td>
                <td class="text-center">${step.std_proc_time.toFixed(2)}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : (step.oee_value * 100).toFixed(1) + '%'}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : step.day_capacity.toLocaleString()}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : (step.qual_rate * 100).toFixed(1) + '%'}</td>
                <td class="text-center">${step.adjusted_demand}</td>
                <td class="text-center">${scheduledDaysContent}</td>
                <td class="text-center">${outputScheduledContent}</td>
                <td class="text-center">${recDaysContent}</td>
                <td class="text-center">${outputRecommendedContent}</td>
                <td class="text-center">${machinesContent}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : (step.utilization * 100).toFixed(1) + '%'}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : (step.projected_utilization * 100).toFixed(1) + '%'}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : step.handling_unit}</td>
                <td class="text-center">${step.is_transport ? '<span class="text-muted">-</span>' : (step.allocation_percentage || 100) + '%'}</td>
                <td class="text-center">${wipStorageContent}</td>
                <td class="${statusClass} text-center">${step.status}</td>
            </tr>
        `;
    });
    return html;
}
