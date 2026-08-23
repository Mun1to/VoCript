// El "disco duro" de la demo: todo lo que en la app guarda Rust vive aquí, en
// memoria del navegador. Se pierde al recargar, y eso está bien: cada visitante
// empieza con la misma casa amueblada.

import catalogo from "./modelos.generado.json";

export interface ModeloDemo {
  id: string;
  name: string;
  description: string;
  filename: string;
  url: string | null;
  sha256: string | null;
  size_mb: number;
  is_downloaded: boolean;
  is_downloading: boolean;
  partial_size: number;
  is_directory: boolean;
  engine_type: string;
  accuracy_score: number;
  speed_score: number;
  supports_translation: boolean;
  is_recommended: boolean;
  supported_languages: string[];
  supports_language_selection: boolean;
  is_custom: boolean;
}

// Los que la demo presenta como ya instalados. Se eligen dos para que la
// pantalla de Modelos enseñe a la vez el estado "instalado" y el "por
// descargar", que es lo que hay que entender de ella.
const YA_DESCARGADOS = new Set(["parakeet-tdt-0.6b-v3", "moonshine-base"]);
const MODELO_ACTIVO = "parakeet-tdt-0.6b-v3";

export const modelos: ModeloDemo[] = (catalogo as ModeloDemo[]).map((m) => ({
  ...m,
  is_downloaded: YA_DESCARGADOS.has(m.id),
}));

export const estado = {
  modeloActual: MODELO_ACTIVO as string | null,
  modeloCargado: true,
  grabando: false,
  ultimaTranscripcionMs: 412 as number | null,
};

// Los ajustes. Salen del `get_default_settings()` de Rust, con los cuatro
// atajos reales y unos cuantos valores puestos a mano para que la demo se vea
// usada en vez de recién instalada.
export const ajustes: Record<string, unknown> = {
  bindings: {
    transcribe: {
      id: "transcribe",
      name: "Transcribe",
      description: "Converts your speech into text.",
      default_binding: "ctrl+space",
      current_binding: "ctrl+space",
    },
    transcribe_with_post_process: {
      id: "transcribe_with_post_process",
      name: "Transcribe with Post-Processing",
      description: "Converts your speech into text and applies AI post-processing.",
      default_binding: "ctrl+shift+space",
      current_binding: "ctrl+shift+space",
    },
    cancel: {
      id: "cancel",
      name: "Cancel",
      description: "Cancels the current recording.",
      default_binding: "escape",
      current_binding: "escape",
    },
    transcribe_system: {
      id: "transcribe_system",
      name: "Transcribe System Audio",
      description:
        "Transcribes the audio playing on your computer (e.g. a video) instead of the microphone.",
      default_binding: "ctrl+alt+space",
      current_binding: "ctrl+alt+space",
    },
  },
  push_to_talk: true,
  audio_feedback: true,
  audio_feedback_volume: 0.5,
  sound_theme: "marimba",
  start_hidden: false,
  autostart_enabled: false,
  update_checks_enabled: true,
  track_dictation_stats: true,
  wake_word_enabled: false,
  wake_word_samples: [],
  mute_in_calls: false,
  ui_font: "system",
  ui_font_size: 16,
  selected_model: MODELO_ACTIVO,
  always_on_microphone: false,
  selected_microphone: null,
  clamshell_microphone: null,
  selected_output_device: null,
  system_audio_app: null,
  translate_to_english: false,
  selected_language: "auto",
  overlay_position: "bottom",
  overlay_custom_position: null,
  debug_mode: false,
  log_level: "info",
  custom_words: ["VoCript", "Tauri", "Whisper"],
  word_replacements: [
    { from: "vocrip", to: "VoCript" },
    { from: "punto y coma", to: ";" },
  ],
  custom_profile_commands: [],
  model_unload_timeout: "min_5",
  word_correction_threshold: 0.8,
  history_limit: 100,
  recording_retention_period: "keep_none",
  paste_method: "ctrl_v",
  clipboard_handling: "restore",
  clipboard_only: false,
  live_auto_paste: true,
  auto_submit: false,
  auto_submit_key: "enter",
  post_process_enabled: false,
  post_process_provider_id: "openai",
  post_process_providers: [],
  post_process_api_keys: {},
  post_process_models: {},
  post_process_prompts: [],
  post_process_selected_prompt_id: null,
  mute_while_recording: false,
  append_trailing_space: true,
  app_language: "en",
  theme: "dark",
  accent_color: "#3b82f6",
  show_overlay: true,
  show_tray_icon: true,
  work_profile: "normal",
  microphone_mode: "normal",
  live_mode: false,
  paste_delay_ms: 100,
  extra_recording_buffer_ms: 0,
};

// Copia intacta para que "restablecer" funcione igual que en la app.
export const ajustesPorDefecto: Record<string, unknown> = JSON.parse(
  JSON.stringify(ajustes),
);

export const microfonos = [
  { index: "0", name: "Microphone (Realtek Audio)", is_default: true },
  { index: "1", name: "Headset (Bluetooth)", is_default: false },
  { index: "2", name: "Webcam C920", is_default: false },
];

export const salidasDeAudio = [
  { index: "0", name: "Speakers (Realtek Audio)", is_default: true },
  { index: "1", name: "Headset (Bluetooth)", is_default: false },
];

// El historial guarda la fecha en segundos desde 1970, no en milisegundos:
// pasarle los de JavaScript tal cual pinta "hace 1.785.660.832.205 segundos".
const ahoraEnSegundos = Math.floor(Date.now() / 1000);

// Historial de ejemplo. Nada de esto son dictados reales de nadie: son frases
// escritas para la demo, con la mezcla de idiomas y longitudes que se ve al
// usar la app de verdad.
export const historial = [
  {
    id: 4,
    file_name: "demo-4.wav",
    timestamp: ahoraEnSegundos - 60 * 12,
    saved: false,
    title: "Reply to the design review",
    transcription_text:
      "Thanks for the review. I have moved the settings index to the right side so it does not fight with the sidebar, and the filter box now sits above the first block.",
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  },
  {
    id: 3,
    file_name: "demo-3.wav",
    timestamp: ahoraEnSegundos - 60 * 74,
    saved: true,
    title: "Commit message",
    transcription_text:
      "fix: the tray menu was never given permission to hear anything",
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  },
  {
    id: 2,
    file_name: "demo-2.wav",
    timestamp: ahoraEnSegundos - 60 * 60 * 5,
    saved: false,
    title: "Notes from the call",
    transcription_text:
      "We agreed on three things: ship the Linux package first, keep the model catalogue as it is for now, and revisit the wake word once the streaming models land.",
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  },
  {
    id: 1,
    file_name: "demo-1.wav",
    timestamp: ahoraEnSegundos - 60 * 60 * 27,
    saved: false,
    title: "Shopping list",
    transcription_text: "Coffee, olive oil, two lemons and a bag of rice.",
    post_processed_text: null,
    post_process_prompt: null,
    post_process_requested: false,
  },
];

/** Días seguidos hasta hoy que la demo enseña como racha actual. */
const DIAS_DE_RACHA = 8;

/**
 * Un año de actividad para el mapa de calor de la pantalla "Actividad".
 *
 * Se genera con una fórmula fija (no al azar) para que la demo se vea igual en
 * cada visita y en cada captura. La forma imita el uso real: laborables llenos,
 * fines de semana flojos, algún hueco, y los últimos días siempre con algo, que
 * es lo que sostiene la racha que enseña la pantalla.
 */
function generarDias() {
  const dias: { day: string; words: number; seconds: number; sessions: number }[] = [];
  const hoy = new Date();

  for (let atras = 364; atras >= 0; atras--) {
    const fecha = new Date(hoy);
    fecha.setDate(hoy.getDate() - atras);
    const diaSemana = fecha.getDay();
    const finDeSemana = diaSemana === 0 || diaSemana === 6;

    // Onda lenta: meses de más y de menos trabajo.
    const onda = Math.sin(atras / 23) * 0.5 + 0.5;
    const pulso = (atras * 37) % 11;

    // Los últimos días no se saltan nunca: son la racha viva.
    const esRachaViva = atras < DIAS_DE_RACHA;
    if (!esRachaViva) {
      if (finDeSemana && pulso < 8) continue;
      if (pulso < 4) continue;
    }

    const palabras = Math.round(30 + onda * 95 + pulso * 7);
    dias.push({
      day: fecha.toISOString().slice(0, 10),
      words: palabras,
      // A 121 palabras por minuto, que es lo que sale dictando de corrido.
      seconds: Math.round((palabras / 121) * 60),
      sessions: 1 + (pulso % 4),
    });
  }
  return dias;
}

/** La racha más larga del año, contando días de calendario consecutivos. */
function calcularRachaMasLarga(
  dias: { day: string }[],
): number {
  let mejor = 0;
  let actual = 0;
  let anterior: number | null = null;
  for (const d of dias) {
    const hoyMs = Date.parse(`${d.day}T00:00:00Z`);
    const seguido = anterior !== null && hoyMs - anterior === 86400000;
    actual = seguido ? actual + 1 : 1;
    if (actual > mejor) mejor = actual;
    anterior = hoyMs;
  }
  return mejor;
}

const dias = generarDias();
const totalPalabras = dias.reduce((suma, d) => suma + d.words, 0);
const mejorDia = dias.reduce((mejor, d) => (d.words > mejor.words ? d : mejor), dias[0]);

export const estadisticas: {
  days: typeof dias;
  total_words: number;
  total_seconds: number;
  total_sessions: number;
  current_streak: number;
  longest_streak: number;
  best_day: (typeof dias)[number] | null;
} = {
  days: dias,
  total_words: totalPalabras,
  total_seconds: dias.reduce((suma, d) => suma + d.seconds, 0),
  total_sessions: dias.reduce((suma, d) => suma + d.sessions, 0),
  current_streak: DIAS_DE_RACHA,
  // Se cuenta, no se inventa: si la fórmula cambia, el número la sigue.
  longest_streak: calcularRachaMasLarga(dias),
  best_day: mejorDia,
};

// Tipografías: solo las que cualquier Windows tiene, que es de donde salen las
// de la app (no se descarga ninguna).
export const fuentesDelSistema = [
  "Arial",
  "Cambria",
  "Calibri",
  "Consolas",
  "Courier New",
  "Georgia",
  "Segoe UI",
  "Tahoma",
  "Times New Roman",
  "Trebuchet MS",
  "Verdana",
];

export const appsConAudio = [
  { name: "Spotify", executable: "Spotify.exe" },
  { name: "Google Chrome", executable: "chrome.exe" },
  { name: "Zoom", executable: "Zoom.exe" },
];
