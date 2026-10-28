import { buildFutureScheduleTimeline, type DatedScheduleEvent, type FutureScheduleInput, type RecurringBreak, type ScheduledTask, type ScheduleInterval } from "../engine/future-schedule-timeline.js";
import { buildScheduleCapacityBases, type ScheduleCapacityBasisInput } from "../engine/schedule-capacity-basis.js";
import { evaluateScheduleCapacityGate, scheduleApprovalFingerprint, type ScheduleRiskApproval } from "../engine/schedule-capacity-gate.js";
import { standardSaShiftIntervals, type StandardSaDayConfig } from "../engine/standard-sa-day.js";
import { saveLocalState } from "./local-state-client.js";

interface SchedulePanelContext {
  productId: string;
  routeId: string;
  stationId: string;
  date: string;
  standardDay: StandardSaDayConfig;
  capacityInputsForDate: (date: string) => Omit<ScheduleCapacityBasisInput, "schedule"> | undefined;
  windowStartAt?: string;
  zh: boolean;
}

interface StoredScheduleDraft {
  planVersion: string;
  sourceId: string;
  schedule: FutureScheduleInput;
  approvals?: ScheduleRiskApproval[];
}

const today = new Date();
let selectedDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
let nextRow = 0;

function html(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function key(context: SchedulePanelContext): string {
  return `capa-future-schedule-v1:${encodeURIComponent(context.productId)}:${encodeURIComponent(context.routeId)}:${encodeURIComponent(context.stationId)}:${context.date}`;
}

function startDate(context: SchedulePanelContext): Date {
  if (context.windowStartAt) return new Date(context.windowStartAt);
  const date = new Date(`${context.date}T00:00:00`);
  date.setMinutes(date.getMinutes() + context.standardDay.startMinute);
  return date;
}

function localDateTime(date: Date): string {
  const offset = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return offset.toISOString().slice(0, 16);
}

function atMinute(context: SchedulePanelContext, minute: number): string {
  return localDateTime(new Date(startDate(context).getTime() + minute * 60_000));
}

function clockAt(context: SchedulePanelContext, minute: number): string {
  const anchor = startDate(context);
  const total = ((anchor.getHours() * 60 + anchor.getMinutes() + minute) % 1440 + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function row(collection: string, context: SchedulePanelContext, value?: ScheduleInterval | ScheduledTask | RecurringBreak | DatedScheduleEvent): string {
  const id = value?.id ?? `schedule-row-${Date.now()}-${++nextRow}`;
  const recurring = collection === "dailyBreaks";
  const start = recurring ? (value as RecurringBreak | undefined)?.startMinuteOfDay : (value as ScheduleInterval | undefined)?.startMinute;
  const end = recurring ? (value as RecurringBreak | undefined)?.endMinuteOfDay : (value as ScheduleInterval | undefined)?.endMinute;
  const timeInput = (part: "start" | "end", minute: number | undefined) => `<input data-schedule-${part} type="${recurring ? "time" : "datetime-local"}" value="${minute === undefined ? "" : recurring ? clockAt(context, minute) : atMinute(context, minute)}" aria-label="${part === "start" ? "开始" : "结束"}" />`;
  const extra = collection === "tasks" ? `<td><input data-schedule-quantity type="number" min="1" step="1" value="${(value as ScheduledTask | undefined)?.targetPieces ?? ""}" aria-label="工站任务目标件数" /></td>`
    : collection === "datedEvents" ? `<td><select data-schedule-event-kind aria-label="事件类型">${(["setup", "maintenance", "plannedStop"] as const).map(kind => `<option value="${kind}" ${(value as DatedScheduleEvent | undefined)?.kind === kind ? "selected" : ""}>${context.zh ? ({ setup: "换型", maintenance: "保养", plannedStop: "计划停机" }[kind]) : kind}</option>`).join("")}</select></td>` : "";
  return `<tr data-schedule-row data-schedule-id="${html(id)}"><td>${timeInput("start", start)}</td><td>${timeInput("end", end)}</td>${extra}<td><button class="button secondary" type="button" data-schedule-delete>${context.zh ? "删除" : "Delete"}</button></td></tr>`;
}

function section(collection: string, title: string, context: SchedulePanelContext, values: Array<ScheduleInterval | ScheduledTask | RecurringBreak | DatedScheduleEvent>): string {
  const extra = collection === "tasks" ? `<th>${context.zh ? "工站任务目标件数" : "Station task target pcs"}</th>`
    : collection === "datedEvents" ? `<th>${context.zh ? "类型" : "Type"}</th>` : "";
  return `<section class="overview-section" data-schedule-collection="${collection}"><div class="panel-head"><h3>${title}</h3><button class="button secondary" type="button" data-schedule-add="${collection}">${context.zh ? "新增" : "Add"}</button></div>
    <div class="table-wrap"><table><thead><tr><th>${context.zh ? "开始" : "Start"}</th><th>${context.zh ? "结束" : "End"}</th>${extra}<th>${context.zh ? "操作" : "Action"}</th></tr></thead><tbody>${values.map(item => row(collection, context, item)).join("")}</tbody></table></div></section>`;
}

function readDraft(context: SchedulePanelContext): StoredScheduleDraft | undefined {
  const raw = localStorage.getItem(key(context));
  if (!raw) return undefined;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || !("schedule" in value)) throw new Error("Invalid saved schedule draft");
  const draft = value as StoredScheduleDraft;
  if (draft.schedule.stationId !== context.stationId || !Array.isArray(draft.schedule.shifts)
    || !Array.isArray(draft.schedule.tasks) || !Array.isArray(draft.schedule.dailyBreaks)
    || !Array.isArray(draft.schedule.datedEvents) || typeof draft.schedule.windowStartAt !== "string"
    || (draft.approvals !== undefined && !Array.isArray(draft.approvals))
    || draft.approvals?.some(item => !item || typeof item.approvalId !== "string" || typeof item.taskId !== "string"
      || typeof item.approvedBy !== "string" || typeof item.reason !== "string" || typeof item.approvedAt !== "string")
    || !Number.isFinite(Date.parse(draft.schedule.windowStartAt))) throw new Error("Schedule draft scope is invalid");
  return draft;
}

function initialSchedule(context: SchedulePanelContext): FutureScheduleInput {
  const shifts = standardSaShiftIntervals(context.standardDay).filter(shift => shift.startMinute < context.standardDay.startMinute + 1440)
    .map((shift, index) => ({ id: `shift-${index + 1}`, startMinute: shift.startMinute - context.standardDay.startMinute,
      endMinute: Math.min(1440, shift.endMinute - context.standardDay.startMinute) }));
  return { stationId: context.stationId, windowStartAt: startDate(context).toISOString(), horizonMinutes: 1440,
    shifts, tasks: [], dailyBreaks: [], datedEvents: [] };
}

function readRows<T>(root: HTMLElement, collection: string, context: SchedulePanelContext): T[] {
  const anchor = startDate(context);
  const anchorMinuteOfDay = anchor.getHours() * 60 + anchor.getMinutes();
  return [...root.querySelectorAll<HTMLElement>(`[data-schedule-collection="${collection}"] [data-schedule-row]`)].map(item => {
    const id = item.dataset.scheduleId ?? "";
    const startValue = item.querySelector<HTMLInputElement>("[data-schedule-start]")?.value ?? "";
    const endValue = item.querySelector<HTMLInputElement>("[data-schedule-end]")?.value ?? "";
    const relative = (value: string) => {
      if (collection !== "dailyBreaks") return (new Date(value).getTime() - anchor.getTime()) / 60_000;
      const [hour, minute] = value.split(":").map(Number);
      return ((hour ?? NaN) * 60 + (minute ?? NaN) - anchorMinuteOfDay + 1440) % 1440;
    };
    const startMinute = relative(startValue);
    let endMinute = relative(endValue);
    if (collection === "dailyBreaks" && endMinute <= startMinute) endMinute += 1440;
    if (collection === "dailyBreaks") return { id, startMinuteOfDay: startMinute, endMinuteOfDay: endMinute } as T;
    const base = { id, startMinute, endMinute };
    if (collection === "tasks") return { ...base, productId: context.productId,
      targetPieces: Number(item.querySelector<HTMLInputElement>("[data-schedule-quantity]")?.value) } as T;
    if (collection === "datedEvents") return { ...base,
      kind: item.querySelector<HTMLSelectElement>("[data-schedule-event-kind]")?.value } as T;
    return base as T;
  });
}

function readScheduleEditor(root: HTMLElement, context: SchedulePanelContext): FutureScheduleInput {
  return { stationId: context.stationId, windowStartAt: startDate(context).toISOString(), horizonMinutes: 1440,
    shifts: readRows<ScheduleInterval>(root, "shifts", context), tasks: readRows<ScheduledTask>(root, "tasks", context),
    dailyBreaks: readRows<RecurringBreak>(root, "dailyBreaks", context), datedEvents: readRows<DatedScheduleEvent>(root, "datedEvents", context) };
}

export function renderFutureSchedulePanel(root: HTMLElement, context: Omit<SchedulePanelContext, "date">): void {
  const current = { ...context, date: selectedDate };
  let draft: StoredScheduleDraft | undefined;
  let loadError = "";
  try { draft = readDraft(current); } catch (error) { loadError = error instanceof Error ? error.message : String(error); }
  const schedule = draft?.schedule ?? initialSchedule(current);
  const displayContext = { ...current, windowStartAt: schedule.windowStartAt };
  const standardStartChanged = Boolean(draft && draft.schedule.windowStartAt !== initialSchedule(current).windowStartAt);
  const result = buildFutureScheduleTimeline(schedule);
  const capacityInputs = context.capacityInputsForDate(selectedDate);
  const capacityBasis = capacityInputs ? buildScheduleCapacityBases({ ...capacityInputs, schedule })
    : { bases: [], issues: [context.zh ? "缺少当前工站的同周周账或 R&R 损失预留依据" : "Same-week station ledger or R&R loss allowance missing"] };
  const capacityGate = evaluateScheduleCapacityGate({ schedule, routeId: context.routeId,
    planVersion: draft?.planVersion ?? "draft-1", capacityBases: capacityBasis.bases, approvals: draft?.approvals ?? [] });
  const decisionLabel: Record<string, string> = context.zh
    ? { pass: "未超 Most likely", needsReview: "超 Most likely · 待人工判定", approvedRisk: "量级风险已人工判定", rejected: "超 Best case · 拒绝", missingBasis: "依据不足" }
    : { pass: "Within Most likely", needsReview: "Above Most likely · review required", approvedRisk: "Quantity risk reviewed", rejected: "Above Best case · rejected", missingBasis: "Basis missing" };
  const kindLabel: Record<string, string> = context.zh
    ? { production: "生产", break: "休息", setup: "换型", maintenance: "保养", plannedStop: "计划停机", unassigned: "未分配任务" }
    : { production: "Production", break: "Break", setup: "Setup", maintenance: "Maintenance", plannedStop: "Planned stop", unassigned: "Unassigned" };
  root.innerHTML = `<div class="panel-head"><div><h2>${context.zh ? "未来排产" : "Future scheduling"}</h2><p class="note">${html(context.productId)} · ${html(context.routeId)} · ${html(context.stationId)}</p></div><span class="pill warn">${context.zh ? "本地草稿 · 未发布" : "Local draft · unpublished"}</span></div>
    <div class="field-grid"><div class="field"><label for="schedule-date">${context.zh ? "生产日" : "Production day"}</label><input id="schedule-date" type="date" value="${html(current.date)}" /></div>
    <div class="field"><label for="schedule-version">${context.zh ? "排程版本" : "Plan version"}</label><input id="schedule-version" value="${html(draft?.planVersion ?? "draft-1")}" /></div>
    <div class="field"><label for="schedule-source">${context.zh ? "排程来源 / 编号" : "Schedule source / reference"}</label><input id="schedule-source" value="${html(draft?.sourceId ?? "manual")}" /></div></div>
    <p class="note">${context.zh ? "时间起点" : "Window start"}：${html(atMinute(displayContext, 0).replace("T", " "))} · ${context.zh ? "24 小时；未分配任务的排班时间保持空白。" : "24 hours; scheduled time without a task stays unassigned."}</p>
    ${!draft ? `<p class="note">${context.zh ? "初始班次取自当前标准 SA 设置；保存前请按真实排产复核。" : "Initial shifts come from the current Standard SA setup; review against the real schedule before saving."}</p>` : ""}
    ${standardStartChanged ? `<p class="form-error">${context.zh ? "标准 SA 开班时间已变化；本草稿仍使用保存时的时间起点，请复核后重排。" : "Standard SA start time changed; this draft keeps its saved anchor. Review before rescheduling."}</p>` : ""}
    ${section("shifts", context.zh ? "班次" : "Shifts", displayContext, schedule.shifts)}
    ${section("tasks", context.zh ? "生产任务" : "Production tasks", displayContext, schedule.tasks)}
    ${section("dailyBreaks", context.zh ? "每日固定休息" : "Daily recurring breaks", displayContext, schedule.dailyBreaks)}
    ${section("datedEvents", context.zh ? "指定日期事件" : "Dated events", displayContext, schedule.datedEvents)}
    <div class="action-bar"><button class="button" type="button" data-schedule-save>${context.zh ? "保存排程草稿" : "Save schedule draft"}</button></div>
    <p class="form-error" data-schedule-error ${loadError ? "" : "hidden"}>${html(loadError)}</p>
    <section class="overview-section"><h3>${context.zh ? "时间账与任务量级检查" : "Timeline and task quantity check"}</h3>
      <p class="note">${result.status === "complete" ? (context.zh ? "时间账完整" : "Timeline complete") : result.status === "incomplete" ? (result.issues.length ? html(result.issues.join("; ")) : context.zh ? `未分配任务 ${result.unassignedMinutes} 分钟` : `${result.unassignedMinutes} unassigned minutes`) : html(result.issues.join("; "))} · ${context.zh ? "草稿不可发布。" : "Draft cannot be published."}</p>
      <div class="table-wrap"><table><thead><tr><th>${context.zh ? "开始" : "Start"}</th><th>${context.zh ? "结束" : "End"}</th><th>${context.zh ? "状态" : "State"}</th><th>${context.zh ? "来源" : "Source"}</th></tr></thead><tbody>
      ${result.segments.map(item => `<tr><td>${html(atMinute(displayContext, item.startMinute).replace("T", " "))}</td><td>${html(atMinute(displayContext, item.endMinute).replace("T", " "))}</td><td>${html(kindLabel[item.kind] ?? item.kind)}</td><td>${html(item.sourceId ?? "-")}</td></tr>`).join("") || `<tr><td colspan="4">-</td></tr>`}</tbody></table></div>
      <h3>${context.zh ? "任务量级检查" : "Task quantity check"}</h3>
      <p class="note">${context.zh ? "按当前草稿时间账、同周周账与生效 CT/P/Q 试算；仅供排程量级复核，不等于已批准发布或承诺交付。" : "Trial calculation from this draft timeline, same-week ledger and effective CT/P/Q; not publication or delivery approval."}
        ${capacityBasis.issues.length ? ` · ${html(capacityBasis.issues.join("; "))}` : ""}</p>
      <div class="table-wrap"><table><thead><tr><th>${context.zh ? "任务" : "Task"}</th><th>${context.zh ? "目标件数" : "Target pcs"}</th><th>Most likely</th><th>Best case</th><th>${context.zh ? "判定" : "Decision"}</th><th>${context.zh ? "操作" : "Action"}</th></tr></thead><tbody>
      ${capacityGate.decisions.map(item => `<tr><td>${html(item.taskId)}</td><td>${item.targetPieces}</td><td>${item.mostLikelyPieces ?? "-"}</td><td>${item.bestCasePieces ?? "-"}</td><td>${html(decisionLabel[item.status] ?? item.status)}</td><td>${draft && capacityGate.status === "needsReview" && item.status === "needsReview" ? `<button class="button secondary" type="button" data-schedule-review="${html(item.taskId)}">${context.zh ? "记录判定" : "Record review"}</button>` : item.status === "approvedRisk" && item.approvalId ? `<button class="button secondary" type="button" data-schedule-revoke="${html(item.approvalId)}">${context.zh ? "撤销判定" : "Revoke review"}</button>` : "-"}</td></tr>`).join("") || `<tr><td colspan="6">-</td></tr>`}</tbody></table></div>
      <div class="field-grid" data-schedule-review-form hidden><div class="field"><label>${context.zh ? "判定人" : "Reviewer"}</label><input data-schedule-reviewer type="text" /></div>
        <div class="field"><label>${context.zh ? "判定原因" : "Reason"}</label><input data-schedule-review-reason type="text" /></div>
        <div class="field"><label>${context.zh ? "当前任务" : "Current task"}</label><strong data-schedule-review-task>-</strong></div></div>
      <div class="action-bar" data-schedule-review-actions hidden><button class="button secondary" type="button" data-schedule-review-cancel>${context.zh ? "取消" : "Cancel"}</button>
        <button class="button" type="button" data-schedule-review-confirm>${context.zh ? "确认量级风险" : "Confirm quantity risk"}</button></div>
      <p class="form-error" data-schedule-review-error hidden></p>
      ${(draft?.approvals?.length ?? 0) ? `<details class="overview-section"><summary>${context.zh ? "人工判定记录" : "Manual review history"} (${draft!.approvals!.length})</summary>
        <div class="table-wrap"><table><thead><tr><th>${context.zh ? "任务" : "Task"}</th><th>${context.zh ? "判定人" : "Reviewer"}</th><th>${context.zh ? "时间" : "Time"}</th><th>${context.zh ? "原因" : "Reason"}</th><th>${context.zh ? "状态" : "Status"}</th></tr></thead><tbody>
        ${draft!.approvals!.map(item => `<tr><td>${html(item.taskId)}</td><td>${html(item.approvedBy)}</td><td>${html(item.approvedAt)}</td><td>${html(item.reason)}</td><td>${item.revokedAt ? (context.zh ? "已撤销" : "Revoked") : capacityGate.decisions.some(decision => decision.approvalId === item.approvalId) ? (context.zh ? "当前有效" : "Current") : (context.zh ? "历史记录 · 已失效" : "Historical · stale")}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <p class="note">${context.zh ? "排程仍是本地草稿；份额、工序流转、正式授权及连续实绩尚未接入。" : "This remains a local draft; shares, operation flow, formal authorization and continuous actuals are not connected."}</p></section>`;

  root.querySelector<HTMLInputElement>("#schedule-date")?.addEventListener("change", event => {
    selectedDate = (event.currentTarget as HTMLInputElement).value || selectedDate;
    renderFutureSchedulePanel(root, context);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-schedule-add]").forEach(button => button.addEventListener("click", () => {
    const collection = button.dataset.scheduleAdd ?? "";
    root.querySelector(`[data-schedule-collection="${collection}"] tbody`)?.insertAdjacentHTML("beforeend", row(collection, displayContext));
  }));
  root.querySelectorAll<HTMLElement>("[data-schedule-collection]").forEach(sectionRoot => sectionRoot.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-schedule-delete]")) target.closest("[data-schedule-row]")?.remove();
  }));
  const reviewForm = root.querySelector<HTMLElement>("[data-schedule-review-form]");
  const reviewActions = root.querySelector<HTMLElement>("[data-schedule-review-actions]");
  const reviewError = root.querySelector<HTMLElement>("[data-schedule-review-error]");
  const reviewFail = (message: string) => { if (reviewError) { reviewError.hidden = false; reviewError.textContent = message; } };
  const editorMatchesDraft = () => Boolean(draft && root.querySelector<HTMLInputElement>("#schedule-version")?.value.trim() === draft.planVersion
    && root.querySelector<HTMLInputElement>("#schedule-source")?.value.trim() === draft.sourceId
    && JSON.stringify(readScheduleEditor(root, displayContext)) === JSON.stringify(draft.schedule));
  const storedDraftIsCurrent = () => {
    try { return JSON.stringify(readDraft(current)) === JSON.stringify(draft); } catch { return false; }
  };
  let reviewingTaskId = "";
  root.querySelectorAll<HTMLButtonElement>("[data-schedule-review]").forEach(button => button.addEventListener("click", () => {
    if (!editorMatchesDraft() || !storedDraftIsCurrent()) {
      reviewFail(context.zh ? "排程有未保存的更改或已在其他窗口更新；请先保存或刷新。" : "The schedule has unsaved or external changes; save or refresh first.");
      return;
    }
    reviewingTaskId = button.dataset.scheduleReview ?? "";
    if (reviewForm) reviewForm.hidden = false;
    if (reviewActions) reviewActions.hidden = false;
    if (reviewError) reviewError.hidden = true;
    const taskLabel = root.querySelector<HTMLElement>("[data-schedule-review-task]");
    if (taskLabel) taskLabel.textContent = reviewingTaskId;
    root.querySelector<HTMLInputElement>("[data-schedule-reviewer]")?.focus();
  }));
  root.querySelector<HTMLButtonElement>("[data-schedule-review-cancel]")?.addEventListener("click", () => {
    reviewingTaskId = "";
    if (reviewForm) reviewForm.hidden = true;
    if (reviewActions) reviewActions.hidden = true;
    if (reviewError) reviewError.hidden = true;
  });
  root.querySelector<HTMLButtonElement>("[data-schedule-review-confirm]")?.addEventListener("click", () => {
    if (!draft || !reviewingTaskId || !editorMatchesDraft() || !storedDraftIsCurrent()) {
      reviewFail(context.zh ? "请先保存当前排程并重新核对任务。" : "Save the current schedule and review the task again.");
      return;
    }
    const approvedBy = root.querySelector<HTMLInputElement>("[data-schedule-reviewer]")?.value.trim() ?? "";
    const reason = root.querySelector<HTMLInputElement>("[data-schedule-review-reason]")?.value.trim() ?? "";
    if (!approvedBy || !reason) { reviewFail(context.zh ? "请填写判定人和具体原因。" : "Enter the reviewer and reason."); return; }
    const currentInputs = context.capacityInputsForDate(selectedDate);
    const currentBases = currentInputs ? buildScheduleCapacityBases({ ...currentInputs, schedule: draft.schedule }).bases : [];
    const currentGate = evaluateScheduleCapacityGate({ schedule: draft.schedule, routeId: context.routeId,
      planVersion: draft.planVersion, capacityBases: currentBases, approvals: draft.approvals ?? [] });
    const decision = currentGate.decisions.find(item => item.taskId === reviewingTaskId && item.status === "needsReview");
    const task = draft.schedule.tasks.find(item => item.id === reviewingTaskId);
    const basis = currentBases.find(item => item.taskId === reviewingTaskId);
    if (!decision || !task || !basis || currentGate.status === "conflict" || currentGate.status === "rejected"
      || currentGate.status === "incomplete") {
      reviewFail(context.zh ? "当前任务或能力依据已变化，不能沿用旧判定。" : "The task or capacity basis changed; review again.");
      return;
    }
    const approval: ScheduleRiskApproval = { approvalId: `schedule-review-${Date.now()}-${++nextRow}`,
      taskId: task.id, routeId: context.routeId, stationId: draft.schedule.stationId, productId: task.productId,
      windowStartAt: draft.schedule.windowStartAt, scheduleFingerprint: scheduleApprovalFingerprint(draft.schedule),
      planVersion: draft.planVersion,
      parameterVersion: basis.parameterVersion, targetPieces: task.targetPieces,
      bestCasePieces: basis.bestCasePieces, mostLikelyPieces: basis.mostLikelyPieces,
      startMinute: task.startMinute, endMinute: task.endMinute, approvedBy, approvedAt: new Date().toISOString(), reason };
    saveLocalState(key(current), JSON.stringify({ ...draft, approvals: [...(draft.approvals ?? []), approval] }));
    renderFutureSchedulePanel(root, context);
  });
  root.querySelectorAll<HTMLButtonElement>("[data-schedule-revoke]").forEach(button => button.addEventListener("click", () => {
    if (!draft || !editorMatchesDraft() || !storedDraftIsCurrent()) {
      reviewFail(context.zh ? "排程有未保存的更改或已在其他窗口更新；请先保存或刷新。" : "The schedule has unsaved or external changes; save or refresh first.");
      return;
    }
    const approvalId = button.dataset.scheduleRevoke ?? "";
    if (!capacityGate.decisions.some(item => item.approvalId === approvalId)) return;
    const approvals = (draft.approvals ?? []).map(item => item.approvalId === approvalId ? { ...item, revokedAt: new Date().toISOString() } : item);
    saveLocalState(key(current), JSON.stringify({ ...draft, approvals }));
    renderFutureSchedulePanel(root, context);
  }));
  root.querySelector<HTMLButtonElement>("[data-schedule-save]")?.addEventListener("click", () => {
    const error = root.querySelector<HTMLElement>("[data-schedule-error]");
    const fail = (message: string) => { if (error) { error.hidden = false; error.textContent = message; } };
    const planVersion = root.querySelector<HTMLInputElement>("#schedule-version")?.value.trim() ?? "";
    const sourceId = root.querySelector<HTMLInputElement>("#schedule-source")?.value.trim() ?? "";
    if (!planVersion || !sourceId) { fail(context.zh ? "请填写排程版本和来源。" : "Enter a plan version and source."); return; }
    const next = readScheduleEditor(root, displayContext);
    const checked = buildFutureScheduleTimeline(next);
    if (checked.status === "conflict") { fail(checked.issues.join("；")); return; }
    saveLocalState(key(current), JSON.stringify({ planVersion, sourceId, schedule: next,
      ...(draft?.approvals?.length ? { approvals: draft.approvals } : {}) } satisfies StoredScheduleDraft));
    renderFutureSchedulePanel(root, context);
  });
}
