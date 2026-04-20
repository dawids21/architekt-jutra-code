import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { MethodsPage } from "./pages/MethodsPage";
import { ProductShippingTab } from "./pages/ProductShippingTab";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MethodsPage />} />
        <Route path="/product" element={<ProductShippingTab />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
