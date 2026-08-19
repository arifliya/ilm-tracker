import React from "react";

interface SidebarItemProps {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "12px 20px",
      cursor: "pointer",
      background: active ? "#334155" : "transparent",
      color: active ? "#fff" : "#cbd5e1",
      fontWeight: active ? 600 : 400,
      transition: "0.2s",
      borderLeft: active ? "4px solid #3b82f6" : "4px solid transparent"
    }}
  >
    <span style={{ fontSize: 20 }}>{icon}</span>
    <span>{label}</span>
  </div>
);

export default SidebarItem;
