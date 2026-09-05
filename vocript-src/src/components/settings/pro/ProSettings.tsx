import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  ScanText,
  Square,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { SettingContainer } from "../../ui/SettingContainer";
import { Button } from "../../ui/Button";
import { Agente } from "./Agente";
import { CapturarAtajo } from "./CapturarAtajo";
import { Modos } from "./Modos";
import { LiberarOrdenador, Nube } from "./Nube";
import { Voz } from "./Voz";
import { useProStore } from "@/stores/proStore";
import * as pro from "@/lib/pro";

/** Con menos días que esto por delante, la fecha de caducidad se enseña en ámbar. */
const DIAS_DE_AVISO = 14;

/** Días que quedan hasta una fecha AAAA-MM-DD, contando el de hoy como cero. */
function diasHasta(fecha: string): number {
  const objetivo = new Date(`${fecha}T00:00:00`).getTime();
  return Math.ceil((objetivo - Date.now()) / 86_400_000);
}

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
  const [atajoAgente, setAtajoAgente] = useState("");
  const [puedeRepetir, setPuedeRepetir] = useState(false);
  const [pausada, setPausada] = useState(false);

  useEffect(() => {
    void cargar();
    void pro.atajo().then(setAtajo);
    void pro.atajoAgente().then(setAtajoAgente);
    void pro.puedeRepetir().then(setPuedeRepetir);
  }, [cargar]);

  const activa = licencia?.activa ?? false;
  const diasQueQuedan = licencia?.expira ? diasHasta(licencia.expira) : null;
  // La nube ha dicho que no porque la licencia ya está en todos sus ordenadores: se enseñan
  // debajo, para quitar uno sin salir de aquí.
  const topeDeOrdenadores =
    !activa &&
    licencia?.motivo !== null &&
    pro.codigoDeError(licencia?.motivo) === "limite_dispositivos" &&
    clave.trim().length > 0;

  const alActivar = async () => {
    setActivando(true);
    try {
      const resultado = await activar(clave);
      if (resultado.activa) {
        setClave("");
        toast.success(t("pro.license.activated"));
      } else {
        toast.error(
          resultado.motivo
            ? pro.mensajeDeError(resultado.motivo)
            : t("pro.license.rejected"),
        );
      }
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    } finally {
      setActivando(false);
    }
  };

  /**
   * Las tres formas de leer son la misma cosa con distinta fuente, asi que comparten el
   * estado de "leyendo", el ultimo texto y el aviso de error.
   *
   * `null` significa que no habia nada que leer sin que sea un fallo: la mirilla cerrada sin
   * elegir, o un "repetir" cuando todavia no se ha senalado nada.
   */
  const leerCon = async (fuente: () => Promise<string | null>) => {
    setLeyendo(true);
    try {
      const texto = await fuente();
      if (texto !== null) {
        setUltimoTexto(texto);
        setPausada(false);
        setPuedeRepetir(await pro.puedeRepetir());
      }
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    } finally {
      setLeyendo(false);
    }
  };

  const alPausar = async () => {
    try {
      await (pausada ? pro.seguir() : pro.pausar());
      setPausada(!pausada);
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
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
              {activando
                ? t("pro.license.activating")
                : t("pro.license.activate")}
            </Button>
          </div>
        )}
      </SettingContainer>

      {/* Hay una licencia guardada pero no vale (caducada, casi siempre): se dice por qué,
          justo encima de donde se pega la nueva. */}
      {!activa && licencia?.motivo && (
        <p className="flex items-start gap-1.5 px-1 text-xs text-red-500">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {pro.mensajeDeError(licencia.motivo)}
        </p>
      )}

      {topeDeOrdenadores && (
        <LiberarOrdenador
          clave={clave.trim()}
          alLiberado={() => void alActivar()}
        />
      )}

      {activa &&
        licencia?.expira &&
        diasQueQuedan !== null &&
        (diasQueQuedan <= DIAS_DE_AVISO ? (
          <p className="flex items-start gap-1.5 px-1 text-xs text-amber-600">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {t("pro.license.expiresSoon", {
              fecha: licencia.expira,
              dias: Math.max(0, diasQueQuedan),
            })}
          </p>
        ) : (
          <p className="px-1 text-xs text-mid-gray">
            {t("pro.license.expires", { fecha: licencia.expira })}
          </p>
        ))}

      {activa && (
        <div className="mt-1 rounded-lg border border-mid-gray/20 p-3">
          <h3 className="text-sm font-medium">{t("pro.cloud.title")}</h3>
          <p className="mb-2.5 mt-0.5 text-xs text-mid-gray">
            {t("pro.cloud.description")}
          </p>
          <Nube />
        </div>
      )}

      {activa && (
        <SettingContainer
          title={t("pro.readAloud.title")}
          description={t("pro.readAloud.description")}
          descriptionMode="inline"
          grouped
        >
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void leerCon(pro.leerEnVozAlta)}
              disabled={!activa || leyendo || !hayVoz}
              className="flex items-center gap-1.5"
            >
              <ScanText className="h-3.5 w-3.5" />
              {t("pro.readAloud.pick")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void leerCon(pro.leerPantalla)}
              disabled={!activa || leyendo || !hayVoz}
              className="flex items-center gap-1.5"
            >
              <Monitor className="h-3.5 w-3.5" />
              {t("pro.readAloud.wholeScreen")}
            </Button>
            {puedeRepetir && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void leerCon(pro.repetir)}
                disabled={!activa || leyendo || !hayVoz}
                className="flex items-center gap-1.5"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("pro.readAloud.again")}
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void alPausar()}
              disabled={!activa}
              className="flex items-center gap-1.5"
            >
              {pausada ? (
                <Play className="h-3.5 w-3.5" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
              {pausada ? t("pro.readAloud.resume") : t("pro.readAloud.pause")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void pro.callar();
                setPausada(false);
              }}
              disabled={!activa}
              className="flex items-center gap-1.5"
            >
              <Square className="h-3.5 w-3.5" />
              {t("pro.readAloud.stop")}
            </Button>
          </div>
        </SettingContainer>
      )}

      {activa && hayVoz && <Voz />}

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
          <SettingContainer
            title={t("pro.agent.hotkeyTitle")}
            description={t("pro.agent.hotkeyDescription")}
            descriptionMode="inline"
            grouped
          >
            <CapturarAtajo
              valor={atajoAgente}
              onCambio={setAtajoAgente}
              guardarEn={pro.ponerAtajoAgente}
            />
          </SettingContainer>
          <div className="mt-2.5">
            <Agente />
          </div>
        </div>
      )}

      {activa && <Modos />}

      {activa && !hayVoz && (
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
