//! Lo que VoCript gratuito contesta cuando le preguntan por las funciones de pago.
//!
//! Mismos comandos y mismas firmas que `pro/`, para que el frontend sea el mismo en las dos
//! ediciones y no haya que mantener dos interfaces. Aquí no hay ninguna función recortada ni
//! ninguna comprobación que saltarse: el código de pago sencillamente no está en este
//! binario, así que no hay nada que desbloquear tocando un archivo.
//!
//! Este archivo se queda en el repositorio público. La carpeta `pro/` no.

use crate::pro_tipos::{
    AjustesModos, AjustesVoz, AppAbierta, Dispositivo, EstadoLicencia, EstadoNube, Region,
    ResumenImportacion, Voz,
};
use tauri::AppHandle;

/// Esta edición no trae las funciones de pago.
///
/// La interfaz usa esto para no enseñar siquiera dónde se pega una licencia: ofrecer una
/// casilla que nunca va a servir de nada es peor que no ofrecer ninguna.
#[tauri::command]
#[specta::specta]
pub fn pro_is_available() -> bool {
    false
}

/// El enganche con el dictado: en esta edición ningún dictado es para Pro.
pub async fn transformar_dictado(
    _app: &AppHandle,
    _binding_id: &str,
    _texto: &str,
) -> Option<Result<String, String>> {
    None
}

#[tauri::command]
#[specta::specta]
pub async fn pro_cloud_status(
    _app: AppHandle,
    _clave: Option<String>,
) -> Result<EstadoNube, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_remove_device(
    _app: AppHandle,
    _id: String,
    _clave: Option<String>,
) -> Result<Vec<Dispositivo>, String> {
    Err(NO_ESTA.to_string())
}

/// En esta edición no hay otra VoCript de la que importar nada.
#[tauri::command]
#[specta::specta]
pub fn pro_import_summary(_app: AppHandle) -> Option<ResumenImportacion> {
    None
}

/// En la edición gratuita no hay nada que hacer antes de leer los ajustes.
pub fn antes_de_leer_los_ajustes(_app: &AppHandle) {}

/// En la edición gratuita ninguna aplicación manda sobre el perfil de la cabecera.
pub fn comandos_del_modo(_app: &AppHandle) -> Option<Vec<crate::settings::WordReplacement>> {
    None
}

#[tauri::command]
#[specta::specta]
pub fn pro_get_modes(_app: AppHandle) -> AjustesModos {
    AjustesModos::default()
}

#[tauri::command]
#[specta::specta]
pub fn pro_set_modes(_app: AppHandle, _modos: AjustesModos) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_running_apps(_app: AppHandle) -> Result<Vec<AppAbierta>, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_cloud_cleanup_enabled(_app: AppHandle) -> bool {
    false
}

#[tauri::command]
#[specta::specta]
pub fn pro_set_cloud_cleanup(_app: AppHandle, _activa: bool) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_agent_toggle(_app: AppHandle) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_list_voices(_app: AppHandle) -> Result<Vec<Voz>, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_get_voice(_app: AppHandle) -> AjustesVoz {
    AjustesVoz::default()
}

#[tauri::command]
#[specta::specta]
pub fn pro_set_voice(_app: AppHandle, _ajustes_voz: AjustesVoz) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_speak(_app: AppHandle, _texto: String) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_get_agent_hotkey(_app: AppHandle) -> String {
    String::new()
}

#[tauri::command]
#[specta::specta]
pub fn pro_set_agent_hotkey(_app: AppHandle, _atajo: String) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_license_status(_app: AppHandle) -> EstadoLicencia {
    EstadoLicencia::sin_licencia()
}

#[tauri::command]
#[specta::specta]
pub async fn pro_activate_license(
    _app: AppHandle,
    _clave: String,
) -> Result<EstadoLicencia, String> {
    Ok(EstadoLicencia::rechazada(NO_ESTA))
}

#[tauri::command]
#[specta::specta]
pub async fn pro_deactivate_license(_app: AppHandle) -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_read_region(_app: AppHandle, _region: Region) -> Result<String, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_read_aloud(_app: AppHandle, _region: Region) -> Result<String, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_pick_region(_app: AppHandle) -> Result<Option<Region>, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_read_aloud_pick(_app: AppHandle) -> Result<Option<String>, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_has_voice() -> bool {
    false
}

#[tauri::command]
#[specta::specta]
pub async fn pro_read_aloud_screen(_app: AppHandle) -> Result<String, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_read_aloud_again(_app: AppHandle) -> Result<Option<String>, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn pro_can_repeat() -> bool {
    false
}

#[tauri::command]
#[specta::specta]
pub fn pro_pause_speaking() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn pro_resume_speaking() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn pro_stop_speaking() -> Result<(), String> {
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn pro_get_hotkey(_app: AppHandle) -> String {
    String::new()
}

#[tauri::command]
#[specta::specta]
pub fn pro_set_hotkey(_app: AppHandle, _atajo: String) -> Result<(), String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_agent_see(_app: AppHandle) -> Result<String, String> {
    Err(NO_ESTA.to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn pro_agent_do(_app: AppHandle, _encargo: String) -> Result<String, String> {
    Err(NO_ESTA.to_string())
}

const NO_ESTA: &str = "Esta edición de VoCript no incluye las funciones de VoCript Pro.";

/// En la edición gratuita no hay nada que enganchar al arrancar.
pub fn al_arrancar(_app: &AppHandle) {}

#[cfg(test)]
mod pruebas {
    /// La edición gratuita dice que no trae Pro, y de eso depende que la interfaz no enseñe
    /// ni la pantalla de la licencia. Si esto se pusiera a `true` por descuido, la edición
    /// gratuita ofrecería funciones que no puede ejecutar.
    #[test]
    fn la_edicion_gratuita_no_anuncia_pro() {
        assert!(!super::pro_is_available());
    }

    /// Y tampoco tiene voz que ofrecer.
    #[test]
    fn la_edicion_gratuita_no_ofrece_voz() {
        assert!(!super::pro_has_voice());
    }
}
