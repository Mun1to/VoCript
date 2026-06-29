<div align="center">

# 🎙️ VoCript

**Dicta y se escribe. Transcripción de voz a texto para Windows, 100 % offline.**

🌍 Español · [English](README.en.md)

<p>
  <a href="https://github.com/Mun1to/Vocript/releases/latest">
    <img src="https://img.shields.io/github/v/release/Mun1to/Vocript?label=descargar&style=for-the-badge&color=3b82f6" alt="Última versión" />
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/licencia-MIT-3b82f6?style=for-the-badge" alt="Licencia MIT" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/Mun1to/Vocript/releases/latest">
    <img src="brand/download-button.svg" alt="Descargar VoCript" width="320" height="72" />
  </a>
</p>

</div>

---

## ✨ Qué hace

VoCript convierte tu voz en texto al instante, **donde tengas el cursor**. Todo
el reconocimiento ocurre **en tu equipo**: tu audio nunca sale de tu ordenador.

- 🎤 **Dictado por voz** — pulsa un atajo, habla y el texto se escribe en cualquier app.
- 🖥️ **Audio del sistema** — transcribe lo que suena en el PC (un vídeo, una llamada) o una app concreta.
- 📁 **Transcribir archivos** — convierte audio o vídeo a texto o subtítulos `.srt`.
- ⚡ **Transcripción en vivo** — ve el texto en una cápsula flotante mientras hablas (push-to-talk).
- 📒 **Diccionario personal** — reemplazos exactos para nombres, jerga o abreviaturas, con importar/exportar CSV.
- 🕑 **Historial** — guarda tus transcripciones y reproduce el audio original.
- 🇪🇸 **Optimizado para español** (acentos y puntuación), con el soporte multi-idioma de Whisper.

---

## 📸 Así se ve

<div align="center">
  <img src="brand/screenshots/01-general.png" alt="VoCript — pantalla principal" width="820" />
</div>

<p align="center"><em>Pantalla principal: barra de controles rápidos en el header — modo voz/sistema, salida (pegar/copiar), activación, perfil e idioma. Todo el reconocimiento ocurre en tu equipo.</em></p>

| Transcribir archivos | Modelos de transcripción | Ajustes avanzados |
| :--: | :--: | :--: |
| <img src="brand/screenshots/03-transcribe.png" alt="Transcribir archivos a texto o SRT" /> | <img src="brand/screenshots/02-models.png" alt="Modelos de transcripción" /> | <img src="brand/screenshots/04-advanced.png" alt="Ajustes avanzados" /> |

---

## ⬇️ Descargar

1. Entra en **[la última versión (Releases)](https://github.com/Mun1to/Vocript/releases/latest)**.
2. Descarga el instalador `VoCript_x.y.z_x64-setup.exe`.
3. Ejecútalo y sigue los pasos. ¡Listo!

> Windows puede mostrar un aviso de "editor desconocido" (la app aún no está
> firmada con un certificado de pago). Pulsa **Más información → Ejecutar de
> todas formas**.

## 🔄 Actualizaciones automáticas

VoCript se actualiza **solo**: al abrirlo comprueba si hay una versión nueva y,
si la hay, te la instala con un clic. No tienes que volver a descargar nada a
mano.

---

## ⌨️ Cómo se usa

1. Abre VoCript (se queda en la bandeja del sistema, junto al reloj).
2. La primera vez, descarga un modelo de transcripción (Whisper).
3. Coloca el cursor donde quieras escribir, pulsa el **atajo de dictado**, habla y suéltalo.
4. El texto aparece donde tenías el cursor.

Todos los atajos se configuran en **Ajustes → General**.

## 🔒 Privacidad

VoCript funciona **100 % en local**. No hay cuentas, ni nube, ni telemetría: tu
voz y tus transcripciones **no salen de tu ordenador**. El post-procesado con IA
en la nube es opcional y está desactivado por defecto.

> 🛡️ **Revisado en seguridad.** VoCript ha pasado una revisión de seguridad
> _sin vulnerabilidades críticas_: reconocimiento 100 % local, sin inyección de
> comandos, actualizaciones firmadas (minisign) y webview restringido (CSP).
> Lee el [modelo de seguridad completo](SECURITY.md).

---

## 🛠️ Para desarrolladores

VoCript está hecho con **Tauri 2** (Rust + React/TypeScript) y **Whisper.cpp**
con aceleración por GPU (Vulkan). El código fuente está en
[`handy-src/`](handy-src/).

```bash
cd handy-src
bun install
bun run tauri dev      # desarrollo (hot-reload)
bun run tauri build    # instalador de producción
```

## 📄 Licencia y créditos

VoCript es software libre bajo licencia [MIT](LICENSE).

Es un **fork de [Handy](https://github.com/cjpais/Handy)**, creado por
[CJ Pais](https://github.com/cjpais) (también MIT) — gracias por el excelente
trabajo base. El motor de transcripción es
[Whisper.cpp](https://github.com/ggerganov/whisper.cpp), de Georgi Gerganov.

¿Encuentras un fallo de seguridad? Consulta la [política de seguridad](SECURITY.md).

---

<div align="center">

🌸 Parte de la **Fundación Orquio** · *Easy Tech*

<sub>Tecnología esencial orquestada de forma optimizada, positiva y transparente.</sub>

</div>
