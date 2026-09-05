import React, { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import { Copy, Mic, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import * as pro from "@/lib/pro";

/**
 * El agente: le dices un encargo y lo resuelve mirando lo que tienes en pantalla.
 *
 * Aquí se escribe a teclado porque es donde se prueba. El sitio de verdad es el dictado: se
 * habla el encargo y el texto sale escrito donde estuvieras. Eso viene después; esto es lo
 * que permite ver si el resultado vale antes de engancharlo a nada.
 */
export const Agente: React.FC<{ disabled?: boolean }> = ({
  disabled = false,
}) => {
  const { t } = useTranslation();
  const [encargo, setEncargo] = useState("");
  const [pensando, setPensando] = useState(false);
  const [respuesta, setRespuesta] = useState<string | null>(null);

  // Lo que contesta el agente a un encargo dictado con el botón llega por evento: el
  // dictado lo lleva el backend de principio a fin y aquí solo hay que enseñarlo.
  useEffect(() => {
    const suelto = listen<string>(pro.EVENTO_AGENTE_RESPUESTA, (evento) => {
      setRespuesta(evento.payload);
    });
    return () => {
      void suelto.then((quitar) => quitar());
    };
  }, []);

  const preguntar = async () => {
    setPensando(true);
    setRespuesta(null);
    try {
      setRespuesta(await pro.agenteHaz(encargo));
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    } finally {
      setPensando(false);
    }
  };

  const copiar = async () => {
    if (!respuesta) return;
    await navigator.clipboard.writeText(respuesta);
    toast.success(t("pro.agent.copied"));
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={encargo}
        onChange={(e) => setEncargo(e.target.value)}
        placeholder={t("pro.agent.placeholder")}
        rows={2}
        disabled={disabled}
        // Sin tirador: lo estiraría el usuario y rompería la maquetación de al lado.
        className="w-full resize-none rounded-md border border-mid-gray/30 bg-background px-2.5 py-2 text-sm"
        onKeyDown={(e) => {
          // Ctrl+Enter lanza, como en cualquier caja de mandar algo. Enter a secas hace salto
          // de línea, que en un encargo de dos frases hace falta.
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (encargo.trim()) void preguntar();
          }
        }}
      />
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          size="sm"
          onClick={() => void preguntar()}
          disabled={disabled || pensando || encargo.trim().length === 0}
          className="flex items-center gap-1.5"
        >
          <Sparkles className="h-3.5 w-3.5" />
          {pensando ? t("pro.agent.thinking") : t("pro.agent.ask")}
        </Button>
        <span className="text-xs text-mid-gray">{t("pro.agent.hint")}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            void pro.agenteDictar().catch((e) => toast.error(pro.mensajeDeError(e)))
          }
          disabled={disabled}
          className="ml-auto flex items-center gap-1.5"
          title={t("pro.agent.dictateHint")}
        >
          <Mic className="h-3.5 w-3.5" />
          {t("pro.agent.dictate")}
        </Button>
      </div>

      {respuesta !== null && (
        <div className="mt-1">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs text-mid-gray">{t("pro.agent.answer")}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void copiar()}
              className="flex items-center gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" />
              {t("pro.agent.copy")}
            </Button>
          </div>
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-md border border-mid-gray/20 bg-background p-2.5 text-xs">
            {respuesta}
          </pre>
        </div>
      )}
    </div>
  );
};
