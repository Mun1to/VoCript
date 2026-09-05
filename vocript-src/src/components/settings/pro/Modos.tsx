import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppWindow, ChevronDown, ChevronUp, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Input";
import { Select } from "../../ui/Select";
import { WordReplacements } from "../WordReplacements";
import * as pro from "@/lib/pro";
import type { WordReplacement } from "@/bindings";

/** Los tres perfiles de la edición gratuita, con las etiquetas que ya usa la cabecera. */
const INCORPORADOS = [
  { value: "normal", clave: "header.profile.normal" },
  { value: "coding", clave: "header.profile.coding" },
  { value: "custom", clave: "header.profile.custom" },
];

/**
 * La opción «elige una aplicación» del desplegable. No es la cadena vacía a propósito: el
 * desplegable la toma por «nada elegido» y enseña su marcador de posición en inglés.
 */
const ELIGE = "elige";

/**
 * Un perfil por aplicación, y los perfiles propios que hagan falta.
 *
 * Las reglas dicen qué perfil manda cuando se dicta dentro de cada programa; sin regla
 * para el programa del momento, vale el perfil de la cabecera como siempre. Se guarda al
 * cambiar, sin botón de guardar.
 */
export const Modos: React.FC = () => {
  const { t } = useTranslation();
  const [ajustes, setAjustes] = useState<pro.AjustesModos>({
    perfiles: [],
    modos: [],
  });
  const [apps, setApps] = useState<pro.AppAbierta[]>([]);
  const [appElegida, setAppElegida] = useState(ELIGE);
  const [perfilElegido, setPerfilElegido] = useState("normal");
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);

  const cargarApps = useCallback(async () => {
    try {
      setApps(await pro.appsAbiertas());
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    }
  }, []);

  useEffect(() => {
    void pro
      .modos()
      .then(setAjustes)
      .catch((e) => toast.error(pro.mensajeDeError(e)));
    void cargarApps();
  }, [cargarApps]);

  const guardar = async (nuevo: pro.AjustesModos) => {
    try {
      await pro.ponerModos(nuevo);
      setAjustes(nuevo);
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    }
  };

  const opcionesPerfil = [
    ...INCORPORADOS.map((p) => ({ value: p.value, label: t(p.clave) })),
    ...ajustes.perfiles.map((p) => ({ value: p.id, label: p.nombre })),
  ];
  // Las apps que ya tienen regla no se vuelven a ofrecer: una regla por app.
  const opcionesApp = [
    { value: ELIGE, label: t("pro.modes.appPlaceholder") },
    ...apps
      .filter((a) => !ajustes.modos.some((m) => m.app === a.exe))
      .map((a) => ({
        value: a.exe,
        label: `${a.exe}  ${a.titulo.length > 40 ? `${a.titulo.slice(0, 40)}...` : a.titulo}`,
      })),
  ];

  const anadirRegla = () => {
    if (appElegida === ELIGE) return;
    void guardar({
      ...ajustes,
      modos: [...ajustes.modos, { app: appElegida, perfil: perfilElegido }],
    });
    setAppElegida(ELIGE);
  };

  const cambiarRegla = (app: string, perfil: string) =>
    guardar({
      ...ajustes,
      modos: ajustes.modos.map((m) => (m.app === app ? { ...m, perfil } : m)),
    });

  const quitarRegla = (app: string) =>
    guardar({ ...ajustes, modos: ajustes.modos.filter((m) => m.app !== app) });

  const anadirPerfil = () => {
    const nombre = nombreNuevo.trim();
    if (!nombre) return;
    const id = `pro-${Date.now().toString(36)}`;
    void guardar({
      ...ajustes,
      perfiles: [...ajustes.perfiles, { id, nombre, comandos: [] }],
    });
    setNombreNuevo("");
    setAbierto(id);
  };

  // Borrar un perfil se lleva las reglas que lo usaban: una regla sin perfil no es nada.
  const quitarPerfil = (id: string) =>
    guardar({
      perfiles: ajustes.perfiles.filter((p) => p.id !== id),
      modos: ajustes.modos.filter((m) => m.perfil !== id),
    });

  const cambiarComandos = (id: string, comandos: WordReplacement[]) =>
    guardar({
      ...ajustes,
      perfiles: ajustes.perfiles.map((p) =>
        p.id === id ? { ...p, comandos } : p,
      ),
    });

  return (
    <div className="mt-1 rounded-lg border border-mid-gray/20 p-3">
      <h3 className="text-sm font-medium">{t("pro.modes.title")}</h3>
      <p className="mb-2.5 mt-0.5 text-xs text-mid-gray">
        {t("pro.modes.description")}
      </p>

      {ajustes.modos.length === 0 ? (
        <p className="mb-2 px-1 text-xs text-mid-gray">
          {t("pro.modes.rulesEmpty")}
        </p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {ajustes.modos.map((m) => (
            <li
              key={m.app}
              className="flex items-center gap-2 rounded-md border border-mid-gray/20 px-2.5 py-1.5 text-xs"
            >
              <AppWindow className="h-3.5 w-3.5 shrink-0 text-mid-gray" />
              <span className="min-w-0 flex-1 truncate font-mono">{m.app}</span>
              <div className="w-44">
                <Select
                  value={m.perfil}
                  options={opcionesPerfil}
                  onChange={(valor) => {
                    if (valor) void cambiarRegla(m.app, valor);
                  }}
                />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void quitarRegla(m.app)}
                aria-label={t("pro.modes.remove")}
              >
                <X className="h-3 w-3" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-64 flex-1">
          <Select
            value={appElegida}
            options={opcionesApp}
            onChange={(valor) => setAppElegida(valor ?? ELIGE)}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void cargarApps()}
          title={t("pro.modes.refreshApps")}
          aria-label={t("pro.modes.refreshApps")}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
        <div className="w-44">
          <Select
            value={perfilElegido}
            options={opcionesPerfil}
            onChange={(valor) => setPerfilElegido(valor ?? "normal")}
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={anadirRegla}
          disabled={appElegida === ELIGE}
        >
          {t("pro.modes.add")}
        </Button>
      </div>

      <h4 className="mt-4 text-sm font-medium">{t("pro.modes.profilesTitle")}</h4>
      <p className="mb-2 mt-0.5 text-xs text-mid-gray">
        {t("pro.modes.profilesDescription")}
      </p>

      {ajustes.perfiles.length === 0 ? (
        <p className="mb-2 px-1 text-xs text-mid-gray">
          {t("pro.modes.profilesEmpty")}
        </p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1">
          {ajustes.perfiles.map((p) => (
            <li
              key={p.id}
              className="rounded-md border border-mid-gray/20 px-2.5 py-1.5 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">
                  {p.nombre}
                </span>
                <span className="text-mid-gray">
                  {t("pro.modes.commandCount", { n: p.comandos.length })}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAbierto(abierto === p.id ? null : p.id)}
                  className="flex items-center gap-1"
                >
                  {abierto === p.id ? (
                    <ChevronUp className="h-3 w-3" />
                  ) : (
                    <ChevronDown className="h-3 w-3" />
                  )}
                  {t("pro.modes.commands")}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void quitarPerfil(p.id)}
                  aria-label={t("pro.modes.deleteProfile")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              {abierto === p.id && (
                <div className="mt-2">
                  <WordReplacements
                    grouped
                    titleKey="pro.modes.commandsTitle"
                    descriptionKey="pro.modes.commandsDescription"
                    exportFileName={`${p.nombre}.csv`}
                    value={p.comandos}
                    onChange={(lista) => cambiarComandos(p.id, lista)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="text"
          className="max-w-56"
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              anadirPerfil();
            }
          }}
          placeholder={t("pro.modes.newProfilePlaceholder")}
          variant="compact"
        />
        <Button
          variant="primary"
          size="sm"
          onClick={anadirPerfil}
          disabled={nombreNuevo.trim().length === 0}
        >
          {t("pro.modes.addProfile")}
        </Button>
      </div>
      <p className="mt-2 px-1 text-xs text-mid-gray">{t("pro.modes.hint")}</p>
    </div>
  );
};
