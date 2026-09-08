//! Los puntos por donde otra edición puede añadir funciones a esta, y lo que contesta
//! VoCript cuando no hay ninguna montada, que es el caso de este repositorio.
//!
//! Esta edición es completa por sí sola: aquí no hay ninguna función recortada ni ninguna
//! comprobación que saltarse. Lo que hay es un contrato de cuatro ganchos y una macro, para
//! que una edición con funciones añadidas se enchufe sin tener que modificar ni una línea
//! del código de aquí. Sin extensión compilada, los cuatro ganchos no hacen nada y la macro
//! no añade ningún comando, así que el binario resultante ni siquiera menciona lo que no
//! trae.
//!
//! Una extensión sustituye este archivo entero por su propio módulo (ver `lib.rs`), así que
//! el contrato son estos cuatro nombres y la macro `con_extension!`; cualquier cosa que se
//! añada aquí hay que añadirla también allí, o no compila.

use tauri::AppHandle;

/// Se llama antes de leer los ajustes por primera vez, cuando el almacén todavía no ha
/// cacheado el archivo. Una extensión que traiga datos de otra instalación lo hace aquí.
pub fn antes_de_leer_los_ajustes(_app: &AppHandle) {}

/// Se llama una vez, con la aplicación ya en pie.
pub fn al_arrancar(_app: &AppHandle) {}

/// Deja que una extensión se quede con un dictado entero: recibe lo que se dijo y devuelve
/// lo que hay que escribir en su lugar. `None` significa «este dictado no es mío», que es
/// siempre en esta edición.
pub async fn transformar_dictado(
    _app: &AppHandle,
    _binding_id: &str,
    _texto: &str,
) -> Option<Result<String, String>> {
    None
}

/// Deja que una extensión decida los reemplazos de palabras según el contexto. `None`
/// significa «no tengo nada que decir», y entonces manda el perfil de la cabecera.
pub fn comandos_del_modo(_app: &AppHandle) -> Option<Vec<crate::settings::WordReplacement>> {
    None
}

/// El identificador del atajo de dictado que aporta la extensión, si aporta alguno. El
/// dictado se registra y se coordina igual que los de casa; lo único que cambia es que su
/// texto acaba en `transformar_dictado` en vez de escribirse tal cual.
pub fn binding_de_dictado() -> Option<&'static str> {
    None
}

/// Envuelve la lista de comandos de la aplicación para que una extensión pueda añadir los
/// suyos. Sin extensión, pasa la lista tal cual.
///
/// Existe porque `collect_commands!` no expande macros dentro de su lista, así que la única
/// forma de que la lista sea variable es que la macro envuelva a `collect_commands!` entera
/// en vez de aparecer dentro de ella. De ahí sale también el `invoke_handler`, así que con
/// esto basta para las dos cosas: los comandos que atiende la aplicación y los tipos que se
/// generan para el frontend.
/// Los comandos se capturan como `tt` y no como `path` a propósito: un `path` llega a
/// `collect_commands!` como un único nodo ya parseado que su macro no sabe volver a leer, y
/// falla con «no rules expected this token». Como `tt`, los tokens pasan tal cual.
#[macro_export]
macro_rules! con_extension {
    ($($comando:tt)*) => {
        tauri_specta::collect_commands![$($comando)*]
    };
}
