import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudOff, Laptop, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { ToggleSwitch } from "../../ui/ToggleSwitch";
import * as pro from "@/lib/pro";

/**
 * Los ordenadores que usan una licencia, con el botón de quitar cada uno menos este.
 *
 * Es un componente aparte porque se enseña en dos sitios: en el bloque de la nube cuando
 * la licencia ya está activa, y debajo del campo de la licencia cuando la nube la rechaza
 * por el tope, que es justo el momento en que hace falta poder quitar uno.
 */
export const ListaDispositivos: React.FC<{
  estado: pro.EstadoNube;
  alQuitar: (id: string) => void;
}> = ({ estado, alQuitar }) => {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col gap-1">
      {estado.dispositivos.map((d) => {
        const esEste = d.id === estado.este_dispositivo;
        return (
          <li
            key={d.id}
            className="flex items-center gap-2 rounded-md border border-mid-gray/20 px-2.5 py-1.5 text-xs"
          >
            <Laptop className="h-3.5 w-3.5 shrink-0 text-mid-gray" />
            <span className="truncate">{d.nombre}</span>
            <span className="text-mid-gray">{d.alta}</span>
            {esEste ? (
              <span className="ml-auto text-mid-gray">
                {t("pro.cloud.thisDevice")}
              </span>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => alQuitar(d.id)}
                className="ml-auto"
              >
                {t("pro.cloud.removeDevice")}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

/**
 * La activación se ha rechazado porque la licencia ya está en todos los ordenadores que
 * permite. Aquí se enseñan, con la clave que se acaba de pegar (todavía no guardada), y
 * al quitar uno se vuelve a intentar la activación sola: la persona pulsa un solo botón.
 */
export const LiberarOrdenador: React.FC<{
  clave: string;
  alLiberado: () => void;
}> = ({ clave, alLiberado }) => {
  const { t } = useTranslation();
  const [estado, setEstado] = useState<pro.EstadoNube | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    pro
      .estadoNube(clave)
      .then((e) => {
        if (vivo) setEstado(e);
      })
      .catch((e) => {
        if (vivo) setFallo(pro.mensajeDeError(e));
      });
    return () => {
      vivo = false;
    };
  }, [clave]);

  const alQuitar = async (id: string) => {
    try {
      await pro.quitarDispositivo(id, clave);
      alLiberado();
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    }
  };

  if (fallo !== null) {
    return <p className="px-1 text-xs text-red-500">{fallo}</p>;
  }
  if (!estado) return null;
  return (
    <div className="mt-1 rounded-lg border border-amber-500/40 p-3">
      <p className="mb-2 text-xs">
        {t("pro.cloud.limitTitle", { tope: estado.tope_dispositivos })}
      </p>
      <ListaDispositivos estado={estado} alQuitar={(id) => void alQuitar(id)} />
    </div>
  );
};

/**
 * La nube de VoCript Pro: el interruptor de limpiar el habla, el uso del mes y los
 * ordenadores que usan esta licencia.
 *
 * Todo lo que se enseña aquí viene del servidor, así que sin conexión se dice que no hay
 * conexión y ya: la licencia sigue valiendo en local, y eso es lo que importa. El
 * interruptor sí funciona sin red, porque solo cambia un ajuste de este ordenador.
 */
export const Nube: React.FC = () => {
  const { t } = useTranslation();
  const [limpiando, setLimpiando] = useState(false);
  const [estado, setEstado] = useState<pro.EstadoNube | null>(null);
  const [sinConexion, setSinConexion] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setLimpiando(await pro.limpiezaEnNube());
      setEstado(await pro.estadoNube());
      setSinConexion(null);
    } catch (e) {
      setEstado(null);
      setSinConexion(pro.mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const alCambiarLimpieza = async (activa: boolean) => {
    try {
      await pro.ponerLimpiezaEnNube(activa);
      setLimpiando(activa);
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    }
  };

  const alQuitar = async (id: string) => {
    try {
      const dispositivos = await pro.quitarDispositivo(id);
      setEstado((e) => (e ? { ...e, dispositivos } : e));
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    }
  };

  const porcentaje =
    estado && estado.cuota_tokens > 0
      ? Math.min(
          100,
          Math.round((estado.tokens_usados / estado.cuota_tokens) * 100),
        )
      : 0;

  return (
    <div className="flex flex-col gap-2">
      <ToggleSwitch
        checked={limpiando}
        onChange={(v) => void alCambiarLimpieza(v)}
        label={t("pro.cloud.cleanup")}
        description={t("pro.cloud.cleanupDescription")}
        descriptionMode="inline"
        grouped
      />

      {sinConexion !== null ? (
        <p className="flex items-start gap-1.5 px-1 text-xs text-mid-gray">
          <CloudOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{t("pro.cloud.offline")}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void cargar()}
            disabled={cargando}
            className="ml-auto flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" />
            {t("pro.cloud.refresh")}
          </Button>
        </p>
      ) : estado ? (
        <div className="px-1">
          <p className="text-xs text-mid-gray">
            {t("pro.cloud.usage", { porcentaje })}
          </p>
          <p className="mb-1 mt-2 text-xs font-medium">
            {t("pro.cloud.devices", {
              n: estado.dispositivos.length,
              tope: estado.tope_dispositivos,
            })}
          </p>
          <ListaDispositivos
            estado={estado}
            alQuitar={(id) => void alQuitar(id)}
          />
        </div>
      ) : null}
    </div>
  );
};
