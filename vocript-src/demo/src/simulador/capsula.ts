// La cápsula del overlay, para enseñarla en la web.
//
// No dibuja nada nuevo: emite los mismos eventos que en el escritorio emite
// Rust (`show-overlay`, `mic-level`, `live-text`, `hide-overlay`), y el
// componente de verdad reacciona solo. Lo que se ve es la cápsula real, con su
// animación y sus tamaños.
//
// Aquí no se transcribe nada: el texto del modo en vivo es un guion fijo, y no
// se toca el micrófono en ningún momento.

import { emitirLocal } from "../shims/event";

const FRASE_EN_VIVO =
  "This is the live capsule. The text grows while you talk, and when you stop you decide what to do with it.";

const esperar = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

/** Barras con forma de voz: sílabas que suben y bajan, no un ruido plano. */
function nivelesEnElInstante(t: number): number[] {
  const silaba = Math.abs(Math.sin(t * 7.5));
  const respiracion = 0.55 + 0.45 * Math.sin(t * 1.3);
  const sobre = silaba * respiracion;
  return Array.from({ length: 64 }, (_, i) =>
    Math.max(
      0,
      Math.min(1, sobre * (1 - i / 90) * (0.75 + 0.25 * Math.sin(t * 20 + i * 0.7))),
    ),
  );
}

// Cada pasada lleva su número: si alguien pulsa el otro modo a media
// demostración, la anterior se para en cuanto lo comprueba.
let pasada = 0;

export async function enseñarCapsula(modo: "normal" | "live"): Promise<void> {
  const mia = ++pasada;
  const sigueSiendoMia = () => mia === pasada;

  emitirLocal("show-overlay", modo === "live" ? "live" : "recording");

  const inicio = performance.now();

  if (modo === "live") {
    const palabras = FRASE_EN_VIVO.split(" ");
    let escrito = "";
    for (const palabra of palabras) {
      if (!sigueSiendoMia()) return;
      escrito = escrito ? `${escrito} ${palabra}` : palabra;
      emitirLocal("live-text", escrito);
      emitirLocal("mic-level", nivelesEnElInstante((performance.now() - inicio) / 1000));
      await esperar(120);
    }
    await esperar(2500);
  } else {
    // El ciclo corto de un dictado: escuchando, transcribiendo, pegado.
    while (performance.now() - inicio < 3600) {
      if (!sigueSiendoMia()) return;
      emitirLocal("mic-level", nivelesEnElInstante((performance.now() - inicio) / 1000));
      await esperar(50);
    }
    if (!sigueSiendoMia()) return;
    emitirLocal("show-overlay", "transcribing");
    await esperar(900);
    if (!sigueSiendoMia()) return;
    emitirLocal("show-overlay", "copied");
    await esperar(1600);
  }

  if (!sigueSiendoMia()) return;
  emitirLocal("hide-overlay", null);
}
