import React from "react";
import ReactDOM from "react-dom/client";
import AppRouter from "./AppRouter";
import { AuthProvider } from "./AuthContext";
import "./styles/responsive.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </React.StrictMode>
);
