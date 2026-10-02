import type { BatchHUPolicy, CapacityScenario } from "../domain/types.js";

export type BatchHUStatus = "ok" | "needsApproval" | "invalid";

export interface BatchHUCheckInput {
  productId: string;
  operationId: string;
  quantity: number;
}

export interface BatchHUCheckResult {
  productId: string;
  operationId: string;
  quantity: number;
  policyId: string;
  minimumProcessHU: number;
  batchMultiple: number;
  fullMultiples: number;
  remainderQty: number;
  suggestedQuantity: number;
  status: BatchHUStatus;
  message: string;
}

export function checkBatchHUCompliance(
  scenario: CapacityScenario,
  input: BatchHUCheckInput,
): BatchHUCheckResult {
  const policy = findBatchHUPolicy(scenario, input.productId, input.operationId);
  const quantity = Math.max(0, input.quantity);
  const batchMultiple = Math.max(policy.batchMultiple, policy.minimumProcessHU, 1);
  const fullMultiples = Math.floor(quantity / batchMultiple);
  const remainderQty = quantity % batchMultiple;
  const suggestedQuantity = remainderQty === 0 ? quantity : (fullMultiples + 1) * batchMultiple;

  if (quantity < policy.minimumProcessHU) {
    return buildResult(input, policy, fullMultiples, remainderQty, suggestedQuantity, "invalid", `quantity ${quantity} is below minimum process HU ${policy.minimumProcessHU}`);
  }

  if (remainderQty === 0) {
    return buildResult(input, policy, fullMultiples, remainderQty, suggestedQuantity, "ok", `quantity ${quantity} matches batch multiple ${batchMultiple}`);
  }

  if (policy.roundingRule === "exceptionApproval") {
    return buildResult(input, policy, fullMultiples, remainderQty, suggestedQuantity, "needsApproval", `quantity ${quantity} is not a full HU multiple; exception approval required`);
  }

  if (policy.roundingRule === "roundUpToFullHU") {
    return buildResult(input, policy, fullMultiples, remainderQty, suggestedQuantity, "ok", `quantity ${quantity} should be rounded up to ${suggestedQuantity}`);
  }

  return buildResult(input, policy, fullMultiples, remainderQty, suggestedQuantity, "invalid", `quantity ${quantity} must be planned as full HU only`);
}

export function findBatchHUPolicy(
  scenario: CapacityScenario,
  productId: string,
  operationId: string,
): BatchHUPolicy {
  const policy = scenario.batchHUPolicies?.find(
    item => item.productId === productId && item.operationId === operationId,
  );
  if (!policy) throw new Error(`${productId} ${operationId} has no batch HU policy`);
  return policy;
}

function buildResult(
  input: BatchHUCheckInput,
  policy: BatchHUPolicy,
  fullMultiples: number,
  remainderQty: number,
  suggestedQuantity: number,
  status: BatchHUStatus,
  message: string,
): BatchHUCheckResult {
  return {
    productId: input.productId,
    operationId: input.operationId,
    quantity: Math.max(0, input.quantity),
    policyId: policy.policyId,
    minimumProcessHU: policy.minimumProcessHU,
    batchMultiple: Math.max(policy.batchMultiple, policy.minimumProcessHU, 1),
    fullMultiples,
    remainderQty,
    suggestedQuantity,
    status,
    message,
  };
}
