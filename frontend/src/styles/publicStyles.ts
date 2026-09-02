import { CSSProperties } from "react";

export const publicStyles: Record<string, CSSProperties> = {
  /* ------------------ PAGE LAYOUT ------------------ */

  page: {
    padding: 20,
    background: "#f5f7fa",
    minHeight: "100vh"
  },

  pageCentered: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    background: "#f5f7fa"
  },

  /* ------------------ CARD ------------------ */

  card: {
    width: "100%",
    maxWidth: "460px",
    background: "#fff",
    padding: "32px",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
    textAlign: "center",
    marginBottom: 20
  },

  /* ------------------ TYPOGRAPHY ------------------ */

  title: {
    fontSize: "28px",
    fontWeight: 700,
    marginBottom: "10px",
    color: "#222"
  },

  subtitle: {
    fontSize: "16px",
    color: "#555",
    marginBottom: "30px",
    lineHeight: 1.4
  },

  text: {
    fontSize: 16,
    color: "#444",
    lineHeight: 1.5,
    marginBottom: 12
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 12
  },

  /* ------------------ BUTTONS ------------------ */

  actionBtn: {
    background: "#2563eb",
    color: "#fff",
    padding: "12px 16px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "16px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    textAlign: "center"
  },

  secondaryBtn: {
    background: "#e5e7eb",
    color: "#111",
    padding: "12px 16px",
    borderRadius: "8px",
    textDecoration: "none",
    fontSize: "16px",
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    textAlign: "center"
  },

  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "12px"
  },

  /* ------------------ INPUTS ------------------ */

  input: {
    padding: 10,
    borderRadius: 8,
    border: "1px solid #ccc",
    fontSize: 14,
    width: "100%",
    marginTop: 4
  },

  label: {
    display: "block",
    fontWeight: 600,
    color: "#334155",
    marginTop: 8
  },

  errorText: {
    color: "#dc2626",
    fontSize: 13,
    marginTop: 4,
    marginBottom: 8
  },

  form: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
    marginTop: 10
  },

  /* ------------------ HEADER ROW ------------------ */

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20
  },

  homeBtn: {
    marginRight: 10,
    padding: "8px 14px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  logoutBtn: {
    padding: "8px 14px",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  /* ------------------ LISTS ------------------ */

  list: {
    listStyle: "none",
    padding: 0,
    margin: 0
  },

  listItem: {
    padding: 12,
    borderBottom: "1px solid #e5e7eb"
  }

}
