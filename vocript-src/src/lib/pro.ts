import { invoke } from "@tauri-apps/api/core";

/**
 * Cliente de los comandos de VoCript Pro.
 *
 * No pasa por `bindings.ts` a propósito: ese archivo lo genera specta al arrancar la app en
 * modo desarrollo, y estos comandos existen con la MISMA firma en las dos ediciones, así que
 * escribir aquí los tipos no duplica nada que el generador vaya a contradecir. El día que
 * `pro/` se mude a su repositorio privado, este archivo se queda y sigue valiendo.
 */

export interface EstadoLicencia {
  activa: boolean;
  correo: string | null;
  expira: string | null;
  /** Por qué no vale. `null` cuando sencillamente no hay licencia, que no es un error. */
  motivo: string | null;
}

export interface Region {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Si este binario trae las funciones de pago dentro. No dice si están desbloqueadas. */
export const proDisponible = () => invoke<boolean>("pro_is_available");

export const estadoLicencia = () =>
  invoke<EstadoLicencia>("pro_license_status");

export const activarLicencia = (clave: string) =>
  invoke<EstadoLicencia>("pro_activate_license", { clave });

export const desactivarLicencia = () => invoke<void>("pro_deactivate_license");

/** Si Windows tiene una voz instalada con la que leer. */
export const hayVoz = () => invoke<boolean>("pro_has_voice");

/**
 * Señalar un trozo de pantalla y oírlo.
 *
 * Devuelve `null` cuando la persona cierra la mirilla sin elegir nada, que no es un error y
 * no debe pintar uno.
 */
export const leerEnVozAlta = () => invoke<string | null>("pro_read_aloud_pick");

/** El atajo que abre la mirilla ahora mismo. */
export const atajo = () => invoke<string>("pro_get_hotkey");

/**
 * Cambia el atajo y lo deja funcionando sin reiniciar.
 *
 * Si el nuevo no se puede registrar, el backend repone el anterior y esto lanza con el
 * motivo, asi que aqui no hay que deshacer nada.
 */
export const ponerAtajo = (atajo: string) =>
  invoke<void>("pro_set_hotkey", { atajo });

/** Lee en voz alta toda la pantalla donde esta el puntero, sin senalar nada. */
export const leerPantalla = () => invoke<string>("pro_read_aloud_screen");

/**
 * Vuelve a leer el ultimo recuadro. Devuelve `null` si todavia no se ha senalado ninguno.
 *
 * Relee la pantalla, no repite el texto guardado: si lo que hay ahi ha cambiado, lo que se
 * espera oir es lo de ahora.
 */
export const repetir = () => invoke<string | null>("pro_read_aloud_again");

/** Si hay algo que repetir. */
export const puedeRepetir = () => invoke<boolean>("pro_can_repeat");

/** Deja la voz a media frase. */
export const pausar = () => invoke<void>("pro_pause_speaking");

/** Sigue por donde se quedo. */
export const seguir = () => invoke<void>("pro_resume_speaking");

/** Manda callar a la voz. */
export const callar = () => invoke<void>("pro_stop_speaking");

/**
 * El agente: le das un encargo y lo resuelve mirando lo que hay en pantalla.
 *
 * Devuelve el texto listo para escribir. Necesita un modelo de lenguaje configurado en
 * Ajustes, el mismo que se usa para limpiar el habla.
 */
export const agenteHaz = (encargo: string) =>
  invoke<string>("pro_agent_do", { encargo });

/** El agente, primer paso: lee la pantalla donde está el puntero y devuelve lo que ve. */
export const agenteMira = () => invoke<string>("pro_agent_see");
