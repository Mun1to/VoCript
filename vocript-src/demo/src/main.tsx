// Arranque de la demo. Monta la MISMA `App` que la aplicación de escritorio, y
// encima la cápsula del overlay, que allí vive en su propia ventana y aquí
// flota sobre la ventana como flota sobre la pantalla.
//
// La cápsula se monta AQUÍ, dentro de la misma página que la app, y no en un
// marco aparte: probado el 2026-08-23, en su propia página el componente
// recibía el evento `show-overlay` (el bus tenía su suscriptor y lo entregaba)
// pero no llegaba a pintarse. En la misma página funciona a la primera, y de
// paso hay un marco menos que cargar.
import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";

import "./demo.css";

import App from "../../src/App";
import RecordingOverlay from "../../src/overlay/RecordingOverlay";
import { registrarEmisorDeAvisos } from "./simulador/aviso";
import { enseñarCapsula } from "./simulador/capsula";

import "../../src/i18n";

import { useModelStore } from "../../src/stores/modelStore";

document.documentElement.dataset.platform = "windows";

// Quien entra en la demo quiere ver la app, no las tres preguntas del primer
// arranque. La app decide eso mirando esta clave (App.tsx,
// `checkOnboardingStatus`), así que se marca antes de montar nada.
try {
  localStorage.setItem("vocript_onboarded", "1");
} catch {
  // Un navegador con el almacenamiento bloqueado enseñaría el primer arranque.
  // Es peor demo, pero no es un fallo: se sigue adelante.
}

registrarEmisorDeAvisos((mensaje) => {
  toast.info(mensaje, { duration: 6000 });
});

useModelStore.getState().initialize();

/** La ventana y, flotando encima, la cápsula del overlay. */
function Demo() {
  return (
    <>
      <App />
      <div className="vc-demo-capsula">
        <RecordingOverlay />
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Demo />
  </React.StrictMode>,
);

// --- Puente con la web que enseña la demo dentro de un marco ---
//
// Lo que llega de fuera son DATOS, no órdenes: solo se acepta pedir uno de los
// dos modos de la cápsula, y solo de la página que nos ha abierto.
const origenDelPadre = (() => {
  if (window.parent === window) return null;
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
})();

if (origenDelPadre) {
  window.addEventListener("message", (evento) => {
    if (evento.origin !== origenDelPadre) return;
    const dato = evento.data as { tipo?: unknown; modo?: unknown } | null;
    if (!dato || dato.tipo !== "vocript-demo:capsula") return;
    if (dato.modo === "normal" || dato.modo === "live") void enseñarCapsula(dato.modo);
  });

  // La ventana ya está montada: la página de fuera puede quitar su velo de
  // carga y encender los botones.
  window.parent.postMessage({ tipo: "vocript-demo:lista" }, origenDelPadre);
}

// --- La rueda del ratón no se queda presa en la demo ---
//
// Un marco empotrado se traga el scroll: al pasar por encima, la página deja de
// bajar y el visitante se queda atrapado en la sección. Aquí la rueda mueve la
// página de fuera, y solo se queda dentro si alguien hace clic en la ventana,
// que es cuando de verdad la está usando (el mismo trato que dan los mapas
// empotrados).
if (origenDelPadre) {
  let enUso = false;

  const activar = () => {
    enUso = true;
  };
  window.addEventListener("pointerdown", activar);
  // Al sacar el ratón de la ventana se suelta, para no dejarla presa sin querer.
  window.addEventListener("mouseleave", () => {
    enUso = false;
  });

  window.addEventListener(
    "wheel",
    (evento) => {
      if (enUso) return;
      evento.preventDefault();
      window.parent.postMessage(
        { tipo: "vocript-demo:rueda", deltaY: evento.deltaY, deltaX: evento.deltaX },
        origenDelPadre,
      );
    },
    // No pasivo: hace falta poder cancelar el scroll de dentro.
    { passive: false },
  );
}
