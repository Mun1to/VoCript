// El dictado simulado.
//
// No añade ni un botón a la app: emite los MISMOS eventos que emitiría Rust
// (`dictation-state` y `mic-level`, ver `useDictationState.ts`), así que la
// ventana reacciona sola, con su medidor, su estado y su historial. Lo que ve
// el visitante es el comportamiento real, no una animación aparte.
//
// Se dispara con el atajo de verdad, Ctrl+Space, que es justo lo que la propia
// pantalla "Hoy" le está pidiendo que pulse.

import { emitirLocal } from "../shims/event";
import { estado, historial } from "./estado";

/** Lo que "dice" el visitante. Sale ya con puntuación, como el modelo real. */
const FRASE =
  "This is VoCript running in your browser. The real app types this straight into whatever window you had open, and nothing ever leaves your computer.";

const PALABRAS = FRASE.split(" ");

/** Cuánto dura el dictado simulado, de principio a fin. */
const MS_GRABANDO = 4200;
const MS_TRANSCRIBIENDO = 700;
const MS_POR_PALABRA = 55;

type Escucha = (texto: string, terminado: boolean) => void;

let enMarcha = false;
const escuchas = new Set<Escucha>();

/** Quien quiera ver el texto salir palabra a palabra (la web de alrededor). */
export function alDictar(fn: Escucha): () => void {
  escuchas.add(fn);
  return () => escuchas.delete(fn);
}

const avisar = (texto: string, terminado: boolean) => {
  for (const fn of escuchas) fn(texto, terminado);
};

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/**
 * Barras del medidor con forma de voz: sílabas que suben y bajan, y silencios
 * cortos entre palabras. Un ruido plano se nota falso enseguida.
 */
function nivelesEnElInstante(t: number): number[] {
  const silaba = Math.abs(Math.sin(t * 7.5));
  const respiracion = 0.55 + 0.45 * Math.sin(t * 1.3);
  const sobre = silaba * respiracion;
  return Array.from({ length: 64 }, (_, i) => {
    // Las frecuencias graves llevan más energía que las agudas, como una voz.
    const caidaPorFrecuencia = 1 - i / 90;
    const detalle = 0.75 + 0.25 * Math.sin(t * 20 + i * 0.7);
    return Math.max(0, Math.min(1, sobre * caidaPorFrecuencia * detalle));
  });
}

/** ¿Hay un dictado simulado en curso? */
export const dictando = () => enMarcha;

/**
 * Hace el dictado entero: graba, transcribe y suelta el texto. Si ya hay uno en
 * marcha no empieza otro, igual que la app no graba dos veces a la vez.
 */
export async function dictar(): Promise<void> {
  if (enMarcha) return;
  enMarcha = true;
  estado.grabando = true;

  try {
    emitirLocal("dictation-state", "recording");

    const inicio = performance.now();
    while (performance.now() - inicio < MS_GRABANDO) {
      const t = (performance.now() - inicio) / 1000;
      emitirLocal("mic-level", nivelesEnElInstante(t));
      await esperar(50);
    }

    estado.grabando = false;
    emitirLocal("dictation-state", "transcribing");
    await esperar(MS_TRANSCRIBIENDO);

    // El texto sale palabra a palabra, como cuando la app va escribiendo en la
    // ventana que tenías delante.
    let escrito = "";
    for (const palabra of PALABRAS) {
      escrito = escrito ? `${escrito} ${palabra}` : palabra;
      avisar(escrito, false);
      await esperar(MS_POR_PALABRA);
    }
    avisar(escrito, true);

    emitirLocal("dictation-state", "copied");

    // Y queda en el historial, con su fecha, como cualquier dictado.
    const entrada = {
      id: Math.max(0, ...historial.map((h) => h.id)) + 1,
      file_name: `demo-${Date.now()}.wav`,
      timestamp: Math.floor(Date.now() / 1000),
      saved: false,
      title: "Dictated in the demo",
      transcription_text: FRASE,
      post_processed_text: null,
      post_process_prompt: null,
      post_process_requested: false,
    };
    historial.unshift(entrada);
    estado.ultimaTranscripcionMs = MS_TRANSCRIBIENDO;
    emitirLocal("history-update-payload", { action: "added", entry: entrada });

    await esperar(1200);
    emitirLocal("dictation-state", "idle");
  } finally {
    enMarcha = false;
    estado.grabando = false;
  }
}
