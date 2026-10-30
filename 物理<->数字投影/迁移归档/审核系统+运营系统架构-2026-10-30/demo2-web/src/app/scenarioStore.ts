import { create } from 'zustand';
import { factoryLayoutDemoScenario } from '../data/factory-layout-demo-scenario';
import { calculateRoughMetrics } from '../features/rough-calculation/calculateRoughMetrics';
import { clearSceneDraft, loadSceneDraft, saveSceneDraft } from './scenePersistence';
import type { Demo2Scenario, DeliveryPoint, FactoryLayout, PathNetwork, ProductionStation, RoughCalculationResult, StorageArea } from '../types/demo2';

type LayoutDraftUpdate = {
  layout?: Partial<FactoryLayout>;
  storageAreas?: StorageArea[];
  productionStations?: ProductionStation[];
  deliveryPoints?: DeliveryPoint[];
  pathNetwork?: PathNetwork;
};

type PersistenceStatus = {
  source: 'sample' | 'savedDraft';
  isDirty: boolean;
  revision: number;
  lastSavedAt?: string;
  message: string;
};

type ScenarioStore = {
  scenario: Demo2Scenario;
  supermarketEnabled: boolean;
  activeScenarioId: string;
  roughCalculation: RoughCalculationResult;
  persistence: PersistenceStatus;
  toggleSupermarket: () => void;
  setActiveScenarioId: (scenarioId: string) => void;
  updateLayoutDraft: (update: LayoutDraftUpdate) => void;
  updateScenario: (updater: (scenario: Demo2Scenario) => Demo2Scenario) => void;
  saveCurrentDraft: () => void;
  resetToSample: () => void;
};

const loadedDraft = loadSceneDraft();
const initialScenario = loadedDraft?.scenario ?? factoryLayoutDemoScenario;
const initialSupermarketEnabled = initialScenario.settings.supermarketModeEnabled;
const initialPersistence: PersistenceStatus = loadedDraft
  ? {
      source: 'savedDraft',
      isDirty: false,
      revision: loadedDraft.revision,
      lastSavedAt: loadedDraft.savedAt,
      message: '已从本地草稿恢复'
    }
  : {
      source: 'sample',
      isDirty: false,
      revision: 0,
      message: '当前为标准样板，尚未保存草稿'
    };

export const useScenarioStore = create<ScenarioStore>((set, get) => ({
  scenario: initialScenario,
  supermarketEnabled: initialSupermarketEnabled,
  activeScenarioId: 'baseline',
  roughCalculation: calculateRoughMetrics(initialScenario, initialSupermarketEnabled),
  persistence: initialPersistence,
  toggleSupermarket: () =>
    set((state) => {
      const supermarketEnabled = !state.supermarketEnabled;
      return {
        supermarketEnabled,
        roughCalculation: calculateRoughMetrics(state.scenario, supermarketEnabled)
      };
    }),
  setActiveScenarioId: (scenarioId) => set({ activeScenarioId: scenarioId }),
  updateLayoutDraft: (update) =>
    set((state) => {
      const scenario = {
        ...state.scenario,
        layout: {
          ...state.scenario.layout,
          ...update.layout
        },
        storageAreas: update.storageAreas ?? state.scenario.storageAreas,
        productionStations: update.productionStations ?? state.scenario.productionStations,
        deliveryPoints: update.deliveryPoints ?? state.scenario.deliveryPoints,
        pathNetwork: update.pathNetwork ?? state.scenario.pathNetwork
      };

      return {
        scenario,
        persistence: {
          ...state.persistence,
          isDirty: true,
          message: '当前会话已同步，草稿尚未保存'
        },
        roughCalculation: calculateRoughMetrics(scenario, state.supermarketEnabled)
      };
    }),
  updateScenario: (updater) => set((state) => {
    const scenario = updater(state.scenario);
    return { scenario, roughCalculation: calculateRoughMetrics(scenario, state.supermarketEnabled), persistence: { ...state.persistence, isDirty: true, message: '当前参数已修改，草稿尚未保存' } };
  }),
  saveCurrentDraft: () => {
    const state = get();
    const savedDraft = saveSceneDraft(state.scenario, state.persistence.revision);
    if (!savedDraft) {
      set({
        persistence: {
          ...state.persistence,
          message: '当前浏览器不支持本地草稿保存'
        }
      });
      return;
    }

    set({
      persistence: {
        source: 'savedDraft',
        isDirty: false,
        revision: savedDraft.revision,
        lastSavedAt: savedDraft.savedAt,
        message: '本地草稿已保存，刷新后可恢复'
      }
    });
  },
  resetToSample: () => {
    clearSceneDraft();
    set({
      scenario: factoryLayoutDemoScenario,
      supermarketEnabled: factoryLayoutDemoScenario.settings.supermarketModeEnabled,
      activeScenarioId: 'baseline',
      roughCalculation: calculateRoughMetrics(factoryLayoutDemoScenario, factoryLayoutDemoScenario.settings.supermarketModeEnabled),
      persistence: {
        source: 'sample',
        isDirty: false,
        revision: 0,
        message: '已恢复标准样板，本地草稿已清除'
      }
    });
  }
}));
