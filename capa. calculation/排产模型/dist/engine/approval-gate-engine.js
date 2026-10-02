export function releasePlanningGate(input) {
    const approvalStatus = input.approvalStatus ?? input.assignment.approvalStatus;
    const approved = approvalStatus === "approved" || approvalStatus === "effective" || approvalStatus === "notRequired";
    const after = {
        ...input.assignment,
        approvalStatus,
        planningAllowed: approved ? true : input.assignment.planningAllowed,
    };
    if (approved) {
        delete after.planningBlockerReason;
    }
    else if (input.planningBlockerReason !== undefined) {
        after.planningBlockerReason = input.planningBlockerReason;
    }
    return {
        assignmentId: input.assignment.assignmentId,
        released: approved && !input.assignment.planningAllowed,
        before: input.assignment,
        after,
        message: approved
            ? `${input.assignment.assignmentId} planning gate released by ${approvalStatus}`
            : `${input.assignment.assignmentId} planning gate remains blocked by ${approvalStatus}`,
    };
}
export function canAssignmentBePlanned(assignment) {
    if (!assignment.planningAllowed)
        return false;
    if (!assignment.customerApprovalRequired)
        return true;
    return assignment.approvalStatus === "approved" || assignment.approvalStatus === "effective";
}
