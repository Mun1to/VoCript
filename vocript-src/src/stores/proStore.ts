import { create } from "zustand";
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
