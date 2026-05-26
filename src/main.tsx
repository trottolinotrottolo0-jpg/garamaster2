import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GaraMasterProvider } from "./context/GaraMasterContext";
import { AppGate } from "./AppGate";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <GaraMasterProvider>
      <AppGate />
    </GaraMasterProvider>
  </StrictMode>
);
