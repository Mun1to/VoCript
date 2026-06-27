# FEEDBACK.md - Registro Continuo de Desarrollo y Retroalimentación de IA

Este documento actúa como la **memoria viva del proyecto**. Registra los desafíos técnicos, errores, sesiones de depuración prolongadas y las soluciones encontradas durante el desarrollo asistido por Inteligencia Artificial para evitar repetir los mismos fallos en el futuro.

---

## 🔍 Registro de Retos y Errores Resueltos (Historial del Proyecto)

### 1. [Fallo GUI] La ventana nativa de Tauri no aparecía al compilar en modo Dev desde subconcha de IA
- **Síntoma / Error**: Al ejecutar `bun run tauri dev` desde herramientas de subconcha en segundo plano, la consola indicaba que Rust y Vulkan habían arrancado, pero la ventana física no aparecía en el escritorio de Windows (el icono aparecía des-ejecutado o minimizado).
- **Causa Raíz**: Windows ejecuta tareas en segundo plano bajo sesiones de consola de servicio sin permisos interactivos para robar el foco de la pantalla de usuario (`Winsta0\Default`). Además, VoCript tenía `start_hidden: true` por defecto.
- **Solución Definitiva**:
  1. Ejecutar el comando `bun run tauri dev` directamente en la terminal interactiva del usuario.
  2. En el backend de Rust (`src-tauri/src/lib.rs`), forzar `.visible(true)` en el constructor y llamar síncronamente a `show_main_window`.
  3. En el ciclo de vida de React (`App.tsx`), invocar `commands.showMainWindowCommand()` al montarse.

### 2. [Fallo i18n] Textos desincronizados al cambiar a idiomas secundarios (ej. Chino, Alemán)
- **Síntoma / Error**: Al cambiar el idioma a Chino o Alemán, partes del Header y de las opciones mostraban texto en inglés o insignias fijas en español (`DESACTIVADO`).
- **Causa Raíz**: Claves i18n faltantes en los 20 archivos `translation.json` de la carpeta `src/i18n/locales/` y cadenas hardcodeadas en JSX.
- **Solución Definitiva**: Sustituir todas las cadenas por `t(...)` e implementar un script de sincronización profunda que inyectó las traducciones nativas exactas en los 20 idiomas soportados (`zh`, `zh-TW`, `de`, `fr`, `ja`, `es`, `en`, etc.).

---

## 💡 Sugerencia para Futuras Aplicaciones: Módulo de Feedback Integrado

En futuras aplicaciones o actualizaciones del portafolio, se sugiere incorporar un módulo de feedback para el usuario final estructurado en 3 tarjetas:
1. 💡 **Sugerencias de Funciones**: Para recolectar ideas de los usuarios.
2. 🐛 **Reportar Problemas**: Para canalizar bugs técnicos.
3. 🤝 **Opinión General**: Para valorar la experiencia de usuario.
