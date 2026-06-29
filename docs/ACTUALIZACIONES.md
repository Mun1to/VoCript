# Actualizaciones y relación con Handy upstream

VoCript es un fork. Esto explica cómo gestionar las actualizaciones — tanto las del
propio VoCript como las mejoras que el autor de Handy pueda publicar.

---

## Auto-updater: DESACTIVADO

El updater automático de Handy está apagado. En `tauri.conf.json`:

```json
"updater": { "endpoints": [] }
```

**Consecuencia:** VoCript nunca se actualiza solo ni intenta descargar versiones de
Handy. Tú controlas al 100% qué versión usas. No hay riesgo de que una
actualización del autor original sobrescriba tus personalizaciones.

---

## ¿Y si Handy publica mejoras interesantes?

El modelo open source **no obliga a nada**. Handy puede sacar mejoras (mejor VAD,
nuevos modelos, corrección de bugs, más idiomas), pero adoptarlas es decisión tuya
y siempre **manual y selectiva**.

### Estrategia recomendada: cherry-pick manual

1. Revisar el repo de Handy de vez en cuando:
   https://github.com/cjpais/handy/commits/main
2. Identificar un cambio concreto que interese (ej. mejora del VAD).
3. Mirar el diff de ese cambio en GitHub.
4. Aplicar **solo ese cambio** a mano en `vocript-src`, respetando nuestras
   personalizaciones.

> **NO hacer `git pull` ni merge ciego.** Traería de vuelta el nombre "Handy",
> los colores rosas y revertiría nuestros ajustes.

---

## Archivos con personalizaciones (no sobrescribir al traer cambios)

Si alguna vez se integra código de Handy, revisar con cuidado estos archivos
porque contienen cambios propios de VoCript:

| Archivo | Personalización |
|---------|-----------------|
| `tauri.conf.json` | productName, identifier, updater vacío, sin signCommand |
| `Cargo.toml` | name = "vocript" |
| `package.json`, `index.html` | nombre y título VoCript |
| `src/App.css`, `src/overlay/RecordingOverlay.css` | paleta azul |
| `src/components/icons/VoCriptTextLogo.tsx` | logo de texto "VoCript" |
| `src-tauri/src/managers/audio.rs` | parámetros del VAD ajustados |
| `src-tauri/src/settings.rs` | idioma por defecto "es" |
| `src-tauri/src/` (varios) | strings "Handy" → "VoCript" |

(Lista completa de cambios por fase en [../PLAN.md](../PLAN.md).)

---

## Actualizar el modelo de transcripción

El modelo Whisper (Turbo u otro) se descarga desde la propia UI de VoCript, no por
el updater de la app. Cambiar de modelo o actualizarlo es independiente del código:
se hace desde la pantalla de selección de modelo dentro de la aplicación.
