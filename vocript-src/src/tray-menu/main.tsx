import React from "react";
import ReactDOM from "react-dom/client";
import TrayMenu from "./TrayMenu";
import "@/i18n";
// App.css carries Tailwind and every theme token. A separate window does not
// inherit the main window's styles — forgetting this is what once shipped the
// overlay with a black logo.
import "../App.css";
// Must come after App.css: it undoes the opaque page background so the window
// stays transparent around the rounded card.
import "./TrayMenu.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <TrayMenu />
  </React.StrictMode>,
);
