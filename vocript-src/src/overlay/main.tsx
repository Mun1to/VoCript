import React from "react";
import ReactDOM from "react-dom/client";
import RecordingOverlay from "./RecordingOverlay";
import { suppressBrowserContextMenu } from "@/lib/utils/browserMenu";
import "@/i18n";

suppressBrowserContextMenu();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RecordingOverlay />
  </React.StrictMode>,
);
