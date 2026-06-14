# VoCript

> Transcriptor de audio a texto personalizado, 100% offline.
> Fork de [Handy](https://github.com/cjpais/handy) v0.8.3 · Modelo Whisper Turbo.

<p align="center">
  <a href="https://github.com/Mun1to/Vocript/releases/latest">
    <img src="https://img.shields.io/badge/⬇-Descargar%20VoCript-2563eb?style=for-the-badge&logo=windows&logoColor=white" alt="Descargar VoCript" />
  </a>
</p>

---

## ⬇️ Descargar

1. Entra en **[la última versión (Releases)](https://github.com/Mun1to/Vocript/releases/latest)**.
2. Descarga el instalador `VoCript_x.y.z_x64-setup.exe`.
3. Ejecútalo y sigue los pasos. ¡Listo!

> Windows puede mostrar un aviso de "editor desconocido" (la app no está firmada
> con certificado de pago). Pulsa **Más información → Ejecutar de todas formas**.

## 🔄 Actualizaciones

VoCript se actualiza **solo**: al abrirlo comprueba si hay una versión nueva y,
si la hay, te ofrece instalarla con un clic (no hay que volver a descargar nada
a mano). Las versiones se publican automáticamente desde GitHub Actions cada vez
que se sube una etiqueta de versión.

---

## ¿Qué es VoCript?

Aplicación de dictado por voz para Windows. Pulsas un atajo, hablas, y el texto
se escribe donde tengas el cursor. Todo el reconocimiento ocurre en local (sin
enviar audio a ningún servidor). Es un fork personalizado de Handy con:

- Identidad propia (nombre, logo y colores azules)
- Captura de audio desde el primer milisegundo (VAD ajustado)
- Español como idioma por defecto, optimizado para acentos y puntuación

---

## Estado del proyecto

| Fase | Descripción | Estado |
|------|-------------|--------|
| 0 | Entorno de desarrollo | ✅ Completada |
| 1 | Identidad (renombrar a MuVox) | ✅ Completada |
| 2 | Visual (rosa → azul) | ✅ Completada |
| 3 | Audio (VAD pre-buffer) | ✅ Completada |
| 4 | Español por defecto | ✅ Completada |
| 5 | Extras (Claude API, etc.) | 📋 Backlog |

**Próximo paso:** generar el instalador de producción con `bun tauri build`.
Ver detalle en [PLAN.md](PLAN.md).

---

## 🚀 Cómo arrancar una sesión nueva de Claude

Para no gastar tokens releyendo chats largos, al abrir una sesión nueva basta con
que Claude lea **estos 3 archivos** (en este orden):

1. **`README.md`** (este archivo) — visión general y estado
2. **`sesiones/`** — la última sesión registrada (continúa desde ahí)
3. **`PLAN.md`** — el plan maestro por fases

> La memoria automática de Claude ya carga un resumen del proyecto. Estos archivos
> aportan el detalle. **No hace falta releer sesiones antiguas completas.**

Prompt sugerido para abrir sesión:

```
Continuamos con MuVox (C:\proyectos\MuVox). Lee README.md, la última sesión
en sesiones\ y PLAN.md para retomar el contexto. ¿Por dónde vamos?
```

Al **cerrar** una sesión: pídele a Claude que registre lo hecho en
`sesiones/sesion-NN.md` (ver [sesiones/README.md](sesiones/README.md)).

---

## Mapa del proyecto

```
C:\proyectos\MuVox\
├── README.md                 ← estás aquí
├── PLAN.md                   ← plan maestro por fases
├── docs\
│   ├── ENTORNO.md            ← cómo compilar (deps, variables, comandos, errores)
│   └── ACTUALIZACIONES.md    ← estrategia para mejoras de Handy upstream
├── sesiones\
│   ├── README.md             ← índice + protocolo de sesión
│   └── sesion-NN.md          ← registro de cada sesión de trabajo
├── handy-src\                ← código fuente (fork de Handy)
└── releases\                 ← instaladores compilados
```

---

## Comandos rápidos

Desde `C:\proyectos\MuVox\handy-src` (con las variables de entorno cargadas — ver
[docs/ENTORNO.md](docs/ENTORNO.md)):

| Acción | Comando |
|--------|---------|
| Desarrollo (hot-reload) | `bun tauri dev` |
| Build de producción (MSI) | `bun tauri build` |
| Verificar que compila | `cd src-tauri && cargo check` |
