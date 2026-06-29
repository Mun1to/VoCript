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
 * The tour walks the main features end to end: welcome → shortcut → dictation
 * → system audio → source, then each header control one by one (profile →
 * voice → system → output → activation → language → theme) → files → custom
 * words → dictionary → history → feedback → donate.
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
  // 5. Source attribution (tag song/app/video + YouTube link).
  { id: "audioSource", section: "general", target: "audio-source" },
  // 6–12. Header walk-through, one control at a time (left → right).
  { id: "headerProfile", section: "general", target: "header-profile" },
  { id: "headerVoice", section: "general", target: "header-voice" },
  { id: "headerSystem", section: "general", target: "header-system" },
  { id: "headerOutput", section: "general", target: "header-output" },
  { id: "headerActivation", section: "general", target: "header-activation" },
  { id: "headerLanguage", section: "general", target: "header-language" },
  { id: "headerTheme", section: "general", target: "header-theme" },
  // 13. Transcribe audio/video files.
  { id: "file", section: "file" },
  // 14. Custom words (phonetic auto-correction toward your list).
  { id: "customWords", section: "advanced", target: "custom-words" },
  // 15. Personal dictionary (exact replacements).
  { id: "dictionary", section: "advanced", target: "dictionary" },
  // 16. History (re-listen and copy past transcriptions).
  { id: "history", section: "history" },
  // 17. Feedback (send ideas / bugs straight to a GitHub issue).
  { id: "feedback", section: "feedback", target: "feedback" },
  // 18. Closing + support.
  { id: "donate", section: "about", donate: true },
];
