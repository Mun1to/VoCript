import type { AppSettings } from "@/bindings";

/**
 * A "work profile" is a one-tap preset shown during onboarding. Picking one
 * applies a small set of sensible settings for that use case. The i18n strings
 * live under `onboarding.profiles.<id>.{label,description}`.
 *
 * `id` is also persisted in `work_profile` so later phases can tailor which
 * features get highlighted in the guided tour. "custom" means "I'll set it up
 * myself" and applies nothing (persisted as null).
 */
export interface WorkProfile {
  id: string;
  emoji: string;
  settings: Partial<AppSettings>;
}

export const WORK_PROFILES: WorkProfile[] = [
  {
    // Writing emails, notes, documents: normal dictation with a trailing space
    // so dictated phrases chain together cleanly.
    id: "writing",
    emoji: "📝",
    settings: { append_trailing_space: true },
  },
  {
    // Coding/commenting: no trailing space (you usually place the cursor
    // precisely); the personal dictionary shines for tech terms.
    id: "coding",
    emoji: "💻",
    settings: { append_trailing_space: false },
  },
  {
    // Transcribing meetings, calls and videos: highlights system audio, file
    // transcription and live mode. No setting changes needed.
    id: "meetings",
    emoji: "🎧",
    settings: {},
  },
  {
    // Students: lecture notes + transcribing recorded classes. Trailing space
    // for fluent note-taking; highlights file transcription in the tour.
    id: "study",
    emoji: "🎓",
    settings: { append_trailing_space: true },
  },
  {
    // Hands-free / accessibility: toggle mode (press once to start, once to
    // stop) so you don't need to hold a key down.
    id: "accessibility",
    emoji: "♿",
    settings: { push_to_talk: false },
  },
  {
    // Multiple languages / translation: let Whisper auto-detect the language.
    id: "multilingual",
    emoji: "🌍",
    settings: { selected_language: "auto" },
  },
];
