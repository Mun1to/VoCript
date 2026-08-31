import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BadgeCheck, ScanText, Square, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { Agente } from "./Agente";
import { CapturarAtajo } from "./CapturarAtajo";
import { useProStore } from "@/stores/proStore";
import * as pro from "@/lib/pro";

/**
 * VoCript Pro: dónde se activa y dónde se prueba.
 *
 * La sección entera solo aparece si el binario trae las funciones dentro (lo decide el
 * Sidebar), así que aquí no hay ningún caso de "esta edición no lo tiene": si se está viendo
 * esto, existe.
 */
export const ProSettings: React.FC = () => {
  const { t } = useTranslation();
  const { licencia, hayVoz, cargar, activar, desactivar } = useProStore();
  const [clave, setClave] = useState("");
  const [activando, setActivando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [ultimoTexto, setUltimoTexto] = useState<string | null>(null);
  const [atajo, setAtajo] = useState("");

  useEffect(() => {
    void cargar();
    void pro.atajo().then(setAtajo);
  }, [cargar]);

  const activa = licencia?.activa ?? false;

  const alActivar = async () => {
    setActivando(true);
    try {
      const resultado = await activar(clave);
      if (resultado.activa) {
        setClave("");
        toast.success(t("pro.license.activated"));
      } else {
        toast.error(resultado.motivo ?? t("pro.license.rejected"));
      }
    } catch (e) {
      toast.error(String(e));
    } finally {
      setActivando(false);
    }
  };

  const alLeer = async () => {
    setLeyendo(true);
    try {
      const texto = await pro.leerEnVozAlta();
      // `null` es que ha cerrado la mirilla sin elegir. No ha pasado nada malo.
      if (texto !== null) setUltimoTexto(texto);
    } catch (e) {
      toast.error(String(e));
    } finally {
      setLeyendo(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <SettingContainer
        title={t("pro.license.title")}
        description={t("pro.license.description")}
        descriptionMode="inline"
        grouped
      >
        {activa ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm">
              <BadgeCheck className="h-4 w-4 text-emerald-500" />
              {licencia?.correo}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void desactivar()}
            >
              {t("pro.license.remove")}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={clave}
              onChange={(e) => setClave(e.target.value)}
              placeholder={t("pro.license.placeholder")}
              spellCheck={false}
              className="w-72 rounded-md border border-mid-gray/30 bg-background px-2.5 py-1.5 font-mono text-xs"
            />
            <Button
              variant="primary"
              size="sm"
              onClick={() => void alActivar()}
              disabled={activando || clave.trim().length === 0}
            >
              {t("pro.license.activate")}
            </Button>
          </div>
        )}
      </SettingContainer>

      {activa && licencia?.expira && (
        <p className="px-1 text-xs text-mid-gray">
          {t("pro.license.expires", { fecha: licencia.expira })}
        </p>
      )}

      <SettingContainer
        title={t("pro.readAloud.title")}
        description={t("pro.readAloud.description")}
        descriptionMode="inline"
        grouped
      >
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => void alLeer()}
            disabled={!activa || leyendo || !hayVoz}
            className="flex items-center gap-1.5"
          >
            <ScanText className="h-3.5 w-3.5" />
            {t("pro.readAloud.pick")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void pro.callar()}
            disabled={!activa}
            className="flex items-center gap-1.5"
          >
            <Square className="h-3.5 w-3.5" />
            {t("pro.readAloud.stop")}
          </Button>
        </div>
      </SettingContainer>

      {activa && (
        <SettingContainer
          title={t("pro.hotkey.title")}
          description={t("pro.hotkey.description")}
          descriptionMode="inline"
          grouped
        >
          <CapturarAtajo valor={atajo} onCambio={setAtajo} />
        </SettingContainer>
      )}

      {activa && (
        // Sin SettingContainer: ese pone el control a la derecha del título, y el agente
        // necesita el ancho entero para su caja de texto y su respuesta.
        <div className="mt-1 rounded-lg border border-mid-gray/20 p-3">
          <h3 className="text-sm font-medium">{t("pro.agent.title")}</h3>
          <p className="mb-2.5 mt-0.5 text-xs text-mid-gray">
            {t("pro.agent.description")}
          </p>
          <Agente />
        </div>
      )}

      {!hayVoz && (
        <p className="flex items-start gap-1.5 px-1 text-xs text-amber-600">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("pro.readAloud.noVoice")}
        </p>
      )}

      {ultimoTexto !== null && (
        <div className="px-1">
          <p className="mb-1 text-xs text-mid-gray">
            {t("pro.readAloud.lastRead")}
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-mid-gray/20 bg-background p-2.5 text-xs">
            {ultimoTexto}
          </pre>
        </div>
      )}
    </div>
  );
};
