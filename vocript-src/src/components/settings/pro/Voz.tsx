import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Volume2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../ui/Button";
import { Select } from "../../ui/Select";
import { SettingContainer } from "../../ui/SettingContainer";
import * as pro from "@/lib/pro";

/** Las velocidades que se ofrecen. Windows admite de 0,5 a 6; más de 2 no lo sigue nadie. */
const VELOCIDADES: { valor: number; clave: string }[] = [
  { valor: 0.75, clave: "pro.voice.speedSlow" },
  { valor: 1, clave: "pro.voice.speedNormal" },
  { valor: 1.25, clave: "pro.voice.speedFast" },
  { valor: 1.5, clave: "pro.voice.speedFaster" },
  { valor: 2, clave: "pro.voice.speedDouble" },
];

/**
 * La opción «la del sistema» del desplegable de voces. No es la cadena vacía a propósito: el
 * desplegable la toma por «nada elegido» y enseña su marcador de posición en inglés.
 */
const DEL_SISTEMA = "sistema";

/**
 * Elegir con qué voz y a qué velocidad se lee en voz alta.
 *
 * Las voces son las del sistema, listadas por el backend. Se guarda al cambiar, sin botón
 * de guardar: una voz se elige oyéndola, y para eso está «Probar».
 */
export const Voz: React.FC = () => {
  const { t } = useTranslation();
  const [voces, setVoces] = useState<pro.Voz[]>([]);
  const [ajustes, setAjustes] = useState<pro.AjustesVoz>({
    voz_id: null,
    velocidad: 1,
  });

  useEffect(() => {
    void pro
      .voces()
      .then(setVoces)
      .catch(() => setVoces([]));
    void pro.ajustesVoz().then(setAjustes);
  }, []);

  const guardar = async (nuevos: pro.AjustesVoz) => {
    try {
      await pro.ponerVoz(nuevos);
      setAjustes(nuevos);
      toast.success(t("pro.voice.saved"));
    } catch (e) {
      toast.error(pro.mensajeDeError(e));
    }
  };

  const opcionesVoz = [
    { value: DEL_SISTEMA, label: t("pro.voice.systemDefault") },
    ...voces.map((v) => ({ value: v.id, label: `${v.nombre} (${v.idioma})` })),
  ];
  const opcionesVelocidad = VELOCIDADES.map((v) => ({
    value: String(v.valor),
    label: t(v.clave),
  }));

  return (
    <div className="mt-1 rounded-lg border border-mid-gray/20 p-3">
      <h3 className="text-sm font-medium">{t("pro.voice.title")}</h3>
      <p className="mb-2.5 mt-0.5 text-xs text-mid-gray">
        {t("pro.voice.description")}
      </p>
      <SettingContainer title={t("pro.voice.voice")} description="" grouped>
        <div className="w-72">
          <Select
            value={ajustes.voz_id ?? DEL_SISTEMA}
            options={opcionesVoz}
            onChange={(valor) =>
              void guardar({
                ...ajustes,
                voz_id: valor && valor !== DEL_SISTEMA ? valor : null,
              })
            }
          />
        </div>
      </SettingContainer>
      <SettingContainer title={t("pro.voice.speed")} description="" grouped>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Select
              value={String(ajustes.velocidad)}
              options={opcionesVelocidad}
              onChange={(valor) =>
                void guardar({
                  ...ajustes,
                  velocidad: valor ? Number(valor) : 1,
                })
              }
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              void pro
                .decir(t("pro.voice.sample"))
                .catch((e) => toast.error(pro.mensajeDeError(e)))
            }
            className="flex items-center gap-1.5"
          >
            <Volume2 className="h-3.5 w-3.5" />
            {t("pro.voice.test")}
          </Button>
        </div>
      </SettingContainer>
      <p className="mt-2 px-1 text-xs text-mid-gray">
        {t("pro.voice.naturalHint")}
      </p>
    </div>
  );
};
