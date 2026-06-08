import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SliceApp } from "./SliceApp";
import "../theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SliceApp />
  </StrictMode>
);
