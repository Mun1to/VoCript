import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { emit, listen } from "@tauri-apps/api/event";
import "./mirilla.css";

/** El evento por el que el backend espera. Tiene que decir lo mismo que `mirilla.rs`. */
const RESPUESTA = "pro://region-elegida";

/** El backend avisa por aquí de que la mirilla se abre otra vez. */
const REINICIAR = "pro://mirilla-abrir";

type Punto = { x: number; y: number };

/**
 * Arrastrar un recuadro sobre la pantalla.
 *
 * La ventana ya viene colocada encima del monitor entero desde Rust, así que aquí las
 * coordenadas son las del ratón dentro de la ventana y no hay que saber nada de monitores.
 * Convertirlas a píxeles de escritorio es cosa del backend, que sí sabe la escala real.
 */
export function Mirilla() {
  const { t } = useTranslation();
  const [inicio, setInicio] = useState<Punto | null>(null);
  const [ahora, setAhora] = useState<Punto | null>(null);
  /** Para no contestar dos veces si se suelta el ratón y se pulsa Escape casi a la vez. */
  const contestado = useRef(false);

  const contestar = useCallback((recuadro: unknown) => {
    if (contestado.current) return;
    contestado.current = true;
    void emit(RESPUESTA, recuadro);
  }, []);

  // La ventana no se cierra al terminar, se esconde y se vuelve a usar, así que hay que
  // olvidar el recuadro anterior a mano. Sin esto, la segunda vez se abre con el rectángulo
  // de la primera ya pintado.
  useEffect(() => {
    const promesa = listen(REINICIAR, () => {
      contestado.current = false;
      setInicio(null);
      setAhora(null);
    });
    return () => {
      void promesa.then((quitar) => quitar());
    };
  }, []);

  useEffect(() => {
    const alTeclado = (e: KeyboardEvent) => {
      if (e.key === "Escape") contestar(null);
    };
    // En la ventana, no en el div: si el foco se va a cualquier otro sitio, Escape tiene que
    // seguir cerrando esto, porque si no la pantalla se queda tapada.
    window.addEventListener("keydown", alTeclado);
    return () => window.removeEventListener("keydown", alTeclado);
  }, [contestar]);

  const rect =
    inicio && ahora
      ? {
          x: Math.min(inicio.x, ahora.x),
          y: Math.min(inicio.y, ahora.y),
          ancho: Math.abs(ahora.x - inicio.x),
          alto: Math.abs(ahora.y - inicio.y),
        }
      : null;

  return (
    <div
      className={rect ? "velo senalando" : "velo"}
      onMouseDown={(e) => {
        setInicio({ x: e.clientX, y: e.clientY });
        setAhora({ x: e.clientX, y: e.clientY });
      }}
      onMouseMove={(e) => {
        if (inicio) setAhora({ x: e.clientX, y: e.clientY });
      }}
      onMouseUp={() => contestar(rect)}
    >
      {rect && (
        <>
          <div
            className="recuadro"
            style={{
              left: rect.x,
              top: rect.y,
              width: rect.ancho,
              height: rect.alto,
            }}
          />
          <div
            className="medida"
            style={{
              left: rect.x,
              // Encima del recuadro, salvo cuando no cabe y entonces por dentro.
              top: rect.y > 26 ? rect.y - 22 : rect.y + 6,
            }}
          >
            {`${Math.round(rect.ancho)} x ${Math.round(rect.alto)}`}
          </div>
        </>
      )}
      {!inicio && (
        <div className="pista">
          {t("pro.crosshair.hint")} <kbd>{t("pro.crosshair.escape")}</kbd>
        </div>
      )}
    </div>
  );
}
