import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// GitHub Pages has no server-side SPA rewrite. public/404.html stores the
// original deep link here before redirecting to the app root; restore it
// before the router mounts so /app/proposals resolves correctly.
try {
  const redirect = sessionStorage.getItem("bitmoot:redirect");
  if (redirect) {
    sessionStorage.removeItem("bitmoot:redirect");
    window.history.replaceState(null, "", redirect);
  }
} catch {
  /* sessionStorage unavailable — deep links still load the app root */
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
