// Avisos de "esto no se puede hacer en la demo".
//
// La regla: una demo que se traga una pulsación sin decir nada es peor que una
// captura, porque el visitante cree que la app está rota. Cada cosa que aquí no
// funciona lo dice, y dice por qué.

type Motivo = "microfono" | "archivos" | "descarga" | "sistema";

const MENSAJES: Record<Motivo, string> = {
  microfono:
    "En la demo no se dicta de verdad: prueba el botón Dictar para ver la simulación, o descarga VoCript para usar tu micrófono.",
  archivos:
    "Abrir archivos de tu ordenador solo funciona en la app instalada. Aquí puedes ver cómo es la pantalla.",
  descarga:
    "Los modelos no se descargan en la demo. En la app se bajan una vez y se quedan en tu ordenador.",
  sistema:
    "Esto toca algo de tu sistema operativo, así que solo funciona en la app instalada.",
};

type Emisor = (mensaje: string) => void;

let emisor: Emisor | null = null;

/** La interfaz de la demo registra aquí cómo quiere enseñar los avisos. */
export function registrarEmisorDeAvisos(fn: Emisor): void {
  emisor = fn;
}

const ultimoAviso = new Map<Motivo, number>();

export function avisarNoDisponible(motivo: Motivo): void {
  // Un mismo gesto puede disparar varios comandos: sin este freno saldrían
  // tres avisos idénticos de golpe.
  const ahora = Date.now();
  if (ahora - (ultimoAviso.get(motivo) ?? 0) < 3000) return;
  ultimoAviso.set(motivo, ahora);

  const mensaje = MENSAJES[motivo];
  if (emisor) emisor(mensaje);
  else console.info(`[demo] ${mensaje}`);
}
