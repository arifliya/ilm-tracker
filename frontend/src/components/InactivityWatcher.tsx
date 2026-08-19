import React from "react";
import { useInactivityLogout } from "../hooks/useInactivityLogout";

const InactivityWatcher: React.FC = () => {
  useInactivityLogout();
  return null;
};

export default InactivityWatcher;
