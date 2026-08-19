import React, { useCallback, useRef, useState } from "react";

interface ConfirmState {
  message: string;
  resolve: (value: boolean) => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000
};

const boxStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 10,
  padding: 24,
  width: "90%",
  maxWidth: 380,
  boxShadow: "0 10px 30px rgba(0,0,0,0.2)"
};

const messageStyle: React.CSSProperties = {
  fontSize: 16,
  color: "#1e293b",
  marginBottom: 20,
  lineHeight: 1.5
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#e5e7eb",
  color: "#111",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14
};

const confirmBtnStyle: React.CSSProperties = {
  padding: "8px 16px",
  background: "#dc2626",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14
};

/**
 * In-app replacement for window.confirm(). Renders a modal instead of the
 * browser-native dialog. Usage:
 *
 *   const { confirm, ConfirmDialog } = useConfirm();
 *   if (!(await confirm("Remove this student?"))) return;
 *   ...
 *   return <>{ConfirmDialog}<rest of component/></>;
 */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setState({ message, resolve });
    });
  }, []);

  const handleChoice = (value: boolean) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  };

  const ConfirmDialog = state ? (
    <div style={overlayStyle} onClick={() => handleChoice(false)}>
      <div style={boxStyle} onClick={(e) => e.stopPropagation()}>
        <div style={messageStyle}>{state.message}</div>
        <div style={actionsStyle}>
          <button style={cancelBtnStyle} onClick={() => handleChoice(false)}>
            Cancel
          </button>
          <button style={confirmBtnStyle} onClick={() => handleChoice(true)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, ConfirmDialog };
}
