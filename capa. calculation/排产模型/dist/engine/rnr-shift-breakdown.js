function overlapMinutes(start, end, shift) {
    return Math.max(0, Math.min(end, shift.endMinute) - Math.max(start, shift.startMinute));
}
export function buildRnrShiftBreakdown(input) {
    return input.shifts.map(shift => {
        const plannedProductionMinutes = input.planned.filter(event => event.kind === "production")
            .reduce((sum, event) => sum + overlapMinutes(event.startMinute, event.endMinute, shift), 0);
        const actualProductionMinutes = input.actual.filter(event => event.kind === "production")
            .reduce((sum, event) => sum + overlapMinutes(event.startMinute, event.endMinute, shift), 0);
        const actualNonProductionMinutes = input.actual.filter(event => event.kind !== "production")
            .reduce((sum, event) => sum + overlapMinutes(event.startMinute, event.endMinute, shift), 0);
        const production = input.actual.filter(event => event.kind === "production"
            && overlapMinutes(event.startMinute, event.endMinute, shift) > 0);
        const unallocatedProductionEventIds = production.filter(event => event.startMinute < shift.startMinute
            || event.endMinute > shift.endMinute)
            .map(event => event.id);
        const missingQuantity = production.some(event => !Number.isFinite(event.okQty) || !Number.isFinite(event.nokQty));
        const quantityStatus = unallocatedProductionEventIds.length ? "crossShift" : missingQuantity ? "missing" : "known";
        const quantitiesKnown = quantityStatus === "known";
        return {
            shift,
            plannedProductionMinutes,
            actualProductionMinutes,
            actualNonProductionMinutes,
            unrecordedMinutes: Math.max(0, shift.endMinute - shift.startMinute - actualProductionMinutes - actualNonProductionMinutes),
            okQty: quantitiesKnown ? production.reduce((sum, event) => sum + (event.okQty ?? 0), 0) : null,
            nokQty: quantitiesKnown ? production.reduce((sum, event) => sum + (event.nokQty ?? 0), 0) : null,
            quantityStatus,
            unallocatedProductionEventIds,
        };
    });
}
