import type { SidebarSection } from "../../components/Sidebar";

/**
 * One step of the guided tour. The i18n strings live under
 * `onboarding.tour.<id>.{title,body,...}`.
 *
 * - `section`: switch the sidebar to this section before showing the step
 *   (so the spotlighted element is visible).
 * - `target`: a `data-tour="..."` value to spotlight. Omit for a centered card.
 * - `practice`: render a small hands-on widget so the user can try the feature.
 * - `donate`: the closing step — shows the support/donation call to action.
 *
 * Phase 1 ships a representative subset (welcome → dictation → theme → donate);
 * later phases add the remaining features (system audio, files, live,
 * dictionary, history, shortcuts…).
 */
export interface TourStep {
  id: string;
  section?: SidebarSection;
  target?: string;
  practice?: "dictation" | "shortcut";
  donate?: boolean;
}

export const TOUR_STEPS: TourStep[] = [
  // 1. Welcome.
  { id: "welcome" },
  // 2. Configure first: a brand-new user has no shortcut muscle memory, so we
  //    embed the real shortcut control right in the card to set it live.
  { id: "shortcut", section: "general", practice: "shortcut" },
  // 3. Now try dictating with it.
  { id: "dictation", section: "general", practice: "dictation" },
  // 4. System audio (transcribe what's playing on the PC).
  { id: "systemAudio", section: "general", target: "shortcut-system" },
  // 5. Live transcription (floating capsule).
  { id: "live", section: "general", target: "shortcut-live" },
  // 6. Transcribe audio/video files.
  { id: "file", section: "file" },
  // 7. Personal dictionary (exact replacements).
  { id: "dictionary", section: "advanced", target: "dictionary" },
  // 8. History (re-listen and copy past transcriptions).
  { id: "history", section: "history" },
  // 9. Theme (light / dark / system).
  { id: "theme", section: "advanced", target: "theme-selector" },
  // 10. Closing + support.
  { id: "donate", section: "about", donate: true },
];
