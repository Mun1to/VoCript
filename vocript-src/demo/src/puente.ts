// Puente entre la demo y la web que la enseña dentro de un marco.
//
// Sirve para dos cosas: que la página de fuera pueda pedir un dictado (su botón
// "Pruébalo"), y que vea salir el texto palabra a palabra para pintarlo en su
// documento de ejemplo, que es lo que explica de un vistazo para qué sirve
// VoCript: hablas y el texto aparece en la ventana que tenías delante.
//
// Los mensajes que llegan de fuera son DATOS, no órdenes: solo se acepta la
// petición de dictar, y solo si viene de la página que nos ha abierto. Nada de
// ejecutar lo que mande quien sea.

import { alDictar, dictar } from "./simulador/dictado";

const PEDIR_DICTADO = "vocript-demo:dictar";
const TEXTO = "vocript-demo:texto";
const LISTA = "vocript-demo:lista";

/** El origen de la página que nos ha metido en su marco, o null si no hay. */
function origenDelPadre(): string | null {
  if (window.parent === window) return null;
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

export function conectarPuente(): void {
  const padre = origenDelPadre();
  if (!padre) return;

  const enviar = (mensaje: Record<string, unknown>) => {
    window.parent.postMessage(mensaje, padre);
  };

  window.addEventListener("message", (evento) => {
    // Solo de quien nos abrió, y solo la única petición que aceptamos.
    if (evento.origin !== padre) return;
    const dato = evento.data as { tipo?: unknown } | null;
    if (!dato || dato.tipo !== PEDIR_DICTADO) return;
    void dictar();
  });

  alDictar((texto, terminado) => enviar({ tipo: TEXTO, texto, terminado }));

  // Avisa de que ya se puede pulsar: hasta aquí la app estaba montándose.
  enviar({ tipo: LISTA });
}
