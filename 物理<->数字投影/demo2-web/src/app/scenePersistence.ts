import type { Demo2Scenario } from '../types/demo2';

const STORAGE_KEY = 'demo2.factoryScene.draft.v1';
const BACKUP_KEY = 'demo2.factoryScene.draft.backup.v1';

export type PersistedSceneDraft = {
  schemaVersion: 'demo2-scene-draft-v1';
  revision: number;
  savedAt: string;
  scenario: Demo2Scenario;
};

export function loadSceneDraft(): PersistedSceneDraft | null {
  if (!canUseLocalStorage()) return null;

  try {
    const rawDraft = window.localStorage.getItem(STORAGE_KEY);
    if (!rawDraft) return null;

    const parsedDraft = JSON.parse(rawDraft) as PersistedSceneDraft;
    if (!isPersistedSceneDraft(parsedDraft)) return null;
    return parsedDraft;
  } catch {
    return null;
  }
}

export function saveSceneDraft(scenario: Demo2Scenario, currentRevision = 0): PersistedSceneDraft | null {
  if (!canUseLocalStorage()) return null;

  const draft: PersistedSceneDraft = {
    schemaVersion: 'demo2-scene-draft-v1',
    revision: currentRevision + 1,
    savedAt: new Date().toISOString(),
    scenario
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  return draft;
}

export function clearSceneDraft() {
  if (!canUseLocalStorage()) return false;
  try {
    const currentDraft = window.localStorage.getItem(STORAGE_KEY);
    if (currentDraft) window.localStorage.setItem(BACKUP_KEY, currentDraft);
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    // 备份失败时保留原草稿，避免清除唯一可恢复的场景。
    return false;
  }
}

export function restoreSceneBackup(): PersistedSceneDraft | null {
  if (!canUseLocalStorage()) return null;
  try {
    const rawBackup = window.localStorage.getItem(BACKUP_KEY);
    if (!rawBackup) return null;
    const backup = JSON.parse(rawBackup) as PersistedSceneDraft;
    if (!isPersistedSceneDraft(backup)) return null;
    window.localStorage.setItem(STORAGE_KEY, rawBackup);
    return backup;
  } catch {
    return null;
  }
}

function canUseLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function isPersistedSceneDraft(value: unknown): value is PersistedSceneDraft {
  if (!value || typeof value !== 'object') return false;

  const draft = value as Partial<PersistedSceneDraft>;
  return draft.schemaVersion === 'demo2-scene-draft-v1'
    && typeof draft.revision === 'number'
    && typeof draft.savedAt === 'string'
    && Boolean(draft.scenario)
    && typeof draft.scenario?.id === 'string'
    && Boolean(draft.scenario.layout)
    && Array.isArray(draft.scenario.storageAreas)
    && Array.isArray(draft.scenario.deliveryPoints)
    && Array.isArray(draft.scenario.pathNetwork?.nodes)
    && Array.isArray(draft.scenario.pathNetwork?.segments);
}
