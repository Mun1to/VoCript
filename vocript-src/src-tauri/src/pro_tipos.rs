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
