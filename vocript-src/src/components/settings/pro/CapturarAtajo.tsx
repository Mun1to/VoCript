import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { useOsType } from "../../../hooks/useOsType";
import {
  formatKeyCombination,
  getKeyName,
  normalizeKey,
} from "../../../lib/utils/keyboard";
import * as pro from "@/lib/pro";

/** El orden en que se escriben los modificadores, para que dos atajos iguales se vean igual. */
const MODIFICADORES = ["ctrl", "alt", "shift", "super"];

interface Props {
  /** El atajo guardado ahora mismo, en el formato del backend (`ctrl+alt+l`). */
  valor: string;
  onCambio: (nuevo: string) => void;
  /**
   * Quién guarda la combinación en el backend. Por defecto, el atajo de leer en voz alta;
   * el del agente pasa el suyo. El resto del componente es el mismo para los dos.
   */
  guardarEn?: (combinacion: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Capturar la combinación de teclas que abre la mirilla.
 *
 * No reutiliza el `GlobalShortcutInput` de VoCript porque ese lee y escribe en la lista de
 * atajos de los ajustes, y el de VoCript Pro se guarda aparte (ver `pro/ajustes.rs`). Lo que
 * sí se reutiliza es la parte que cuesta: las utilidades que traducen un evento de teclado a
 * un nombre de tecla estable en los tres sistemas.
 */
export const CapturarAtajo: React.FC<Props> = ({
  valor,
  onCambio,
  guardarEn = pro.ponerAtajo,
  disabled = false,
}) => {
  const { t } = useTranslation();
  const osType = useOsType();
  const [grabando, setGrabando] = useState(false);
  const [pulsadas, setPulsadas] = useState<string[]>([]);

  const guardar = useCallback(
    async (combinacion: string) => {
      try {
        await guardarEn(combinacion);
        onCambio(combinacion);
        toast.success(t("pro.hotkey.saved"));
      } catch (e) {
        // El backend repone el anterior cuando el nuevo no se puede registrar, así que aquí
        // solo hay que contar por qué, sin deshacer nada.
        toast.error(String(e));
      }
    },
    [guardarEn, onCambio, t],
  );

  useEffect(() => {
    if (!grabando) return;

    const alPulsar = (e: KeyboardEvent) => {
      e.preventDefault();
      // Y que no lo vea nadie más. Sin esto, grabar Ctrl+Alt+K abría de paso el buscador de
      // secciones, que escucha Ctrl+K en la misma ventana: mientras se captura un atajo, la
      // aplicación entera tiene que estar sorda.
      e.stopPropagation();
      e.stopImmediatePropagation();
      const tecla = normalizeKey(getKeyName(e, osType));

      // Escape sale sin cambiar nada: es lo que espera cualquiera que se haya arrepentido.
      if (tecla === "escape") {
        setGrabando(false);
        setPulsadas([]);
        return;
      }

      const modificadores = MODIFICADORES.filter(
        (m) =>
          (m === "ctrl" && e.ctrlKey) ||
          (m === "alt" && e.altKey) ||
          (m === "shift" && e.shiftKey) ||
          (m === "super" && e.metaKey),
      );

      // Mientras solo haya modificadores, se enseña lo que lleva pulsado y se sigue esperando
      // la tecla de verdad: un atajo de solo modificadores no lo acepta el sistema.
      if (MODIFICADORES.includes(tecla)) {
        setPulsadas(modificadores);
        return;
      }
      if (modificadores.length === 0) {
        toast.error(t("pro.hotkey.needsModifier"));
        return;
      }

      const combinacion = [...modificadores, tecla].join("+");
      setPulsadas([...modificadores, tecla]);
      setGrabando(false);
      void guardar(combinacion);
    };

    const alSoltar = () => setPulsadas([]);

    window.addEventListener("keydown", alPulsar, true);
    window.addEventListener("keyup", alSoltar, true);
    return () => {
      window.removeEventListener("keydown", alPulsar, true);
      window.removeEventListener("keyup", alSoltar, true);
    };
  }, [grabando, osType, guardar, t]);

  const enPantalla = grabando
    ? pulsadas.length
      ? formatKeyCombination(pulsadas.join("+"), osType)
      : t("pro.hotkey.recording")
    : formatKeyCombination(valor, osType) || t("pro.hotkey.none");

  return (
    <div className="flex items-center gap-2">
      <span
        className={`min-w-40 rounded-md border px-2.5 py-1.5 text-center text-xs ${
          grabando
            ? "border-logo-primary text-logo-primary"
            : "border-mid-gray/30"
        }`}
      >
        {enPantalla}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => {
          setPulsadas([]);
          setGrabando((g) => !g);
        }}
      >
        {grabando ? t("pro.hotkey.cancel") : t("pro.hotkey.change")}
      </Button>
    </div>
  );
};
