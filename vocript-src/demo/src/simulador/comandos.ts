// El backend de la demo: responde a los mismos 145 comandos que en la app
// contesta Rust.
//
// Todos entran por un solo sitio porque `bindings.ts` los invoca a través del
// `invoke` de `@tauri-apps/api/core`, y el build de la demo redirige ese módulo
// aquí. La app no sabe que está hablando con esto.
//
// Cómo se reparte el trabajo:
//  - Los comandos de LECTURA devuelven los datos de `estado.ts`. Son los que
//    tienen que estar bien: el tipo de retorno debe ser EXACTAMENTE el de
//    `bindings.ts`. Devolver un array donde se espera `{ entries: [...] }` no
//    da un error claro, da una pantalla en blanco: la app leyó `.entries` del
//    array, se encontró el método nativo de JavaScript y se lo pasó a React
//    como si fuera el estado nuevo.
//  - Los de ESCRITURA (`change_*_setting`) devuelven éxito y ya está. La app
//    actualiza su propio estado antes de llamar aquí y no vuelve a preguntar,
//    así que los ajustes de la demo se cambian de verdad y se ven al momento.
//  - Los que tocan el micrófono, el disco o la red avisan de que eso solo va en
//    la app instalada, en vez de no hacer nada en silencio.
//
// La lista de comandos y sus firmas salen de `src/bindings.ts`, que genera
// tauri-specta. Si un día la app deja de arrancar aquí, empieza comparando.

import { avisarNoDisponible } from "./aviso";
import {
  ajustes,
  ajustesPorDefecto,
  appsConAudio,
  estadisticas,
  estado,
  fuentesDelSistema,
  historial,
  microfonos,
  modelos,
  salidasDeAudio,
} from "./estado";

type Argumentos = Record<string, unknown>;
type Manejador = (args: Argumentos) => unknown;

const RUTA_DATOS = "C:\\Users\\demo\\AppData\\Roaming\\app.vocript";

/** Comandos que devuelven datos. El resto contesta `null`. */
const LECTURAS: Record<string, Manejador> = {
  get_app_settings: () => ajustes,
  get_default_settings: () => ajustesPorDefecto,

  get_available_models: () => modelos,
  get_model_info: (a) => modelos.find((m) => m.id === a.modelId) ?? null,
  get_current_model: () => estado.modeloActual ?? "",
  get_model_load_status: () => ({
    is_loaded: estado.modeloCargado,
    current_model: estado.modeloActual,
    last_transcription_ms: estado.ultimaTranscripcionMs,
  }),
  is_model_loading: () => false,
  has_any_models_available: () => true,
  has_any_models_or_downloads: () => true,
  get_transcription_model_status: () => estado.modeloActual,
  scan_for_external_models: () => [],

  get_available_microphones: () => microfonos,
  get_selected_microphone: () => (ajustes.selected_microphone as string) ?? "",
  get_available_output_devices: () => salidasDeAudio,
  get_selected_output_device: () => (ajustes.selected_output_device as string) ?? "",
  get_clamshell_microphone: () => (ajustes.clamshell_microphone as string) ?? "",
  // Devuelve un booleano, no el nombre del modo: es "micrófono siempre abierto".
  get_microphone_mode: () => Boolean(ajustes.always_on_microphone),
  // Solo los nombres de los ejecutables.
  list_system_audio_apps: () => appsConAudio.map((a) => a.executable),
  is_recording: () => estado.grabando,

  // `PaginatedHistory`, no una lista pelada.
  get_history_entries: (a) => {
    const limite = typeof a.limit === "number" ? a.limit : historial.length;
    const desde = typeof a.cursor === "number" ? a.cursor : 0;
    const trozo = historial.slice(desde, desde + limite);
    return { entries: trozo, has_more: desde + trozo.length < historial.length };
  },
  get_dictation_stats: () => estadisticas,
  get_typing_wpm_baseline: () => 40,

  get_system_fonts: () => fuentesDelSistema,
  get_system_theme: () =>
    window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark",

  get_app_dir_path: () => RUTA_DATOS,
  get_log_dir_path: () => `${RUTA_DATOS}\\logs`,
  is_packaged: () => true,
  is_portable: () => false,
  is_laptop: () => false,
  has_custom_overlay_position: () => false,
  install_location_mismatch: () => null,
  install_paths: () => ({
    running_from: "C:\\Program Files\\VoCript",
    updates_go_to: "C:\\Program Files\\VoCript",
  }),

  get_available_accelerators: () => ({
    whisper: ["auto", "cpu", "gpu"],
    ort: ["auto", "cpu", "directml"],
    gpu_devices: [],
  }),
  get_keyboard_implementation: () => "tauri",
  get_available_typing_tools: () => [],
  check_apple_intelligence_available: () => false,
  check_custom_sounds: () => ({ start: false, stop: false }),
  fetch_post_process_models: () => [],
  detect_local_post_process_provider: () => false,
  count_wake_word_recordings: () => 0,
  read_text_file: () => "",
  get_audio_file_path: () => "",

  get_windows_microphone_permission_status: () => ({
    supported: true,
    overall_access: "allowed",
    device_access: "allowed",
    app_access: "allowed",
    desktop_app_access: "allowed",
  }),

  get_tray_menu_state: () => ({
    version_label: "demo",
    live_voice: false,
    live_system: false,
    model_loaded: estado.modeloCargado,
    is_busy: false,
    update_checks_enabled: true,
    models: [],
    active_model_name:
      modelos.find((m) => m.id === estado.modeloActual)?.name ?? null,
    languages: [],
    active_language_native: "English",
    available_update: null,
  }),
};

/**
 * Comandos que en la app tocan el micrófono, el disco o la red. Aquí avisan de
 * que eso solo va instalado: una demo que se traga la pulsación sin decir nada
 * parece rota.
 */
const NO_DISPONIBLES: Record<string, "microfono" | "archivos" | "descarga" | "sistema"> = {
  capture_wake_word_sample: "microfono",
  start_handy_keys_recording: "microfono",
  stop_handy_keys_recording: "microfono",

  download_model: "descarga",
  cancel_download: "descarga",
  delete_model: "descarga",
  import_model_from_path: "descarga",

  transcribe_file: "archivos",
  save_text_file: "archivos",
  open_app_data_dir: "archivos",
  open_log_dir: "archivos",
  open_recordings_folder: "archivos",
  retry_history_entry_transcription: "archivos",
  get_audio_file_data: "archivos",

  open_microphone_privacy_settings: "sistema",
  change_autostart_setting: "sistema",
};

/**
 * Ajustes que además se guardan aquí, para que sobrevivan si alguna pantalla
 * vuelve a pedir los ajustes enteros. La app no lo necesita (se los guarda
 * ella), pero si un día lo hiciera, la demo no perdería lo cambiado.
 */
const GUARDAR_AJUSTE: Record<string, string> = {
  change_theme_setting: "theme",
  change_accent_color_setting: "accent_color",
  change_accent_tint_surfaces_setting: "accent_tint_surfaces",
  change_app_language_setting: "app_language",
  change_selected_language_setting: "selected_language",
  change_work_profile_setting: "work_profile",
  change_ui_font_setting: "ui_font",
  change_ui_font_size_setting: "ui_font_size",
  change_ptt_setting: "push_to_talk",
  change_audio_feedback_setting: "audio_feedback",
  change_audio_feedback_volume_setting: "audio_feedback_volume",
  change_sound_theme_setting: "sound_theme",
  change_translate_to_english_setting: "translate_to_english",
  change_debug_mode_setting: "debug_mode",
  change_overlay_position_setting: "overlay_position",
  change_paste_method_setting: "paste_method",
  change_clipboard_handling_setting: "clipboard_handling",
  change_clipboard_only_setting: "clipboard_only",
  change_live_mode_setting: "live_mode",
  change_live_auto_paste_setting: "live_auto_paste",
  change_dictation_stats_setting: "track_dictation_stats",
  change_show_tray_icon_setting: "show_tray_icon",
  change_start_hidden_setting: "start_hidden",
  change_append_trailing_space_setting: "append_trailing_space",
  change_auto_submit_setting: "auto_submit",
  change_auto_submit_key_setting: "auto_submit_key",
  change_mute_in_calls_setting: "mute_in_calls",
  change_mute_while_recording_setting: "mute_while_recording",
  change_wake_word_setting: "wake_word_enabled",
  change_update_checks_setting: "update_checks_enabled",
  change_word_correction_threshold_setting: "word_correction_threshold",
  change_paste_delay_ms_setting: "paste_delay_ms",
  change_extra_recording_buffer_setting: "extra_recording_buffer_ms",
  change_post_process_enabled_setting: "post_process_enabled",
  set_active_model: "selected_model",
  set_selected_microphone: "selected_microphone",
  set_selected_output_device: "selected_output_device",
  set_clamshell_microphone: "clamshell_microphone",
  set_system_audio_app: "system_audio_app",
  set_model_unload_timeout: "model_unload_timeout",
  set_log_level: "log_level",
  update_microphone_mode: "always_on_microphone",
  update_custom_words: "custom_words",
  update_word_replacements: "word_replacements",
  update_custom_profile_commands: "custom_profile_commands",
  update_history_limit: "history_limit",
  update_recording_retention_period: "recording_retention_period",
};

const noMapeados = new Set<string>();

export async function invocar(comando: string, args: Argumentos = {}): Promise<unknown> {
  const lectura = LECTURAS[comando];
  if (lectura) return lectura(args);

  const motivo = NO_DISPONIBLES[comando];
  if (motivo) {
    avisarNoDisponible(motivo);
    // Los que devuelven `Result` en Rust esperan que un fallo llegue como
    // excepción, y así la app enseña su propio camino de error en vez de
    // quedarse esperando.
    throw new Error("No disponible en la demo");
  }

  const clave = GUARDAR_AJUSTE[comando];
  if (clave) {
    // Los comandos de escritura reciben un único argumento, con nombres
    // distintos según cuál sea (`enabled`, `value`, `theme`...). Vale el
    // primero, porque solo hay uno.
    const valor = Object.values(args)[0];
    if (valor !== undefined) ajustes[clave] = valor;
    if (comando === "set_active_model") estado.modeloActual = String(valor);
    return null;
  }

  if (comando === "change_binding" || comando === "reset_binding") {
    const bindings = ajustes.bindings as Record<
      string,
      { current_binding: string; default_binding: string }
    >;
    const id = String(args.id ?? "");
    if (bindings[id]) {
      bindings[id].current_binding =
        comando === "change_binding"
          ? String(args.binding ?? "")
          : bindings[id].default_binding;
    }
    return { success: true, error: null };
  }

  if (comando === "delete_history_entry") {
    const indice = historial.findIndex((h) => h.id === Number(args.id));
    if (indice >= 0) historial.splice(indice, 1);
    return null;
  }

  if (comando === "toggle_history_entry_saved") {
    const entrada = historial.find((h) => h.id === Number(args.id));
    if (entrada) entrada.saved = !entrada.saved;
    return null;
  }

  if (comando === "reset_dictation_stats") {
    estadisticas.days.length = 0;
    estadisticas.total_words = 0;
    estadisticas.total_seconds = 0;
    estadisticas.total_sessions = 0;
    estadisticas.current_streak = 0;
    estadisticas.longest_streak = 0;
    estadisticas.best_day = null;
    return null;
  }

  // Cualquier otra cosa se da por hecha. Se anota una vez para que al revisar
  // la demo se vea qué comandos nuevos han aparecido en la app.
  if (!noMapeados.has(comando)) {
    noMapeados.add(comando);
    console.debug(`[demo] comando sin simular, se responde OK: ${comando}`);
  }
  return null;
}
