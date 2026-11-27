import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createPlatform } from "./platform";
import { App } from "./ui/App";
import { LibraryProvider } from "./ui/LibraryContext";
import { PlatformProvider } from "./ui/PlatformContext";
import "./ui/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <PlatformProvider platform={createPlatform()}>
      <LibraryProvider version={__APP_VERSION__}>
        <App version={__APP_VERSION__} />
      </LibraryProvider>
    </PlatformProvider>
  </StrictMode>,
);
