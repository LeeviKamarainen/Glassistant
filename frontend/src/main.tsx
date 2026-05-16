import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import "./styles.css";

const Mirror = lazy(() => import("./routes/mirror"));
const Admin = lazy(() => import("./routes/admin"));

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="p-4 text-white/60">Loading…</div>}>
        <Routes>
          <Route path="/mirror" element={<Mirror />} />
          <Route path="/admin/*" element={<Admin />} />
          <Route path="/" element={<Navigate to="/mirror" replace />} />
          <Route path="*" element={<Navigate to="/mirror" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("root element missing");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
