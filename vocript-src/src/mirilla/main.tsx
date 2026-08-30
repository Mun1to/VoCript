import React from "react";
import ReactDOM from "react-dom/client";
import { Mirilla } from "./Mirilla";
import { suppressBrowserContextMenu } from "@/lib/utils/browserMenu";
import "@/i18n";

suppressBrowserContextMenu();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Mirilla />
  </React.StrictMode>,
);
