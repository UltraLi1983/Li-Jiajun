import type { ApprovalStatus, OperationStationAssignment } from "../domain/types.js";

export interface ApprovalGateReleaseInput {
  assignment: OperationStationAssignment;
  approvalStatus?: ApprovalStatus;
  planningBlockerReason?: string;
}

export interface ApprovalGateReleaseResult {
  assignmentId: string;
  released: boolean;
  before: OperationStationAssignment;
  after: OperationStationAssignment;
  message: string;
}

export function releasePlanningGate(input: ApprovalGateReleaseInput): ApprovalGateReleaseResult {
  const approvalStatus = input.approvalStatus ?? input.assignment.approvalStatus;
  const approved = approvalStatus === "approved" || approvalStatus === "effective" || approvalStatus === "notRequired";
  const after: OperationStationAssignment = {
    ...input.assignment,
    approvalStatus,
    planningAllowed: approved ? true : input.assignment.planningAllowed,
  };

  if (approved) {
    delete after.planningBlockerReason;
  } else if (input.planningBlockerReason !== undefined) {
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

export function canAssignmentBePlanned(assignment: OperationStationAssignment): boolean {
  if (!assignment.planningAllowed) return false;
  if (!assignment.customerApprovalRequired) return true;
  return assignment.approvalStatus === "approved" || assignment.approvalStatus === "effective";
}
