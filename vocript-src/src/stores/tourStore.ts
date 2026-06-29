import { create } from "zustand";

/**
 * Lightweight state for the guided tour overlay. App.tsx renders <GuidedTour>
 * based on `isActive`; the footer "Guía" button and the onboarding flow call
 * `start()`. Kept separate from the settings store because it's purely UI
 * (whether the tour has *ever* been completed is persisted in settings as
 * `tour_completed`).
 */
interface TourStore {
  isActive: boolean;
  stepIndex: number;
  start: () => void;
  stop: () => void;
  setStep: (index: number) => void;
}

export const useTourStore = create<TourStore>((set) => ({
  isActive: false,
  stepIndex: 0,
  start: () => set({ isActive: true, stepIndex: 0 }),
  stop: () => set({ isActive: false, stepIndex: 0 }),
  setStep: (index) => set({ stepIndex: index }),
}));
