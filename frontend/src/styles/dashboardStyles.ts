// Global shared dashboard styles

export const dashboardStyles: Record<string, React.CSSProperties> = {
  page: {
    padding: 20,
    background: "#f3f4f6",
    minHeight: "100vh"
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 20
  },

  title: {
    fontSize: 26,
    fontWeight: 700
  },
   
  pageTitle: {
    fontSize: 26,
    fontWeight: 700,
    textAlign: "center"
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

  card: {
    background: "#fff",
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)"
  },

  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 12
  },

  list: {
    listStyle: "none",
    padding: 0,
    margin: 0
  },

  listItem: {
    padding: 12,
    borderBottom: "1px solid #e5e7eb"
  },

  actionBtn: {
    marginTop: 8,
    marginRight: 8,
    padding: "6px 12px",
    background: "#4b5563",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  presentBtn: {
    marginTop: 8,
    marginRight: 8,
    padding: "6px 12px",
    background: "#16a34a",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  absentBtn: {
    marginTop: 8,
    padding: "6px 12px",
    background: "#dc2626",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer"
  },

  text: {
    marginBottom: 12,
    fontSize: 16,
    lineHeight: 1.5
  },
      navbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 20px",
    background: "#fff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
    marginBottom: 20,
    borderRadius: 10
  },

  navLeft: {
    fontSize: 28,
    cursor: "pointer"
  },

  navTitle: {
    fontSize: 22,
    fontWeight: 700,
    textAlign: "center",
    flex: 1
  },

  navRight: {
    display: "flex",
    alignItems: "center",
    gap: 12
  },

  navUser: {
    fontSize: 16,
    fontWeight: 600
  },

  input: {
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid #cbd5e1",
    fontSize: 14,
    width: "100%"
  },

  label: {
    display: "block",
    fontWeight: 600,
    color: "#334155",
    marginBottom: 4
  },

  secondaryBtn: {
    padding: "6px 12px",
    background: "#e5e7eb",
    color: "#111",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 14
  },

  table: {
    borderCollapse: "collapse",
    fontSize: 14
  }
};
