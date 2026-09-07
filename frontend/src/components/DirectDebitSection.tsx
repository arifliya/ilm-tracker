import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";

interface Mandate {
  status: "pending" | "active" | "cancelled";
  created_at: string;
  cancelled_at: string | null;
}

// Parent-facing self-serve mandate setup, behind "direct_debit". Setting
// this up doesn't collect any bank/card details in this app — it's a stub
// provider today (see backend/src/utils/directDebitProvider.ts) — and it's
// a one-off action, not per-fee: once active, any fee generated afterwards
// for this parent's child is submitted for collection automatically.
const DirectDebitSection: React.FC = () => {
  const [mandate, setMandate] = useState<Mandate | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = async () => {
    try {
      const res = await api.get("/parent/direct-debit/mandate");
      setMandate(res.data.mandate || null);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load direct debit status."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  const setUp = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.post("/parent/direct-debit/mandate");
      setSuccess("Direct debit set up. Fees generated from now on will be collected automatically.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to set up direct debit."));
    } finally {
      setWorking(false);
    }
  };

  const cancel = async () => {
    setWorking(true);
    setError(null);
    try {
      await api.post("/parent/direct-debit/mandate/cancel");
      setSuccess("Direct debit cancelled. Future fees will go back to manual payment.");
      await load();
    } catch (err) {
      setError(getErrorMessage(err, "Failed to cancel direct debit."));
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <p style={styles.text}>Loading…</p>;

  const isActive = mandate?.status === "active";

  return (
    <div>
      {error && (
        <div style={{ background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 14 }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: "#dcfce7", color: "#166534", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 20, fontSize: 14 }}>
          {success}
        </div>
      )}

      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Direct Debit</h3>
        <p style={styles.text}>
          Set this up once and any fee the school generates for your child afterwards is collected
          automatically — no need to pay each one manually. This doesn't collect any bank or card
          details through this app.
        </p>

        <div style={{ marginTop: 12, marginBottom: 16 }}>
          {isActive ? (
            <span style={{ color: "#166534", fontWeight: 600 }}>Active</span>
          ) : mandate?.status === "cancelled" ? (
            <span style={{ color: "#6b7280", fontWeight: 600 }}>Cancelled</span>
          ) : (
            <span style={{ color: "#6b7280", fontWeight: 600 }}>Not set up</span>
          )}
        </div>

        {isActive ? (
          <button style={styles.secondaryBtn} onClick={cancel} disabled={working}>
            {working ? "Cancelling…" : "Cancel Direct Debit"}
          </button>
        ) : (
          <button style={styles.homeBtn} onClick={setUp} disabled={working}>
            {working ? "Setting up…" : mandate?.status === "cancelled" ? "Set Up Direct Debit Again" : "Set Up Direct Debit"}
          </button>
        )}
      </div>
    </div>
  );
};

export default DirectDebitSection;
