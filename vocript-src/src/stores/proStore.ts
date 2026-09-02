import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import i18n from "i18next";
import * as pro from "@/lib/pro";

/**
 * Estado de VoCript Pro: si esta edición lo trae y si hay licencia.
 *
 * Vive en un store aparte y no en los ajustes porque no es una preferencia: es un hecho del
 * binario y de un archivo firmado. Meterlo en los ajustes lo convertiría en algo que se puede
 * cambiar escribiendo en un JSON, que es justo lo contrario de una licencia.
 */
interface EstadoPro {
  /** `null` mientras no se ha preguntado todavía, para no parpadear al arrancar. */
  disponible: boolean | null;
  licencia: pro.EstadoLicencia | null;
  hayVoz: boolean;
  cargar: () => Promise<void>;
  activar: (clave: string) => Promise<pro.EstadoLicencia>;
  desactivar: () => Promise<void>;
}

/** Los avisos del backend se escuchan una sola vez por ventana, no una por pantalla. */
let escuchando = false;

function escuchar(recargar: () => Promise<void>) {
  if (escuchando) return;
  escuchando = true;

  // La nube ha retirado la licencia (revocada, o rechazada al sincronizar una activación
  // que se hizo sin red). Se recarga el estado, que ya vendrá sin licencia, y se dice por qué.
  void listen<string>(pro.EVENTO_LICENCIA_CAMBIADA, (evento) => {
    void recargar();
    toast.warning(i18n.t("pro.license.changed", { motivo: evento.payload }), {
      duration: 12000,
    });
  });

  // El agente no ha podido contestar a un dictado. No se ha pegado nada, y sin esto la
  // persona solo vería que el atajo «no hace nada».
  void listen<string>(pro.EVENTO_AGENTE_FALLO, (evento) => {
    toast.error(i18n.t("pro.agent.failed", { motivo: evento.payload }), {
      duration: 8000,
    });
  });
}

export const useProStore = create<EstadoPro>((set, get) => ({
  disponible: null,
  licencia: null,
  hayVoz: false,

  cargar: async () => {
    const disponible = await pro.proDisponible();
    if (!disponible) {
      // En la edición gratuita no se pregunta nada más: no hay licencia que mirar ni voz
      // que ofrecer, y preguntarlo solo añadiría dos viajes al backend en cada arranque.
      set({ disponible: false, licencia: null, hayVoz: false });
      return;
    }
    escuchar(get().cargar);
    const [licencia, hayVoz] = await Promise.all([
      pro.estadoLicencia(),
      pro.hayVoz(),
    ]);
    set({ disponible: true, licencia, hayVoz });
  },

  activar: async (clave) => {
    const licencia = await pro.activarLicencia(clave);
    set({ licencia });
    return licencia;
  },

  desactivar: async () => {
    await pro.desactivarLicencia();
    set({ licencia: await pro.estadoLicencia() });
  },
}));

/** Si las funciones de pago están desbloqueadas en este equipo ahora mismo. */
export const proActivo = () => useProStore.getState().licencia?.activa ?? false;
