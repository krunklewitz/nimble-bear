import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createPlatform } from "./platform";
import { App } from "./ui/App";
import { PlatformProvider } from "./ui/PlatformContext";
import "./ui/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={createPlatform()}>
      <App version={__APP_VERSION__} />
    </PlatformProvider>
  </StrictMode>,
);
