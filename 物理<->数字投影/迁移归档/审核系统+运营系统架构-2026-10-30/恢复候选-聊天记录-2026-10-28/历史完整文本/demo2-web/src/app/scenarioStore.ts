import { create } from 'zustand';
import standardDemoScenario from '../data/standard-demo-scenario.json';
import type { Demo2Scenario } from '../types/demo2';

type ScenarioStore = {
  scenario: Demo2Scenario;
  supermarketEnabled: boolean;
  activeScenarioId: string;
  toggleSupermarket: () => void;
  setActiveScenarioId: (scenarioId: string) => void;
};

export const useScenarioStore = create<ScenarioStore>((set) => ({
  scenario: standardDemoScenario as Demo2Scenario,
  supermarketEnabled: (standardDemoScenario as Demo2Scenario).settings.supermarketModeEnabled,
  activeScenarioId: 'baseline',
  toggleSupermarket: () => set((state) => ({ supermarketEnabled: !state.supermarketEnabled })),
  setActiveScenarioId: (scenarioId) => set({ activeScenarioId: scenarioId })
}));
