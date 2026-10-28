import { formatNumber, formatOutputUnits } from "./number-format.js";
export function reportScale(review, outlook) {
    const values = [
        review.demandQty, review.mostLikelyPieces, review.bestCasePieces, review.actualPieces,
        outlook.demandQty, outlook.mostLikelyPieces, outlook.bestCasePieces,
    ].filter((value) => value !== undefined && value > 0);
    return values.length ? Math.max(...values) : 1;
}
export function renderRouteWeekSheets(input) {
    const scale = reportScale(input.review, input.outlook);
    const scaleLabel = formatOutputUnits(scale);
    return `${sheet(input, input.review, scale, scaleLabel, 1)}${sheet(input, input.outlook, scale, scaleLabel, 2)}`;
}
/** One concise decision page. A selected operation is never presented as route throughput. */
export function renderScopedWeekReport(input) {
    const { zh, review, outlook } = input;
    const operation = input.scope === "operation";
    const scopeName = operation ? (input.operationLabels[input.operationId ?? ""] ?? input.operationId ?? "") : (zh ? "完整工艺路径" : "Full route");
    const capacityName = operation ? (zh ? "工序成品等效能力" : "Operation finished-good equivalent") : (zh ? "路线成品能力" : "Route finished-good capacity");
    const bottleneck = outlook.flowLimited ? (zh ? "工站流转约束" : "Station flow constraint")
        : outlook.planBottleneckOperationId ? (input.operationLabels[outlook.planBottleneckOperationId] ?? outlook.planBottleneckOperationId) : "—";
    const summary = (plan, title) => `<tr><td>${escapeHtml(title)}</td><td>${escapeHtml(plan.weekStartDate)}</td><td>${pieces(plan.demandQty)}</td><td>${pieces(plan.bestCasePieces)}</td><td>${pieces(plan.mostLikelyPieces)}</td><td>${plan.planMargin === undefined ? "—" : signed(plan.planMargin)}</td><td>${pieces(plan.actualPieces)}</td></tr>`;
    const units = outlook.operations[0]?.unitsPerFinishedProduct;
    const stationEquivalent = (raw, share) => raw === undefined || share === undefined || !units
        ? "—" : pieces(Math.floor(raw * share / units + 1e-9));
    const detail = operation
        ? outlook.stations.map(station => `<tr><td>${escapeHtml(input.stationLabels[station.stationId] ?? station.stationId)}</td><td>${stationEquivalent(station.nativeBestRaw, station.shareApplied)}</td><td>${stationEquivalent(station.nativeMostLikelyRaw, station.shareApplied)}</td><td>${rate(station.withBreaksSa)}</td><td>${station.mixedParameters ? (zh ? "按日取版本" : "By day") : rate(station.performanceRate)}</td><td>${station.mixedParameters ? (zh ? "按日取版本" : "By day") : rate(station.qualityRate)}</td><td>${escapeHtml(station.reason ?? station.shareRule)}</td></tr>`).join("")
        : outlook.operations.map(item => `<tr><td>${escapeHtml(input.operationLabels[item.operationId] ?? item.operationId)}${item.isPlanBottleneck ? (zh ? " · 瓶颈" : " · bottleneck") : ""}</td><td>${pieces(item.bestFinishedPieces)}</td><td>${pieces(item.mostLikelyFinishedPieces)}</td><td colspan="3">${item.quantityIssue ? escapeHtml(item.quantityIssue) : item.unitsPerFinishedProduct === undefined ? "—" : (zh ? `每件成品需 ${formatNumber(item.unitsPerFinishedProduct)} 件` : `${formatNumber(item.unitsPerFinishedProduct)} units per finished piece`)}</td><td>${input.evidence.filter(e => e.operationId === item.operationId).length} / ${outlook.stations.filter(s => s.operationId === item.operationId).length}</td></tr>`).join("");
    const evidenceRows = input.evidence.map(item => `<tr><td>${escapeHtml(input.operationLabels[item.operationId] ?? item.operationId)} / ${escapeHtml(input.stationLabels[item.stationId] ?? item.stationId)}</td><td>${escapeHtml(item.sampleId.slice(0, 8))} · v${item.revision}</td><td>${escapeHtml(item.windowLabel ?? `${item.startMinute}–${item.endMinute}`)}</td><td>${item.plannedProductionMinutes === undefined ? "—" : formatNumber(item.plannedProductionMinutes)} / ${item.actualProductionMinutes === undefined ? "—" : formatNumber(item.actualProductionMinutes)}</td><td>${pieces(item.okQty)} / ${pieces(item.nokQty)}</td><td>${item.timeAccount === "complete" ? (zh ? "时间账完整" : "Timeline complete") : (zh ? "待补/无效" : "Incomplete/invalid")}</td></tr>`).join("");
    return `<article class="sheet scoped-report" data-report-page="${input.scope}" aria-label="${escapeHtml(scopeName)}">
    <header class="report-header"><div><p class="kicker">CAPACITY ASSESSMENT / INTERNAL</p><h1>${escapeHtml(scopeName)} · ${zh ? "能力与证据" : "Capacity and evidence"}</h1><p class="subtitle">${escapeHtml(input.productName)} · ${escapeHtml(input.routeId)} / ${escapeHtml(input.routeVersion ?? "-")} · ${escapeHtml(capacityName)}</p></div><div class="report-id"><strong>${zh ? "内部草稿" : "Internal draft"}</strong><br>${escapeHtml(input.generatedAt)}</div></header>
    <p class="note">${operation ? (zh ? "仅评价本工序；工序件数按阶段用量折为成品等效件数，不代表整条路线的可交付成品。" : "This operation only. Units are converted to finished-good equivalents, not route deliverable output.") : (zh ? "整条路线按工序用量与工站流转约束计算；逐工序仅列关键能力，工站细节留在工序报告。" : "Full route with operation quantities and station flow; station detail is in the operation report.")}</p>
    <section class="section"><div class="section-head"><h2>${zh ? "对照周与目标周" : "Comparison and target week"}</h2><span>${zh ? "Actual 仅接受完整同周实绩" : "Actual requires complete same-week records"}</span></div><div class="table-scroll"><table><thead><tr><th>${zh ? "周期" : "Period"}</th><th>${zh ? "周一" : "Monday"}</th><th>${zh ? "需求" : "Demand"}</th><th>Best case</th><th>Most likely</th><th>${zh ? "ML－需求" : "ML − demand"}</th><th>Actual</th></tr></thead><tbody>${summary(review, zh ? "对照周" : "Comparison")}${summary(outlook, zh ? "目标周" : "Target")}</tbody></table></div></section>
    ${operation ? "" : `<p class="note">${zh ? "目标周计划瓶颈：" : "Target-week plan bottleneck: "}<strong>${escapeHtml(bottleneck)}</strong></p>`}
    <section class="section"><div class="section-head"><h2>${operation ? (zh ? "工站参数与能力" : "Station parameters and capacity") : (zh ? "逐工序能力" : "Operation capacity")}</h2></div>${operation ? `<p class="note">${zh ? "工站 Best / Most likely 已按占用份额及阶段用量折为成品等效件数；汇总取原始值后再取整。" : "Station Best / Most likely are allocated and converted to finished-good equivalents; totals are rounded after summation."}</p>` : ""}<div class="table-scroll"><table><thead><tr><th>${operation ? (zh ? "工站" : "Station") : (zh ? "工序" : "Operation")}</th><th>Best</th><th>Most likely</th>${operation ? "<th>SA</th><th>P</th><th>Q</th>" : `<th colspan="3">${zh ? "阶段用量" : "Stage quantity"}</th>`}<th>${operation ? (zh ? "份额 / 状态" : "Share / status") : "R&R"}</th></tr></thead><tbody>${detail || `<tr><td colspan="7">—</td></tr>`}</tbody></table></div></section>
    ${renderPlannedSaSection(input)}
    ${renderSourceWindowEvidence(input)}
    <section class="section"><div class="section-head"><h2>${zh ? "R&R 选定样本" : "Selected R&R samples"}</h2><span>${zh ? `已选 ${input.evidence.length} 站 · 未选 ${input.missingStationIds.length} 站` : `${input.evidence.length} selected · ${input.missingStationIds.length} missing`}</span></div><p class="note">${zh ? "样本仅作同窗验证，不是整周 Actual；选样本不会直接改写有效 CT/P/Q。" : "Samples validate their observation windows; they are not weekly Actuals and do not change effective CT/P/Q."}</p>${operation ? `<div class="table-scroll"><table><thead><tr><th>${zh ? "工站" : "Station"}</th><th>${zh ? "样本" : "Sample"}</th><th>${zh ? "观察窗口" : "Window"}</th><th>${zh ? "计划 / 实际生产分钟" : "Planned / actual min"}</th><th>OK / NOK</th><th>${zh ? "时间账" : "Timeline"}</th></tr></thead><tbody>${evidenceRows || `<tr><td colspan="6">—</td></tr>`}</tbody></table></div>` : ""}${input.missingStationIds.length ? `<p class="note">${zh ? "待选样本：" : "Missing samples: "}${escapeHtml(input.missingStationIds.map(id => input.stationLabels[id] ?? id).join("、"))}</p>` : ""}</section>
    ${renderRnrRevisionDetails(input)}
    ${outlook.reasons.length ? `<p class="evidence">${zh ? "待处理：" : "Gaps: "}${escapeHtml(outlook.reasons.join("；"))}</p>` : ""}
    <footer class="footer">${zh ? "当前参数回算 · 非正式验收或客户产能承诺" : "Current-parameter recalculation · not a formal acceptance or customer commitment"} · ${escapeHtml(input.calculationVersion ?? (zh ? "旧快照：计算版本未封存" : "Legacy snapshot: calculation version missing"))}</footer>
  </article>`;
}
function reportMinute(minute) {
    return Number.isFinite(minute) ? new Date(minute * 60_000).toISOString().slice(0, 16).replace("T", " ") : "—";
}
function renderSourceWindowEvidence(input) {
    const { zh } = input;
    const rows = (input.saSources ?? []).map(source => {
        const name = `${input.operationLabels[source.operationId] ?? source.operationId} / ${input.stationLabels[source.stationId] ?? source.stationId}`;
        const frozen = source.frozenWindow;
        const state = source.status === "current" ? (zh ? "冻结源窗口有效" : "Frozen source current")
            : source.status === "stale" ? (zh ? "已变更，冻结源窗口过期" : "Frozen source stale")
                : (zh ? "未冻结源窗口" : "No frozen source");
        const events = frozen?.events ?? source.currentEvents;
        const eventRows = events.map(event => `<tr><td>${escapeHtml(event.kind)}</td><td>${escapeHtml(reportMinute(event.startMinute))}</td><td>${escapeHtml(reportMinute(event.endMinute))}</td><td>${escapeHtml(event.label ?? event.note ?? "—")}</td></tr>`).join("");
        return `<details><summary>${escapeHtml(name)} · ${escapeHtml(state)}${frozen ? ` · v${frozen.version}` : ""} · ${events.length} ${zh ? "段" : "intervals"}</summary>
      <p class="note">${source.status === "missing" ? (zh ? "下表为当时草稿时段，尚无冻结来源。" : "Draft intervals at capture time; no frozen source.") : (zh ? "下表为保存时的冻结源窗口；目标周排布以上方逐日周账为准。" : "Archived frozen source; the target week is defined by the daily ledger above.")}</p>
      <div class="table-scroll"><table><thead><tr><th>${zh ? "状态" : "Kind"}</th><th>${zh ? "开始" : "Start"}</th><th>${zh ? "结束" : "End"}</th><th>${zh ? "说明" : "Note"}</th></tr></thead><tbody>${eventRows || `<tr><td colspan="4">—</td></tr>`}</tbody></table></div></details>`;
    }).join("");
    return `<section class="section"><div class="section-head"><h2>${zh ? "标准 SA 源窗口证据" : "Standard SA source windows"}</h2></div>
    ${rows || `<p class="note">${zh ? "旧报告未封存源窗口原始时段。" : "Original source windows were not captured in this older report."}</p>`}</section>`;
}
function renderRnrRevisionDetails(input) {
    const { zh } = input;
    const rows = (input.selectedRnrRevisions ?? []).map(record => {
        const name = `${input.operationLabels[record.scope.operationId] ?? record.scope.operationId} / ${input.stationLabels[record.scope.stationId] ?? record.scope.stationId}`;
        let planned = [];
        let actual = [];
        try {
            const saved = JSON.parse(record.evidenceJson);
            if (Array.isArray(saved.snapshot?.plannedEvents))
                planned = saved.snapshot.plannedEvents;
            if (Array.isArray(saved.snapshot?.actualEvents))
                actual = saved.snapshot.actualEvents;
        }
        catch { /* Older malformed evidence remains marked unavailable. */ }
        const table = (events) => `<div class="table-scroll"><table><thead><tr><th>${zh ? "状态" : "Kind"}</th><th>${zh ? "开始" : "Start"}</th><th>${zh ? "结束" : "End"}</th><th>OK / NOK</th></tr></thead><tbody>${events.map(event => `<tr><td>${escapeHtml(event.kind)}</td><td>${escapeHtml(reportMinute(event.startMinute))}</td><td>${escapeHtml(reportMinute(event.endMinute))}</td><td>${event.kind === "production" ? `${escapeHtml(String(event.okQty ?? "—"))} / ${escapeHtml(String(event.nokQty ?? "—"))}` : "—"}</td></tr>`).join("") || `<tr><td colspan="4">—</td></tr>`}</tbody></table></div>`;
        return `<details><summary>${escapeHtml(name)} · ${escapeHtml(record.sampleId.slice(0, 8))} · v${record.revision} · ${escapeHtml(record.scope.equipmentId)}</summary>
      <p class="note">${zh ? "归档时的原始计划与实跑时段；仅为同窗证据，不是整周 Actual。" : "Archived planned and actual intervals; same-window evidence, not a full-week Actual."}</p>
      <h4>${zh ? "样本计划" : "Sample plan"}</h4>${table(planned)}<h4>${zh ? "实跑记录" : "Actual run"}</h4>${table(actual)}</details>`;
    }).join("");
    return `<section class="section"><div class="section-head"><h2>${zh ? "R&R 原始修订证据" : "Original R&R revisions"}</h2></div>
    ${rows || `<p class="note">${input.evidence.length ? (zh ? "旧报告仅保留样本摘要，未封存原始修订。" : "Older report preserved summaries only.") : (zh ? "尚未选择样本修订。" : "No sample revisions selected.")}</p>`}</section>`;
}
function renderPlannedSaSection(input) {
    const { zh } = input;
    const weeks = (input.plannedSaWeeks ?? []).filter(week => week.role === "outlook");
    const findWeek = (operationId, stationId) => weeks.find(week => week.operationId === operationId && week.stationId === stationId);
    const stationName = (operationId, stationId) => `${input.operationLabels[operationId] ?? operationId} / ${input.stationLabels[stationId] ?? stationId}`;
    const daily = (week, index) => {
        const day = week?.days[index];
        if (!day)
            return "—";
        if (day.stale)
            return zh ? "来源已变更" : "Stale source";
        if (day.mode === "off" || day.mode === "occupied")
            return day.mode === "off" ? (zh ? "未开班" : "Off") : (zh ? "跨日占用" : "Occupied");
        return `${formatNumber(day.productionMinutes)} / ${formatNumber(day.scheduledMinutes)} min`;
    };
    const rows = input.outlook.stations.map(station => {
        const week = findWeek(station.operationId, station.stationId);
        const name = escapeHtml(stationName(station.operationId, station.stationId));
        if (input.scope === "route")
            return `<tr><td>${name}</td>${Array.from({ length: 7 }, (_, index) => `<td>${escapeHtml(daily(week, index))}</td>`).join("")}<td>${week?.withBreaksSa === undefined ? "—" : rate(week.withBreaksSa)}</td></tr>`;
        if (!week)
            return `<tr><td>${name}</td><td colspan="8">${zh ? "本周 SA 周账缺失或来源已变更；请回 SA 界面重新生成。" : "Week SA ledger missing or source changed; regenerate it in SA."}</td></tr>`;
        return week.days.map(day => `<tr><td>${name}</td><td>${escapeHtml(day.date)}</td><td>${escapeHtml(day.mode === "copy" ? (zh ? "复制" : "Copy") : day.mode === "manual" ? (zh ? "手工" : "Manual") : day.mode === "off" ? (zh ? "未开班" : "Off") : (zh ? "跨日占用" : "Occupied"))}${day.stale ? (zh ? " · 来源已变更" : " · stale") : ""}</td><td>${formatNumber(day.scheduledMinutes)}</td><td>${formatNumber(day.productionMinutes)}</td><td>${formatNumber(day.breakMinutes)}</td><td>${formatNumber(day.setupMinutes)}</td><td>${formatNumber(day.maintenanceMinutes)}</td><td>${formatNumber(day.plannedStopMinutes)}</td></tr>`).join("");
    }).join("");
    const reserveSummary = weeks.map(week => {
        const planned = week.days.reduce((sum, day) => sum + (day.stale ? 0 : day.productionMinutes), 0);
        const projected = week.days.reduce((sum, day, index) => sum + (day.stale ? 0 : day.mostLikelyProductionMinutes !== undefined
            ? day.mostLikelyProductionMinutes : Math.max(0, day.productionMinutes -
            (day.mode === "copy" && week.sourceLossRate !== undefined
                ? day.productionMinutes * week.sourceLossRate : week.perShiftUnplanned * (week.shiftCounts[index] ?? 0)))), 0);
        const basis = zh
            ? `源窗口确认损失 ${formatNumber(week.acceptedLossMinutes ?? 0)} min，复制日损失率 ${rate(week.sourceLossRate)}；平稳日按已设动作选择相应损失`
            : `Accepted source loss ${formatNumber(week.acceptedLossMinutes ?? 0)} min; copied-day loss rate ${rate(week.sourceLossRate)}; stable days include losses for configured actions`;
        return `${stationName(week.operationId, week.stationId)}：${basis}${week.observedShiftCount === 0 ? (zh ? "（无观察，按 0 假设）" : " (no observation; assumed zero)") : ""}${(week.pendingLossMinutes ?? 0) > 0 ? (zh ? `；待确认 ${formatNumber(week.pendingLossMinutes ?? 0)} min` : `; pending ${formatNumber(week.pendingLossMinutes ?? 0)} min`) : ""}，${zh ? "周计划/ML 生产" : "planned/ML production"} ${formatNumber(planned)}/${formatNumber(projected)} min`;
    });
    const header = input.scope === "route"
        ? `<tr><th>${zh ? "工序 / 工站" : "Operation / station"}</th>${Array.from({ length: 7 }, (_, index) => `<th>${escapeHtml(weeks[0]?.days[index]?.date.slice(5) ?? String(index + 1))}</th>`).join("")}<th>${zh ? "周 SA" : "Week SA"}</th></tr>`
        : `<tr><th>${zh ? "工序 / 工站" : "Operation / station"}</th><th>${zh ? "日期" : "Date"}</th><th>${zh ? "排布方式" : "Mode"}</th><th>${zh ? "开班分钟" : "Scheduled min"}</th><th>${zh ? "生产" : "Production"}</th><th>${zh ? "休息" : "Break"}</th><th>${zh ? "换型" : "Setup"}</th><th>${zh ? "维护" : "Maintenance"}</th><th>${zh ? "计划停机" : "Planned stop"}</th></tr>`;
    return `<section class="section"><div class="section-head"><h2>${zh ? "目标周 · 计划 SA 排布" : "Target week · planned SA allocation"}</h2><span>${zh ? "读取 SA 界面已生成且来源有效的周账" : "Generated and current SA week ledger"}</span></div>
    <p class="note">${input.scope === "route" ? (zh ? "每日单元为生产分钟 / 开班分钟；未开班与跨日占用单列。各站保留独立 SA，不跨站平均。" : "Each day shows production / scheduled minutes. SA stays station-specific.") : (zh ? "逐日显示生产、休息、换型、维护与计划停机；周能力按同一周账与有效 CT/P/Q 计算。" : "Daily plan minutes and actions; weekly pieces use this ledger and effective CT/P/Q.")}</p>
    <div class="table-scroll"><table><thead>${header}</thead><tbody>${rows || `<tr><td colspan="9">${zh ? "本周没有可展示的工站周账。" : "No station week ledger available."}</td></tr>`}</tbody></table></div>
    ${reserveSummary.length ? `<p class="note">${escapeHtml(reserveSummary.join("；"))}</p>` : ""}</section>`;
}
export function renderRouteRnrEvidenceAppendix(input) {
    const { zh } = input;
    return `<article class="sheet rnr-evidence" data-report-page="rnr-evidence">
    <header class="report-header"><div><p class="kicker">R&R / OBSERVATION</p><h1>${zh ? "R&R 同窗证据" : "R&R same-window evidence"}</h1>
      <p class="subtitle">${zh ? "指定样本修订 · 内部试算" : "Selected sample revisions · internal preview"}</p></div></header>
    <p class="note">${zh ? "每行仅对应本样本的真实观察窗口；OK/NOK 为该窗记录，不是整周 Actual。选择样本不会直接修改前页按有效参数计算的 Best case / Most likely；资格规则未确认前也不生成正式周能力结论。" : "Each row covers its own observation window, not a full-week Actual. Selecting a sample does not directly change the previous pages' Best case / Most likely based on effective parameters. Pending qualification rules prevent a formal weekly conclusion."}</p>
    <div class="table-scroll"><table><thead><tr><th>${zh ? "工序 / 工站" : "Operation / station"}</th><th>${zh ? "样本 / 设备" : "Sample / equipment"}</th>
      <th>${zh ? "观察窗口" : "Observation window"}</th><th>${zh ? "计划 / 实际生产分钟" : "Planned / actual production min"}</th><th>OK / NOK</th><th>${zh ? "时间账 / 资格" : "Time account / eligibility"}</th></tr></thead><tbody>
      ${input.evidence.map(item => `<tr><td>${escapeHtml(input.operationLabels[item.operationId] ?? item.operationId)} / ${escapeHtml(input.stationLabels[item.stationId] ?? item.stationId)}</td>
        <td>${escapeHtml(item.sampleId.slice(0, 8))} · v${item.revision}<br>${escapeHtml(item.equipmentId)}${item.source === "validationFixture" ? `<br>${zh ? "验证样例 · 非现场" : "Fixture · not field data"}` : ""}</td>
        <td>${escapeHtml(item.windowLabel ?? `${item.startMinute}–${item.endMinute}`)}</td>
        <td>${item.plannedProductionMinutes === undefined ? "—" : formatNumber(item.plannedProductionMinutes)} / ${item.actualProductionMinutes === undefined ? "—" : formatNumber(item.actualProductionMinutes)}</td>
        <td>${item.okQty === undefined ? "—" : formatOutputUnits(item.okQty)} / ${item.nokQty === undefined ? "—" : formatOutputUnits(item.nokQty)}</td>
        <td>${item.timeAccount === "complete" ? (zh ? "完整" : "Complete") : (zh ? "待补 / 无效" : "Incomplete / invalid")} · ${item.eligibility === "rulesPending" ? (zh ? "规则待定" : "Rules pending") : (zh ? "不可用于正式验收" : "Not eligible")}</td></tr>`).join("")}
      ${input.missingStationIds.map(id => `<tr><td>${escapeHtml(input.stationLabels[id] ?? id)}</td><td colspan="5">${zh ? "未选择该工站的 R&R 样本修订；该工站验证结论留空。" : "No R&R sample revision selected; station validation stays blank."}</td></tr>`).join("")}
      ${!input.evidence.length && !input.missingStationIds.length ? `<tr><td colspan="6">${zh ? "暂无可用样本。" : "No sample available."}</td></tr>` : ""}
    </tbody></table></div>
  </article>`;
}
function sheet(input, plan, scale, scaleLabel, page) {
    const zh = input.zh;
    const review = plan.role === "review";
    const title = review ? (zh ? "对照周 · 目标周前 7 天" : "Comparison week · previous 7 days") : (zh ? "目标周计划" : "Selected week plan");
    const key = plan.flowLimited ? undefined : keyStation(plan);
    const operationLabel = (id) => input.operationLabels?.[id] ?? id;
    const stationLabel = (id) => input.stationLabels?.[id] ?? id;
    const demand = plan.demandQty;
    const margin = plan.planMargin;
    const decision = review ? reviewDecision(plan, zh) : outlookDecision(plan, zh);
    if (plan.planBottleneckOperationId && !plan.flowLimited) {
        decision.title = decision.title.replace(plan.planBottleneckOperationId, operationLabel(plan.planBottleneckOperationId));
    }
    return `<article class="sheet ${review ? "review" : "outlook"}" data-report-page="${plan.role}" aria-label="${escapeHtml(title)}">
    <header class="report-header">
      <div>
        <p class="kicker">CAPACITY ASSESSMENT / INTERNAL</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="subtitle">${escapeHtml(input.productName)} · ${escapeHtml(input.routeId)}${input.routeVersion ? ` / ${escapeHtml(input.routeVersion)}` : ""} · ${zh ? "路线等效良品件" : "Finished-good pieces"}</p>
      </div>
      <div class="report-id"><strong>${zh ? "内部报告" : "Internal report"}</strong><span class="draft">${zh ? "本地草稿 · 非客户承诺" : "Local draft"}</span><br>${escapeHtml(input.generatedAt)}<br>${zh ? `第 ${page} / 2 页` : `Page ${page} / 2`}</div>
    </header>
    <div class="meta">
      <div class="meta-item"><small>${zh ? "产品 / 版本" : "Product / version"}</small><strong>${escapeHtml(input.productName)} / ${escapeHtml(input.productVersion || "-")}</strong></div>
      <div class="meta-item"><small>${zh ? "生产周" : "Production week"}</small><strong>${escapeHtml(plan.weekStartDate)} – ${escapeHtml(input.weekEnd(plan.weekStartDate))}</strong></div>
      <div class="meta-item"><small>${zh ? "数据状态" : "Data status"}</small><strong>${escapeHtml(statusLabel(plan, zh))}</strong></div>
      ${input.snapshotId ? `<div class="meta-item"><small>${zh ? "本地快照" : "Local snapshot"}</small><strong>${escapeHtml(input.snapshotId)}</strong></div>` : ""}
    </div>
    <section class="section">
      <div class="section-head"><h2>${zh ? "决策结论" : "Decision"}</h2><span>${zh ? "两页同一指标顺序" : "Same metric order on both pages"}</span></div>
      <div class="decision ${review ? "" : "forecast-decision"}">
        <div class="decision-main"><span class="decision-label">${escapeHtml(decision.label)}</span><strong>${escapeHtml(decision.title)}</strong><p>${escapeHtml(decision.body)}</p></div>
        <div class="decision-gap"><small>${escapeHtml(review ? (zh ? "计划余量 · ML − 需求" : "Plan margin · ML − demand") : (zh ? "计划余量 · ML − 需求" : "Plan margin · ML − demand"))}</small><strong>${signedPieces(margin, zh)}</strong><span>${pieces(plan.mostLikelyPieces)} − ${pieces(demand)}</span></div>
      </div>
      <div class="metrics">
        <div class="metric"><small>${zh ? "需求" : "Demand"}</small><strong>${pieces(demand)} ${zh ? "件" : "pcs"}</strong></div>
        <div class="metric"><small>${zh ? "排产计划 · ML" : "Plan · ML"}</small><strong>${pieces(plan.mostLikelyPieces)} ${zh ? "件" : "pcs"}</strong><em class="${(margin ?? 0) < 0 ? "negative" : ""}">${margin === undefined ? (zh ? "路线未齐" : "Route incomplete") : (zh ? `对需求 ${signed(margin)}` : `vs demand ${signed(margin)}`)}</em></div>
        <div class="metric"><small>${review ? (zh ? "本周结果 · Actual" : "Actual") : (zh ? "结果 · Actual" : "Actual")}</small><strong>${plan.actualPieces === undefined ? "—" : `${pieces(plan.actualPieces)} ${zh ? "件" : "pcs"}`}</strong><em>${escapeHtml(plan.actualPieces === undefined ? (zh ? "留空" : "Blank") : "")}</em></div>
        <div class="metric"><small>${zh ? "Best case 挑战" : "Best case"}</small><strong>${pieces(plan.bestCasePieces)} ${zh ? "件" : "pcs"}</strong><em>${zh ? "非默认排产目标" : "Not the default plan"}</em></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "需求 / 计划 / 结果 / 挑战" : "Demand / plan / actual / best"}</h2><span>${zh ? `两页同用 0–${scaleLabel} 件` : `Shared scale 0–${scaleLabel}`}</span></div>
      <div class="compare" style="--demand:${percentOf(demand, scale)}" role="img" aria-label="${escapeHtml(compareLabel(plan, zh))}">
        ${bar(zh ? "需求" : "Demand", "demand", demand, scale)}
        ${bar(zh ? "计划 · ML" : "Plan · ML", "likely", plan.mostLikelyPieces, scale)}
        ${bar(zh ? "结果 · Actual" : "Actual", "outcome", plan.actualPieces, scale)}
        ${bar(zh ? "挑战 · Best" : "Best", "best", plan.bestCasePieces, scale)}
        <div class="legend">${zh ? "竖线为本页需求。两页横轴刻度一致。ML 不写入 Actual。" : "The marker is this page's demand. Both pages share the scale. ML is not copied into Actual."}</div>
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "工序能力对照" : "Operation comparison"}</h2><span>${zh ? "按每件成品所需件数折成成品" : "Converted by units per finished product"}</span></div>
      <div class="table-scroll"><table>
        <thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "计划 · ML" : "Plan · ML"}</th><th>${zh ? "结果 · Actual" : "Actual"}</th><th>${zh ? "挑战 · Best" : "Best"}</th><th>${zh ? "用量" : "Units"}</th></tr></thead>
        <tbody>${plan.operations.map(operation => `<tr>
          <td class="${operation.isPlanBottleneck ? "bottleneck" : ""}">${escapeHtml(operationLabel(operation.operationId))}${operation.isPlanBottleneck ? (zh ? " · 计划瓶颈" : " · plan bottleneck") : ""}</td>
          <td>${pieces(operation.mostLikelyFinishedPieces)}</td>
          <td class="${operation.isActualBottleneck ? "bottleneck" : ""}">${pieces(operation.actualFinishedPieces)}</td>
          <td>${pieces(operation.bestFinishedPieces)}</td>
          <td>${operation.unitsPerFinishedProduct === undefined ? "—" : formatNumber(operation.unitsPerFinishedProduct)}</td>
        </tr>`).join("") || `<tr><td colspan="5">—</td></tr>`}</tbody>
      </table></div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "关键参数" : "Key parameters"} · ${escapeHtml(key ? `${operationLabel(key.operationId)} / ${stationLabel(key.stationId)}` : (plan.flowLimited ? (zh ? "工站流转约束" : "Station links") : "-"))}</h2><span>${plan.flowLimited ? (zh ? "多路径约束，无单一关键工站" : "No single key station across linked paths") : (zh ? "计划列来自该周账；实际列只在有完整同周实绩时填写" : "Plan comes from this week's ledger")}</span></div>
      <div class="spq">
        ${spq(zh ? "SA · 时间开动率" : "SA", zh ? "计划 · 含休息" : "Plan · with breaks", rate(key?.withBreaksSa), zh ? "实际 · Actual" : "Actual", rate(review ? plan.actualSa : undefined), key?.shareRule ?? "")}
        ${spq(zh ? "P · 节拍达成率" : "P", zh ? "计划 · 已发布" : "Published plan", key && !key.mixedParameters ? rate(key.performanceRate) : (key?.mixedParameters ? (zh ? "按日取版本" : "By day") : "—"), zh ? "实际 · Actual" : "Actual", rate(review ? plan.actualPerformanceRate : undefined), key?.mixedParameters ? key.parameterIds.join(" · ") : (key?.standardCycleSec === undefined ? "" : `CT ${formatNumber(key.standardCycleSec, 1)}s`))}
        ${spq(zh ? "Q · 良品率" : "Q", zh ? "计划 · 已发布" : "Published plan", key && !key.mixedParameters ? rate(key.qualityRate) : (key?.mixedParameters ? (zh ? "按日取版本" : "By day") : "—"), zh ? "实际 · Actual" : "Actual", rate(review ? plan.actualQualityRate : undefined), key?.piecesPerCycle === undefined ? "" : (zh ? `每循环 ${formatNumber(key.piecesPerCycle)} 件` : `${formatNumber(key.piecesPerCycle)} pcs/cycle`))}
      </div>
    </section>
    <section class="section">
      <div class="section-head"><h2>${zh ? "周期补充信息" : "Week notes"}</h2><span>${escapeHtml(plan.shareNote)}</span></div>
      <div class="table-scroll"><table>
        <thead><tr><th>${zh ? "工站" : "Station"}</th><th>${zh ? "原周账 Best" : "Native Best"}</th><th>${zh ? "原周账 ML" : "Native ML"}</th><th>${zh ? "份额规则" : "Share rule"}</th><th>${zh ? "参数" : "Parameters"}</th></tr></thead>
        <tbody>${plan.stations.map(station => `<tr>
          <td>${escapeHtml(operationLabel(station.operationId))} / ${escapeHtml(stationLabel(station.stationId))}</td>
          <td>${pieces(station.nativeBestPieces)}</td>
          <td>${pieces(station.nativeMostLikelyPieces)}</td>
          <td>${escapeHtml(station.shareRule)}</td>
          <td>${station.parameterIds.length ? escapeHtml(station.parameterIds.join(", ")) : "—"}</td>
        </tr>`).join("") || `<tr><td colspan="5">—</td></tr>`}</tbody>
      </table></div>
      ${plan.reasons.length ? `<div class="evidence"><strong>${zh ? "缺口" : "Gaps"}</strong> ${escapeHtml(plan.reasons.join("；"))}</div>` : ""}
      ${plan.actualBlankReason ? `<div class="evidence"><strong>Actual</strong> ${escapeHtml(plan.actualBlankReason)}</div>` : ""}
    </section>
    <section class="section basis"><strong>${zh ? "口径" : "Basis"}</strong> ${zh
        ? "Best 不乘 P、Q。Most likely 只乘当日已发布的 P、Q 一次。计划余量 = ML 路线成品件数 − 需求。没有历史计划快照时标为当前参数回算。本机草稿不是整周实绩归档。"
        : "Best ignores P and Q. Most likely multiplies the published P and Q once. Plan margin is route ML minus demand. Without a historical snapshot this is a current-parameter recalculation. A local draft is not a full-week actual archive."}
      ${plan.planBasis === "currentParameterRecalc" ? (zh ? " 本页计划为当前参数回算。" : " This page is a current-parameter recalculation.") : plan.planBasis === "snapshot" ? (zh ? " 本页计划来自排产快照。" : " This page uses a planning snapshot.") : ""}
      ${plan.flowLimited ? (zh ? " 工序行是各站独立上限；路线件数仅计入已连通的工站路径。" : " Operation rows are standalone limits; route pieces include only connected station paths.") : ""}
    </section>
    <footer class="footer"><span>${zh ? "内部评估 · 非客户产能承诺" : "Internal only"}</span><span>${zh ? `第 ${page} / 2 页` : `Page ${page} / 2`}</span></footer>
  </article>`;
}
function keyStation(plan) {
    const operationId = plan.planBottleneckOperationId ?? plan.operations.find(item => item.stationCount > 0)?.operationId;
    const members = plan.stations.filter(station => station.operationId === operationId && station.included);
    if (!members.length)
        return plan.stations.find(station => station.included) ?? plan.stations[0];
    return members.reduce((selected, station) => (station.nativeMostLikelyRaw ?? Infinity) < (selected.nativeMostLikelyRaw ?? Infinity) ? station : selected);
}
function reviewDecision(plan, zh) {
    if (!plan.calculable) {
        return {
            label: zh ? "路线计划未齐" : "Route plan incomplete",
            title: zh ? "不显示路线件数" : "Route pieces stay blank",
            body: plan.reasons[0] ?? (zh ? "缺少周账、份额或用量。" : "A ledger, share or quantity is missing."),
        };
    }
    const gap = plan.planMargin ?? 0;
    return {
        label: gap < 0 ? (zh ? "Most likely 低于需求" : "Most likely is below demand") : (zh ? "Most likely 覆盖需求" : "Most likely covers demand"),
        title: plan.flowLimited ? (zh ? "工站流转约束限制了路线能力" : "Station links limit route capacity") : plan.planBottleneckOperationId ? (zh ? `${plan.planBottleneckOperationId} 是计划瓶颈` : `${plan.planBottleneckOperationId} is the plan bottleneck`) : (zh ? "计划已汇总" : "Plan is complete"),
        body: plan.actualPieces === undefined
            ? (zh ? "Actual 留空。计划余量不是实际余量。" : "Actual stays blank. Plan margin is not an actual gap.")
            : (zh ? "Actual 来自完整同周实绩，不由 Most likely 复制。" : "Actual comes from a complete same-week record."),
    };
}
function outlookDecision(plan, zh) {
    if (!plan.calculable)
        return reviewDecision(plan, zh);
    const gap = plan.planMargin ?? 0;
    return {
        label: gap < 0 ? (zh ? "计划未覆盖需求" : "Plan does not cover demand") : (zh ? "计划覆盖需求" : "Plan covers demand"),
        title: plan.flowLimited ? (zh ? "工站流转约束限制了路线能力" : "Station links limit route capacity") : plan.planBottleneckOperationId ? (zh ? `${plan.planBottleneckOperationId} 是计划瓶颈` : `${plan.planBottleneckOperationId} is the plan bottleneck`) : (zh ? "计划已汇总" : "Plan is complete"),
        body: zh ? "本报告尚未接入目标周完整实绩，Actual 留空。Most likely 只作为计划与预测，不写入结果列。" : "A complete actual ledger is not connected for the selected week. Actual stays blank; Most likely remains a plan and forecast.",
    };
}
function statusLabel(plan, zh) {
    const basis = plan.planBasis === "snapshot" ? (zh ? "排产快照" : "Planning snapshot")
        : plan.planBasis === "currentParameterRecalc" ? (zh ? "当前参数回算" : "Current-parameter recalculation")
            : (zh ? "缺少周账" : "Ledger missing");
    const actual = plan.role === "outlook" ? (zh ? "Actual 未接入" : "Actual not connected")
        : plan.actualPieces === undefined ? (zh ? "Actual 无完整实绩" : "Actual not evidenced")
            : (zh ? "Actual 有同周实绩" : "Actual evidenced");
    return `${basis} · ${actual}`;
}
function compareLabel(plan, zh) {
    return zh
        ? `需求 ${pieces(plan.demandQty)}，计划 ${pieces(plan.mostLikelyPieces)}，Actual ${pieces(plan.actualPieces)}，Best ${pieces(plan.bestCasePieces)}`
        : `Demand ${pieces(plan.demandQty)}, plan ${pieces(plan.mostLikelyPieces)}, actual ${pieces(plan.actualPieces)}, best ${pieces(plan.bestCasePieces)}`;
}
function bar(label, kind, value, scale) {
    return `<div class="compare-row"><span>${escapeHtml(label)}</span><div class="bar-track"><span class="bar ${kind}" style="width:${percentOf(value, scale)}"></span></div><strong>${pieces(value)}</strong></div>`;
}
function percentOf(value, scale) {
    if (value === undefined || scale <= 0)
        return "0%";
    return `${Math.max(0, Math.min(100, value / scale * 100))}%`;
}
function spq(title, left, leftValue, right, rightValue, note) {
    return `<div><small>${escapeHtml(title)}</small><div class="spq-values"><div><span>${escapeHtml(left)}</span><strong>${escapeHtml(leftValue)}</strong></div><div><span>${escapeHtml(right)}</span><strong>${escapeHtml(rightValue)}</strong></div></div>${note ? `<p class="spq-note">${escapeHtml(note)}</p>` : ""}</div>`;
}
function pieces(value) {
    return value === undefined ? "—" : formatOutputUnits(value);
}
function signedPieces(value, zh) {
    if (value === undefined)
        return "—";
    return `${signed(value)} ${zh ? "件" : "pcs"}`;
}
function signed(value) {
    return `${value > 0 ? "+" : ""}${formatOutputUnits(value)}`;
}
function rate(value) {
    if (value === undefined || !Number.isFinite(value))
        return "—";
    return `${formatNumber(value * 100, 1)}%`;
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);
}
