const DAY_MINUTES = 1440;
const OPEN_SHIFT_FIELDS = ["productionMinutes", "breakMinutes", "setupMinutes", "maintenanceMinutes", "plannedStopMinutes"];
export function maxShiftsForLength(shiftMinutes) {
    return shiftMinutes === 720 ? 2 : 3;
}
export function validateManualMinutes(input, date) {
    const issues = [];
    const reject = (field, message) => issues.push({ code: "manual_invalid", date, field, message });
    if (input.shiftMinutes !== 480 && input.shiftMinutes !== 720)
        reject("shiftMinutes", "班次时长只能是 8 小时或 12 小时");
    const maxShifts = maxShiftsForLength(input.shiftMinutes);
    if (!Number.isSafeInteger(input.shiftsPerDay) || input.shiftsPerDay < 1 || input.shiftsPerDay > maxShifts) {
        reject("shiftsPerDay", input.shiftMinutes === 720 ? "12 小时每天只能排 1 或 2 班" : "8 小时每天只能排 1、2 或 3 班");
    }
    const opened = input.shiftMinutes * input.shiftsPerDay;
    if (Number.isFinite(opened) && opened > DAY_MINUTES)
        reject("shiftsPerDay", "排班分钟不能超过 24 小时");
    for (const field of OPEN_SHIFT_FIELDS) {
        const value = input[field];
        if (!Number.isFinite(value) || !Number.isSafeInteger(value) || value < 0)
            reject(field, "动作分钟必须是非负整数");
    }
    if (!issues.length) {
        const total = OPEN_SHIFT_FIELDS.reduce((sum, field) => sum + input[field], 0);
        if (total !== opened)
            reject("total", `动作合计 ${total} 分钟，须排满 ${opened} 分钟`);
    }
    return issues;
}
export function buildWeekMinuteLedger(input) {
    if (input.choices.length !== 7)
        throw new Error("A week ledger requires seven days");
    const dates = Array.from({ length: 7 }, (_, index) => addDays(input.weekStartDate, index));
    const issues = [];
    const copyEvents = input.copy?.issues.length ? [] : input.copy?.events ?? [];
    if (input.copy?.issues.length)
        issues.push({ code: "copy_failed", message: "复制源窗口未能生成" });
    const spilled = spillTargets(copyEvents, input.dayStartMinute, dates);
    const choices = input.choices.map((choice, index) => spilled.has(index) && choice.mode !== "copy" ? { mode: "occupied" } : choice);
    choices.forEach((choice, index) => {
        const date = dates[index];
        if (choice.mode === "occupied" && !spilled.has(index)) {
            issues.push({ code: "occupied_without_span", date, message: "该日没有被相邻复制占用" });
        }
        if (spilled.has(index) && input.choices[index].mode !== "occupied" && input.choices[index].mode !== "off") {
            issues.push({ code: "span_conflict", date, message: `该日被 ${spilled.get(index)} 的复制占用，不能标为平稳日或再次复制` });
        }
        if (spilled.has(index) && input.choices[index].mode === "off") {
            issues.push({ code: "span_conflict", date, message: `该日被 ${spilled.get(index)} 的复制占用，不能标为非工作日` });
        }
        if (choice.mode === "manual") {
            if (!choice.manual)
                issues.push({ code: "manual_invalid", date, field: "manual", message: "平稳日尚未提交分钟" });
            else
                issues.push(...validateManualMinutes(choice.manual, date));
        }
    });
    const copyStale = input.sourceCurrent === false && choices.some(choice => choice.mode === "copy" || choice.mode === "occupied");
    if (copyStale)
        issues.push({ code: "source_stale", message: "源窗口已变化，复制日不能继续使用" });
    const days = dates.map((date, index) => {
        const occupiedByDate = spilled.get(index);
        return rowForDay({
            date, index, choice: choices[index], dayStartMinute: input.dayStartMinute, copyEvents,
            stale: copyStale && (choices[index].mode === "copy" || choices[index].mode === "occupied"),
            ...(occupiedByDate ? { occupiedByDate } : {}),
        });
    });
    const usable = issues.length === 0;
    return {
        weekStartDate: input.weekStartDate,
        dayStartMinute: input.dayStartMinute,
        issues,
        days,
        copyEvents: usable ? copyEvents : [],
        ...(usable ? { summary: summarizeLedger(days) } : {}),
    };
}
export function arrangeFourWeekLedger(first, following) {
    if (!first.summary || following.length !== 3)
        throw new Error("A usable first week and three following modes are required");
    const weeks = [{ weekNumber: 1, weekStartDate: first.weekStartDate, mode: "defined", days: first.days, summary: first.summary }];
    following.forEach((item, index) => {
        const weekNumber = index + 2;
        const weekStartDate = addDays(first.weekStartDate, weekNumber * 7 - 7);
        if (item.mode === "off") {
            const days = emptyWeek(weekStartDate, first.dayStartMinute);
            weeks.push({ weekNumber, weekStartDate, mode: "off", days, summary: summarizeLedger(days) });
            return;
        }
        if (item.mode === "copy") {
            const days = first.days.map((day, dayIndex) => ({ ...day, date: addDays(weekStartDate, dayIndex) }));
            weeks.push({ weekNumber, weekStartDate, mode: "copy", days, summary: summarizeLedger(days) });
            return;
        }
        if (!item.week?.summary)
            throw new Error(`Week ${weekNumber} independent arrangement is incomplete`);
        weeks.push({ weekNumber, weekStartDate: item.week.weekStartDate, mode: "independent", days: item.week.days, summary: item.week.summary });
    });
    const days = weeks.flatMap(week => week.days);
    return { weeks, days, summary: summarizeLedger(days, 4) };
}
export function repeatWeekForMonth(first, allowance = { occurrences: 0, minutesPerOccurrence: 0 }) {
    const repeated = arrangeFourWeekLedger(first, [{ mode: "copy" }, { mode: "copy" }, { mode: "copy" }]);
    const base = repeated.summary;
    if (!base)
        throw new Error("A repeated month requires a usable week summary");
    const issues = validateMonthlySetup(allowance, base.productionMinutes);
    const deducted = issues.length || allowance.occurrences === 0 ? 0 : allowance.occurrences * allowance.minutesPerOccurrence;
    const production = base.productionMinutes - deducted;
    return {
        ...repeated,
        issues,
        setupAllowanceMinutes: deducted,
        summary: {
            ...base,
            productionMinutes: production,
            ...(base.withBreaksDenominator > 0 ? { withBreaksSa: production / base.withBreaksDenominator } : {}),
            ...(base.withoutBreaksDenominator > 0 ? { withoutBreaksSa: production / base.withoutBreaksDenominator } : {}),
            ...(base.calendarDenominator > 0 ? { calendarUtilization: production / base.calendarDenominator } : {}),
        },
    };
}
function validateMonthlySetup(allowance, productionMinutes) {
    const issues = [];
    if (![0, 1, 2, 3].includes(allowance.occurrences))
        issues.push({ code: "monthly_setup", field: "occurrences", message: "月内换型次数只能是 0、1、2 或 3" });
    if (!Number.isSafeInteger(allowance.minutesPerOccurrence) || allowance.minutesPerOccurrence < 0)
        issues.push({ code: "monthly_setup", field: "minutesPerOccurrence", message: "单次换型分钟必须是非负整数" });
    const deducted = allowance.occurrences > 0 ? allowance.occurrences * allowance.minutesPerOccurrence : 0;
    if (!issues.length && deducted > productionMinutes)
        issues.push({ code: "monthly_setup", field: "minutesPerOccurrence", message: `月内换型 ${deducted} 分钟，超过本月生产 ${productionMinutes} 分钟` });
    return issues;
}
export function summarizeLedger(rows, weekCount = Math.max(1, rows.length / 7)) {
    const working = rows.filter(row => row.workingDay && !row.stale);
    const production = working.reduce((sum, row) => sum + row.productionMinutes, 0);
    const scheduled = working.reduce((sum, row) => sum + row.scheduledMinutes, 0);
    const breaks = working.reduce((sum, row) => sum + row.breakMinutes, 0);
    const withBreaksDenominator = working.length * DAY_MINUTES;
    const withoutBreaksDenominator = scheduled - breaks;
    const calendarDenominator = weekCount * 7 * DAY_MINUTES;
    const calendarProduction = rows.reduce((sum, row) => sum + (row.stale ? 0 : row.productionMinutes), 0);
    return {
        workingDayCount: working.length,
        productionMinutes: production,
        scheduledMinutes: scheduled,
        breakMinutes: breaks,
        withBreaksDenominator,
        withoutBreaksDenominator,
        ...(withBreaksDenominator > 0 ? { withBreaksSa: production / withBreaksDenominator } : {}),
        ...(withoutBreaksDenominator > 0 ? { withoutBreaksSa: production / withoutBreaksDenominator } : {}),
        ...(calendarDenominator > 0 ? { calendarUtilization: calendarProduction / calendarDenominator } : {}),
        calendarDenominator,
        usable: rows.every(row => !row.stale),
    };
}
function rowForDay(input) {
    const blank = {
        date: input.date, dayIndex: input.index, mode: input.choice.mode, workingDay: false, stale: input.stale,
        scheduledMinutes: 0, offShiftMinutes: 0, productionMinutes: 0, breakMinutes: 0, setupMinutes: 0,
        maintenanceMinutes: 0, plannedStopMinutes: 0, unscheduledMinutes: 0, bestCaseAvailableMinutes: 0,
    };
    if (input.choice.mode === "off")
        return blank;
    if (input.choice.mode === "manual" && input.choice.manual && !validateManualMinutes(input.choice.manual, input.date).length) {
        const manual = input.choice.manual;
        const opened = manual.shiftMinutes * manual.shiftsPerDay;
        const unscheduled = DAY_MINUTES - opened;
        return {
            ...blank,
            workingDay: true,
            scheduledMinutes: opened,
            offShiftMinutes: 0,
            productionMinutes: manual.productionMinutes,
            breakMinutes: manual.breakMinutes,
            setupMinutes: manual.setupMinutes,
            maintenanceMinutes: manual.maintenanceMinutes,
            plannedStopMinutes: manual.plannedStopMinutes,
            unscheduledMinutes: unscheduled,
            bestCaseAvailableMinutes: manual.productionMinutes,
            origin: "manualMinutes",
        };
    }
    if (input.choice.mode === "copy" || input.choice.mode === "occupied") {
        const minutes = minutesInDay(input.copyEvents, input.index, input.dayStartMinute);
        const scheduled = minutes.production + minutes.break + minutes.setup + minutes.maintenance + minutes.plannedStop + minutes.unscheduled;
        return {
            ...blank,
            workingDay: true,
            scheduledMinutes: scheduled,
            offShiftMinutes: Math.max(0, DAY_MINUTES - scheduled),
            productionMinutes: minutes.production,
            breakMinutes: minutes.break,
            setupMinutes: minutes.setup,
            maintenanceMinutes: minutes.maintenance,
            plannedStopMinutes: minutes.plannedStop,
            unscheduledMinutes: minutes.unscheduled,
            bestCaseAvailableMinutes: minutes.production,
            origin: "sourceCopy",
            ...(input.occupiedByDate ? { occupiedByDate: input.occupiedByDate } : {}),
            sourceEventIds: input.copyEvents.filter(event => overlapsDay(event, input.index, input.dayStartMinute)).map(event => event.sourceEventId ?? event.id),
        };
    }
    return blank;
}
function minutesInDay(events, dayIndex, dayStartMinute) {
    const totals = { production: 0, break: 0, setup: 0, maintenance: 0, plannedStop: 0, unscheduled: 0 };
    for (const event of events) {
        const minutes = overlapMinutes(event, dayIndex, dayStartMinute);
        if (event.kind === "production")
            totals.production += minutes;
        else if (event.kind === "break")
            totals.break += minutes;
        else if (event.kind === "setup")
            totals.setup += minutes;
        else if (event.kind === "maintenance")
            totals.maintenance += minutes;
        else if (event.kind === "plannedStop")
            totals.plannedStop += minutes;
        else if (event.kind === "unscheduled")
            totals.unscheduled += minutes;
    }
    return totals;
}
function spillTargets(events, dayStartMinute, dates) {
    const spilled = new Map();
    for (const event of events) {
        const home = dates.indexOf(event.occurrenceDate);
        const last = dayIndexOf(event.endMinute - 1, dayStartMinute);
        for (let index = home + 1; index <= last; index += 1) {
            if (index >= 0 && index < 7)
                spilled.set(index, event.occurrenceDate);
        }
    }
    return spilled;
}
function overlapsDay(event, dayIndex, dayStartMinute) {
    return overlapMinutes(event, dayIndex, dayStartMinute) > 0;
}
function overlapMinutes(event, dayIndex, dayStartMinute) {
    const start = dayIndex * DAY_MINUTES + dayStartMinute;
    return Math.max(0, Math.min(event.endMinute, start + DAY_MINUTES) - Math.max(event.startMinute, start));
}
function dayIndexOf(minute, dayStartMinute) {
    return Math.floor((minute - dayStartMinute) / DAY_MINUTES);
}
function emptyWeek(weekStartDate, dayStartMinute) {
    return Array.from({ length: 7 }, (_, index) => rowForDay({
        date: addDays(weekStartDate, index), index, choice: { mode: "off" }, dayStartMinute, copyEvents: [], stale: false,
    }));
}
function addDays(isoDate, days) {
    const time = Date.parse(`${isoDate}T00:00:00Z`);
    return new Date(time + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
