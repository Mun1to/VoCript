# AGENTS.md — Reglas de IA para VoCript

> Este archivo define las instrucciones y directivas obligatorias para cualquier modelo de IA (Gemini, Claude, Cursor, etc.) en el proyecto **VoCript**.

## Directivas Obligatorias Multi-Proyecto

1. **Lectura y Registro Obligatorio en `FEEDBACK.md`**:
   - Antes de iniciar cualquier tarea en un proyecto, DEBES leer su archivo `FEEDBACK.md` para aprender de su historial y no repetir errores pasados.
   - Cada vez que nos enfrentemos a un obstáculo técnico, error de compilación o sesión de depuración prolongada ("batallando con un bug o un fail"), DEBES registrar automáticamente el problema, la causa raíz y la solución exacta dentro del `FEEDBACK.md` del proyecto correspondiente.

2. **Implementación Exhaustiva y Global**:
   - Toda funcionalidad, cambio visual o internacionalización (i18n) DEBE implementarse de forma global en toda la aplicación. Prohibido dejar textos hardcodeados o componentes a medias.

3. **Reflexión Profunda y Verificación Multi-Paso**:
   - Antes de presentarme un trabajo, realiza una auditoría interna de 2 a 3 pasadas comprobando casos de borde, temas (Claro/Oscuro) e idiomas.

4. **Planes de Implementación Proactivos**:
   - Ante solicitudes complejas o ambigüedades, prepara un plan estructurado con pasos claros y solicita confirmación antes de modificar código.
