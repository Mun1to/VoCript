import { invoke } from "@tauri-apps/api/core";

/**
 * Cliente de los comandos de VoCript Pro.
 *
 * No pasa por `bindings.ts` a propósito: ese archivo lo genera specta al arrancar la app en
 * modo desarrollo, y estos comandos existen con la MISMA firma en las dos ediciones, así que
 * escribir aquí los tipos no duplica nada que el generador vaya a contradecir. La carpeta
 * `pro/` vive en su repositorio privado; este archivo se queda en el público y sigue valiendo.
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

/** Un ordenador dado de alta en la nube con esta licencia. */
export interface Dispositivo {
  id: string;
  nombre: string;
  /** Fecha de alta, AAAA-MM-DD. */
  alta: string;
}

/** Lo que la nube sabe de esta licencia. */
export interface EstadoNube {
  dispositivos: Dispositivo[];
  tope_dispositivos: number;
  tokens_usados: number;
  cuota_tokens: number;
  /** El id de este ordenador, para marcarlo en la lista. */
  este_dispositivo: string;
}

/** El aviso del backend de que la licencia ha cambiado sola (revocada, rechazada al sincronizar). */
export const EVENTO_LICENCIA_CAMBIADA = "pro://licencia-cambiada";
/** El aviso de que el agente no ha podido contestar a un dictado. Lleva el motivo. */
export const EVENTO_AGENTE_FALLO = "pro://agente-fallo";
/** La respuesta a un encargo dictado desde el botón de la pantalla de Pro. */
export const EVENTO_AGENTE_RESPUESTA = "pro://agente-respuesta";

/** Si este binario trae las funciones de pago dentro. No dice si están desbloqueadas. */
export const proDisponible = () => invoke<boolean>("pro_is_available");

export const estadoLicencia = () =>
  invoke<EstadoLicencia>("pro_license_status");

/**
 * Guarda la licencia si es válida y da de alta este ordenador en la nube.
 *
 * Sin red se guarda igual y la nube se entera al arrancar. Con red, si la licencia ya está
 * en tres ordenadores, vuelve rechazada con el motivo y no se guarda.
 */
export const activarLicencia = (clave: string) =>
  invoke<EstadoLicencia>("pro_activate_license", { clave });

export const desactivarLicencia = () => invoke<void>("pro_deactivate_license");

/** Lo que la nube sabe de esta licencia. Lanza si no hay conexión. */
export const estadoNube = () => invoke<EstadoNube>("pro_cloud_status");

/** Da de baja un ordenador de la lista y devuelve la lista que queda. */
export const quitarDispositivo = (id: string) =>
  invoke<Dispositivo[]>("pro_remove_device", { id });

/** Si la limpieza del habla está encendida y va por la nube de Pro. */
export const limpiezaEnNube = () =>
  invoke<boolean>("pro_cloud_cleanup_enabled");

export const ponerLimpiezaEnNube = (activa: boolean) =>
  invoke<void>("pro_set_cloud_cleanup", { activa });

/** Una voz instalada en el sistema. */
export interface Voz {
  id: string;
  nombre: string;
  /** Etiqueta de idioma, como `es-ES`. */
  idioma: string;
}

/** Qué voz lee y a qué velocidad. `voz_id` a `null` es la que Windows tenga por defecto. */
export interface AjustesVoz {
  voz_id: string | null;
  velocidad: number;
}

export const voces = () => invoke<Voz[]>("pro_list_voices");

export const ajustesVoz = () => invoke<AjustesVoz>("pro_get_voice");

/** Cambia la voz o la velocidad. Se aplica a la siguiente frase que se lea. */
export const ponerVoz = (ajustesVoz: AjustesVoz) =>
  invoke<void>("pro_set_voice", { ajustesVoz });

/** Dice un texto cualquiera, por ejemplo para probar la voz elegida. */
export const decir = (texto: string) => invoke<void>("pro_speak", { texto });

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

/** El atajo del agente ahora mismo. */
export const atajoAgente = () => invoke<string>("pro_get_agent_hotkey");

export const ponerAtajoAgente = (atajo: string) =>
  invoke<void>("pro_set_agent_hotkey", { atajo });

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
 * Devuelve el texto listo para escribir. Con la nube de Pro no necesita nada más; sin ella,
 * usa el modelo que haya configurado para limpiar el habla.
 */
export const agenteHaz = (encargo: string) =>
  invoke<string>("pro_agent_do", { encargo });

/**
 * Empieza o termina un encargo dictado desde un botón: una pulsación empieza, otra termina.
 * La respuesta se escribe donde esté el cursor, igual que con el atajo.
 */
export const agenteDictar = () => invoke<void>("pro_agent_toggle");

/** El agente, primer paso: lee la pantalla donde está el puntero y devuelve lo que ve. */
export const agenteMira = () => invoke<string>("pro_agent_see");
