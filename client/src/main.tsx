import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { applyTheme, getStoredTheme } from "./lib/theme";

applyTheme(getStoredTheme());

const rootEl = document.getElementById("root")!;
createRoot(rootEl).render(
  <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden">
    <App />
  </div>,
);
