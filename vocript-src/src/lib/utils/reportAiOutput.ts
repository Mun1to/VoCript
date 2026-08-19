import { openUrl } from "@tauri-apps/plugin-opener";

/** Prefilled issue form for reporting text a model produced. */
const REPORT_URL =
  "https://github.com/Mun1to/VoCript/issues/new" +
  "?labels=ai-output&title=" +
  encodeURIComponent("AI output report: ");

/**
 * Opens the form for reporting text the models produced: a transcription that
 * came out wrong, or post-processing that rewrote it into something offensive
 * or misleading. Reachable from wherever that text is shown, not only from
 * Settings, which is what Microsoft Store policy 11.16 asks of any app that
 * shows generated content.
 *
 * What was dictated is deliberately NOT put in the URL. Those are the user's
 * own words: they would land in their browser history and in a public issue
 * without being asked. Whoever reports something pastes the part they choose.
 */
export function reportAiOutput(): void {
  void openUrl(REPORT_URL);
}
