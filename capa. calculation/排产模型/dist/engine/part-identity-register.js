export function emptyPartIdentityRegister() {
    return { nextSequence: 1, entries: [], externalMaterials: [], inputLinks: [] };
}
export function parsePartIdentityRegister(raw) {
    if (!raw)
        return emptyPartIdentityRegister();
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Invalid part identity register");
    const register = value;
    if (!Number.isSafeInteger(register.nextSequence) || register.nextSequence < 1 || !Array.isArray(register.entries)) {
        throw new Error("Invalid part identity register");
    }
    for (const entry of register.entries) {
        if (!entry || typeof entry !== "object" || ![entry.productId, entry.routeId, entry.routeVersion,
            entry.operationId, entry.partId, entry.temporaryPartNo, entry.englishName, entry.recordedAt].every(item => typeof item === "string")
            || !["new", "existing"].includes(entry.identityMode)) {
            throw new Error("Invalid part identity entry");
        }
    }
    const externalMaterials = register.externalMaterials ?? [];
    const inputLinks = register.inputLinks ?? [];
    if (!Array.isArray(externalMaterials) || !Array.isArray(inputLinks))
        throw new Error("Invalid part identity register");
    for (const material of externalMaterials) {
        if (!material || typeof material !== "object" || ![material.productId, material.routeId, material.routeVersion,
            material.partId, material.temporaryPartNo, material.englishName, material.recordedAt].every(item => typeof item === "string")
            || !["raw", "purchased", "other"].includes(material.kind))
            throw new Error("Invalid external input material");
    }
    for (const link of inputLinks) {
        if (!link || typeof link !== "object" || ![link.linkId, link.productId, link.routeId, link.routeVersion,
            link.operationId, link.partId, link.recordedAt].every(item => typeof item === "string")
            || (link.sourceOperationId !== undefined && typeof link.sourceOperationId !== "string")
            || !Number.isFinite(link.quantityPerOutput) || link.quantityPerOutput <= 0
            || !["pcs", "kg", "g", "m", "l"].includes(link.unit))
            throw new Error("Invalid operation input link");
    }
    return { ...register, externalMaterials, inputLinks };
}
function sameScope(left, right) {
    return left.productId === right.productId && left.routeId === right.routeId && left.routeVersion === right.routeVersion;
}
function nextTemporaryNumber(register) {
    const number = `TMP-${String(register.nextSequence).padStart(6, "0")}`;
    if (register.entries.some(entry => entry.temporaryPartNo === number)
        || register.externalMaterials.some(material => material.temporaryPartNo === number)) {
        throw new Error("Temporary part number is not unique");
    }
    return number;
}
function validEnglishName(value) {
    return /[A-Za-z]/.test(value) && !/[^\x20-\x7E]/.test(value);
}
export function findPartIdentityEntry(register, input) {
    return register.entries.find(entry => entry.productId === input.productId && entry.routeId === input.routeId
        && entry.routeVersion === input.routeVersion && entry.operationId === input.operationId);
}
export function recordPartIdentity(register, input, allowedSourceOperationIds, now, createId) {
    if (!input.productId || !input.routeId || !input.operationId || findPartIdentityEntry(register, input)) {
        throw new Error("Missing scope or operation already recorded");
    }
    let partId;
    let temporaryPartNo;
    let englishName;
    if (input.identityMode === "existing") {
        if (!input.sourceOperationId || !allowedSourceOperationIds.includes(input.sourceOperationId)) {
            throw new Error("Choose an earlier recorded operation");
        }
        const source = findPartIdentityEntry(register, { ...input, operationId: input.sourceOperationId });
        if (!source)
            throw new Error("Source part identity was not recorded");
        ({ partId, temporaryPartNo, englishName } = source);
    }
    else {
        englishName = input.englishName.trim();
        if (!validEnglishName(englishName)) {
            throw new Error("Enter an English part name");
        }
        partId = createId();
        if (!partId || register.entries.some(entry => entry.partId === partId)
            || register.externalMaterials.some(material => material.partId === partId))
            throw new Error("Part ID is not unique");
        temporaryPartNo = nextTemporaryNumber(register);
    }
    const entry = {
        productId: input.productId,
        routeId: input.routeId,
        routeVersion: input.routeVersion,
        operationId: input.operationId,
        partId,
        temporaryPartNo,
        englishName,
        identityMode: input.identityMode,
        ...(input.identityMode === "existing" ? { sourceOperationId: input.sourceOperationId } : {}),
        recordedAt: now,
    };
    return {
        ...register,
        nextSequence: register.nextSequence + (input.identityMode === "new" ? 1 : 0),
        entries: [...register.entries, entry],
    };
}
export function removePartIdentityEntry(register, entry) {
    if (!register.entries.includes(entry))
        throw new Error("Part identity entry not found");
    if (register.entries.some(other => other !== entry && other.productId === entry.productId
        && other.routeId === entry.routeId && other.routeVersion === entry.routeVersion
        && other.sourceOperationId === entry.operationId)) {
        throw new Error("This operation is still referenced by another output");
    }
    if (entry.identityMode === "new" && register.entries.some(other => other !== entry && other.partId === entry.partId)) {
        throw new Error("This part identity is still used by another operation");
    }
    if (register.inputLinks.some(link => sameScope(link, entry) && link.sourceOperationId === entry.operationId)) {
        throw new Error("This output is still used by an input link");
    }
    return { ...register, entries: register.entries.filter(other => other !== entry) };
}
export function recordExternalInputMaterial(register, input, now, createId) {
    const englishName = input.englishName.trim();
    if (!input.productId || !input.routeId || !validEnglishName(englishName))
        throw new Error("Enter an English material name");
    if (!["raw", "purchased", "other"].includes(input.kind))
        throw new Error("Invalid material type");
    const partId = createId();
    if (!partId || register.entries.some(entry => entry.partId === partId)
        || register.externalMaterials.some(material => material.partId === partId))
        throw new Error("Part ID is not unique");
    return {
        ...register,
        nextSequence: register.nextSequence + 1,
        externalMaterials: [...register.externalMaterials, {
                ...input, englishName, partId, temporaryPartNo: nextTemporaryNumber(register), recordedAt: now,
            }],
    };
}
export function removeExternalInputMaterial(register, material) {
    if (!register.externalMaterials.includes(material))
        throw new Error("External material not found");
    if (register.inputLinks.some(link => sameScope(link, material) && link.partId === material.partId)) {
        throw new Error("This material is still used by an input link");
    }
    return { ...register, externalMaterials: register.externalMaterials.filter(item => item !== material) };
}
export function recordOperationInputLink(register, input, allowedPredecessorOperationIds, now, createId) {
    if (!input.productId || !input.routeId || !input.operationId || !Number.isFinite(input.quantityPerOutput)
        || input.quantityPerOutput <= 0 || !["pcs", "kg", "g", "m", "l"].includes(input.unit)) {
        throw new Error("Enter a positive input quantity and unit");
    }
    if (input.sourceOperationId) {
        if (!allowedPredecessorOperationIds.includes(input.sourceOperationId))
            throw new Error("Source operation is not a route predecessor");
        const source = findPartIdentityEntry(register, { ...input, operationId: input.sourceOperationId });
        if (!source || source.partId !== input.partId)
            throw new Error("Source output identity does not match");
    }
    else if (!register.externalMaterials.some(material => sameScope(material, input) && material.partId === input.partId)) {
        throw new Error("External input material was not registered");
    }
    if (register.inputLinks.some(link => sameScope(link, input) && link.operationId === input.operationId
        && link.partId === input.partId && link.sourceOperationId === input.sourceOperationId)) {
        throw new Error("Input link already recorded");
    }
    const linkId = createId();
    if (!linkId || register.inputLinks.some(link => link.linkId === linkId))
        throw new Error("Input link ID is not unique");
    return { ...register, inputLinks: [...register.inputLinks, { ...input, linkId, recordedAt: now }] };
}
export function removeOperationInputLink(register, link) {
    if (!register.inputLinks.includes(link))
        throw new Error("Input link not found");
    return { ...register, inputLinks: register.inputLinks.filter(item => item !== link) };
}
export function missingPredecessorInputs(register, scope, operations) {
    return operations.flatMap(operation => (operation.predecessorOperationIds ?? []).filter(sourceOperationId => {
        const source = findPartIdentityEntry(register, { ...scope, operationId: sourceOperationId });
        return !source || !register.inputLinks.some(link => sameScope(link, scope)
            && link.operationId === operation.operationId && link.sourceOperationId === sourceOperationId
            && link.partId === source.partId);
    }).map(predecessorOperationId => ({ operationId: operation.operationId, predecessorOperationId })));
}
export function invalidOperationInputLinks(register, scope, operations) {
    return register.inputLinks.filter(link => sameScope(link, scope)).flatMap(link => {
        const target = operations.find(operation => operation.operationId === link.operationId);
        if (!target)
            return [{ linkId: link.linkId, reason: "target_missing" }];
        if (link.sourceOperationId) {
            if (!target.predecessorOperationIds?.includes(link.sourceOperationId)) {
                return [{ linkId: link.linkId, reason: "source_not_predecessor" }];
            }
            const source = findPartIdentityEntry(register, { ...scope, operationId: link.sourceOperationId });
            if (!source)
                return [{ linkId: link.linkId, reason: "source_missing" }];
            if (source.partId !== link.partId)
                return [{ linkId: link.linkId, reason: "part_mismatch" }];
        }
        else if (!register.externalMaterials.some(material => sameScope(material, scope) && material.partId === link.partId)) {
            return [{ linkId: link.linkId, reason: "material_missing" }];
        }
        return [];
    });
}
