// Arranque de la demo. Monta la MISMA `App` que la aplicación de escritorio;
// lo único distinto es que antes conecta los avisos de "esto solo va instalado"
// con los mensajes emergentes que la app ya usa.
import React from "react";
import ReactDOM from "react-dom/client";
import { toast } from "sonner";

import "./demo.css";

import App from "../../src/App";
import { registrarEmisorDeAvisos } from "./simulador/aviso";
import { dictar } from "./simulador/dictado";
import { conectarPuente } from "./puente";

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

// El dictado simulado se dispara con el atajo de verdad, el mismo que la
// pantalla "Hoy" le está pidiendo al visitante que pulse. Así no hay que
// inventarse un botón que la app no tiene.
window.addEventListener("keydown", (evento) => {
  if (!evento.ctrlKey || evento.code !== "Space" || evento.repeat) return;
  evento.preventDefault();
  void dictar();
});

conectarPuente();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
