//! Los tipos que cruzan la puerta de VoCript Pro.
//!
//! Viven fuera de `pro/` y se compilan siempre, con o sin la bandera `pro`, porque los usan
//! las dos implementaciones: la de pago y la que solo dice que no está disponible. Así el
//! frontend es exactamente el mismo binario de JavaScript en las dos ediciones, y el día que
//! `pro/` se mude a su repositorio privado, esto se queda aquí y nada se rompe.
//!
//! Aquí no hay lógica a propósito: son las formas, no las decisiones.

use serde::{Deserialize, Serialize};

/// Lo que la interfaz necesita saber de una licencia, sin exponerle nada de criptografía.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct EstadoLicencia {
    /// La única que decide si las funciones de pago se ven o no.
    pub activa: bool,
    pub correo: Option<String>,
    pub expira: Option<String>,
    /// Por qué no vale, en un texto que se le pueda enseñar a una persona.
    pub motivo: Option<String>,
}

impl EstadoLicencia {
    /// Nadie ha comprado nada todavía, que es el caso de casi todo el mundo.
    ///
    /// Sin motivo a propósito: no hay nada que reprocharle a quien no tiene licencia, y un
    /// mensaje de error donde no ha habido error solo asusta.
    pub fn sin_licencia() -> Self {
        Self {
            activa: false,
            correo: None,
            expira: None,
            motivo: None,
        }
    }

    /// Hay algo, pero no vale, y hay que decir por qué.
    pub fn rechazada(motivo: impl Into<String>) -> Self {
        Self {
            activa: false,
            correo: None,
            expira: None,
            motivo: Some(motivo.into()),
        }
    }
}

/// El id del atajo del agente dentro del sistema de dictado de VoCript.
///
/// Es el único nombre de Pro que la edición gratuita conoce: lo necesita para saber que ese
/// dictado no se pega tal cual sino que se le entrega a Pro (ver `actions.rs`). En la edición
/// gratuita ese atajo nunca se registra, así que el nombre no lleva a ningún sitio.
pub const BINDING_AGENTE: &str = "pro_agente";

/// Un ordenador dado de alta en la nube con una licencia.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Dispositivo {
    pub id: String,
    pub nombre: String,
    /// Fecha de alta, AAAA-MM-DD.
    pub alta: String,
}

/// Lo que la nube sabe de esta licencia, para enseñarlo en la pantalla de Pro.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct EstadoNube {
    pub dispositivos: Vec<Dispositivo>,
    pub tope_dispositivos: u32,
    pub tokens_usados: u64,
    pub cuota_tokens: u64,
    /// El id de este ordenador, para marcarlo en la lista y no dejar que se quite a sí mismo
    /// sin querer.
    pub este_dispositivo: String,
}

/// Lo que Pro se trajo de la VoCript gratuita en su primer arranque, para contarlo una vez.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct ResumenImportacion {
    /// AAAA-MM-DD.
    pub fecha: String,
    /// `false` cuando no había nada que traer, o Pro ya tenía lo suyo.
    pub hecha: bool,
    pub ajustes: bool,
    pub historial: bool,
    pub grabaciones: u32,
    pub modelos: u32,
    /// La interfaz ya lo ha contado. Se cuenta una sola vez.
    pub avisada: bool,
}

impl ResumenImportacion {
    /// Se miró y no había que traer nada, o Pro ya tenía lo suyo.
    ///
    /// Solo la llama la edición de pago; en la gratuita queda sin usar a propósito.
    #[allow(dead_code)]
    pub fn saltada(fecha: String) -> Self {
        Self {
            fecha,
            hecha: false,
            ajustes: false,
            historial: false,
            grabaciones: 0,
            modelos: 0,
            avisada: true,
        }
    }
}

/// Un perfil propio de Pro: un nombre y sus comandos de voz a símbolo, como el
/// «Personalizado» de la edición gratuita pero sin límite de cuántos.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct PerfilPro {
    pub id: String,
    pub nombre: String,
    pub comandos: Vec<crate::settings::WordReplacement>,
}

/// Qué perfil manda cuando se dicta dentro de una aplicación concreta.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Modo {
    /// El ejecutable, en minúsculas y sin ruta: `slack.exe`.
    pub app: String,
    /// `normal`, `coding`, `custom` o el id de un perfil propio.
    pub perfil: String,
}

/// Los perfiles propios y las reglas por aplicación, juntos porque se editan juntos.
#[derive(Debug, Clone, Default, Serialize, Deserialize, specta::Type)]
pub struct AjustesModos {
    pub perfiles: Vec<PerfilPro>,
    pub modos: Vec<Modo>,
}

/// Una aplicación con ventana abierta ahora mismo, para elegirla en una regla.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AppAbierta {
    pub exe: String,
    pub titulo: String,
}

/// Una voz instalada en el sistema, para elegirla.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct Voz {
    pub id: String,
    pub nombre: String,
    /// Etiqueta de idioma, como `es-ES`.
    pub idioma: String,
}

/// Cómo se lee en voz alta: qué voz y a qué velocidad.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
pub struct AjustesVoz {
    /// `None` es la voz que Windows tenga puesta por defecto.
    pub voz_id: Option<String>,
    /// 1.0 es la velocidad normal; 2.0 el doble.
    pub velocidad: f64,
}

impl Default for AjustesVoz {
    fn default() -> Self {
        Self {
            voz_id: None,
            velocidad: 1.0,
        }
    }
}

/// Un rectángulo en coordenadas de escritorio, tal cual las da el sistema.
///
/// Físicas, no lógicas: con dos monitores a escalas distintas, las lógicas de uno no
/// significan lo mismo que las del otro y el recorte se va de sitio.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, specta::Type)]
pub struct Region {
    pub x: i32,
    pub y: i32,
    pub ancho: u32,
    pub alto: u32,
}
