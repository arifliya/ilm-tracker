import React, { useEffect, useState } from "react";
import { api } from "../api";
import { dashboardStyles as styles } from "../styles/dashboardStyles";
import { getErrorMessage } from "../utils/getErrorMessage";
import { formatDate } from "../utils/formatDate";

interface FeePeriod {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface ClassOption {
  id: number;
  class_name: string;
}

interface FeeRow {
  student_id: number;
  student_first_name: string;
  student_surname: string;
  class_name: string | null;
  fee_id: number | null;
  amount: string | null;
  status: "unpaid" | "paid" | "pending_collection" | "failed" | null;
  payment_method: "manual" | "direct_debit" | null;
  failure_reason: string | null;
  paid_at: string | null;
}

// Shared between AdminDashboard and TreasurerDashboard — identical
// functionality for both roles, so it lives here rather than being
// duplicated in each dashboard file.
const FeeTrackingSection: React.FC = () => {
  const [periods, setPeriods] = useState<FeePeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | "">("");
  const [fees, setFees] = useState<FeeRow[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);

  const [loading, setLoading] = useState(true);
  const [feesLoading, setFeesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [newPeriodForm, setNewPeriodForm] = useState({ name: "", start_date: "", end_date: "" });
  const [creatingPeriod, setCreatingPeriod] = useState(false);

  // Keyed by class id — one amount per class, entered fresh each time a
  // period is generated (not a persistent rate). A blank field means "skip
  // this class" rather than "charge 0".
  const [classAmounts, setClassAmounts] = useState<Record<number, string>>({});
  const [generating, setGenerating] = useState(false);

  const [editingFeeId, setEditingFeeId] = useState<number | null>(null);
  const [editingAmount, setEditingAmount] = useState("");

  const loadPeriods = async () => {
    try {
      const res = await api.get("/fees/fee-periods");
      const loaded: FeePeriod[] = res.data.feePeriods || [];
      setPeriods(loaded);
      if (loaded.length > 0) {
        setSelectedPeriodId(prev => (prev === "" ? loaded[0].id : prev));
      }
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load fee periods."));
    } finally {
      setLoading(false);
    }
  };

  const loadFees = async (periodId: number) => {
    setFeesLoading(true);
    try {
      const res = await api.get(`/fees/fee-periods/${periodId}/fees`);
      setFees(res.data.fees || []);
      setError(null);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load fees for this period."));
    } finally {
      setFeesLoading(false);
    }
  };

  const loadClasses = async () => {
    try {
      const res = await api.get("/fees/classes");
      setClasses(res.data.classes || []);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load classes."));
    }
  };

  useEffect(() => {
    loadPeriods();
    loadClasses();
  }, []);

  useEffect(() => {
    if (selectedPeriodId !== "") loadFees(selectedPeriodId);
  }, [selectedPeriodId]);

  const handleCreatePeriod = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingPeriod(true);
    try {
      const res = await api.post("/fees/fee-periods", newPeriodForm);
      setNewPeriodForm({ name: "", start_date: "", end_date: "" });
      setSuccess("Fee period created.");
      await loadPeriods();
      setSelectedPeriodId(res.data.feePeriod.id);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to create fee period."));
    } finally {
      setCreatingPeriod(false);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPeriodId === "") return;

    const amounts: { class_id: number; amount: number }[] = [];
    for (const cls of classes) {
      const raw = classAmounts[cls.id];
      if (raw === undefined || raw.trim() === "") continue;
      const amount = Number(raw);
      if (!Number.isFinite(amount) || amount < 0) {
        setError(`Enter a valid, non-negative amount for ${cls.class_name}, or leave it blank to skip it.`);
        return;
      }
      amounts.push({ class_id: cls.id, amount });
    }
    if (amounts.length === 0) {
      setError("Enter an amount for at least one class.");
      return;
    }

    setGenerating(true);
    try {
      const res = await api.post(`/fees/fee-periods/${selectedPeriodId}/generate`, { amounts });
      setSuccess(
        res.data.submittedForCollection > 0
          ? `Fees applied. ${res.data.submittedForCollection} submitted for direct-debit collection.`
          : "Fees applied for the given classes."
      );
      await loadFees(selectedPeriodId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to generate fees."));
    } finally {
      setGenerating(false);
    }
  };

  const startEditingAmount = (row: FeeRow) => {
    if (!row.fee_id) return;
    setEditingFeeId(row.fee_id);
    setEditingAmount(row.amount || "");
  };

  const saveEditedAmount = async (feeId: number) => {
    const amount = Number(editingAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid, non-negative amount.");
      return;
    }
    try {
      await api.put(`/fees/fees/${feeId}`, { amount });
      setEditingFeeId(null);
      if (selectedPeriodId !== "") await loadFees(selectedPeriodId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to update the amount."));
    }
  };

  const markPaid = async (feeId: number) => {
    try {
      await api.post(`/fees/fees/${feeId}/mark-paid`);
      if (selectedPeriodId !== "") await loadFees(selectedPeriodId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to mark as paid."));
    }
  };

  const markUnpaid = async (feeId: number) => {
    try {
      await api.post(`/fees/fees/${feeId}/mark-unpaid`);
      if (selectedPeriodId !== "") await loadFees(selectedPeriodId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to mark as unpaid."));
    }
  };

  // Stub-provider test harness — calls the same transition logic a real
  // provider's webhook would trigger. See fees.ts's simulate-collection
  // route comment.
  const simulateCollection = async (feeId: number, outcome: "paid" | "failed") => {
    try {
      const failure_reason = outcome === "failed" ? "Simulated failure (insufficient funds)" : undefined;
      await api.post(`/fees/fees/${feeId}/simulate-collection`, { outcome, failure_reason });
      if (selectedPeriodId !== "") await loadFees(selectedPeriodId);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to simulate the provider webhook."));
    }
  };

  useEffect(() => {
    if (!success) return;
    const timer = setTimeout(() => setSuccess(null), 4000);
    return () => clearTimeout(timer);
  }, [success]);

  if (loading) return <p style={styles.text}>Loading fee tracking…</p>;

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

      {/* ---------------------- FEE PERIODS ---------------------- */}
      <div style={styles.card}>
        <h3 style={styles.sectionTitle}>Fee Periods</h3>

        {periods.length === 0 ? (
          <p style={styles.text}>No fee periods yet — create one below.</p>
        ) : (
          <div style={{ marginBottom: 16 }}>
            <label style={styles.label}>Period</label>
            <select
              style={styles.input}
              value={selectedPeriodId}
              onChange={e => setSelectedPeriodId(Number(e.target.value))}
            >
              {periods.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatDate(p.start_date)} – {formatDate(p.end_date)})
                </option>
              ))}
            </select>
          </div>
        )}

        <form onSubmit={handleCreatePeriod} style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <label style={styles.label}>New period name</label>
            <input
              style={styles.input}
              placeholder="e.g. September 2026"
              value={newPeriodForm.name}
              onChange={e => setNewPeriodForm({ ...newPeriodForm, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={styles.label}>Start date</label>
            <input
              style={styles.input}
              type="date"
              value={newPeriodForm.start_date}
              onChange={e => setNewPeriodForm({ ...newPeriodForm, start_date: e.target.value })}
              required
            />
          </div>
          <div>
            <label style={styles.label}>End date</label>
            <input
              style={styles.input}
              type="date"
              value={newPeriodForm.end_date}
              onChange={e => setNewPeriodForm({ ...newPeriodForm, end_date: e.target.value })}
              required
            />
          </div>
          <button type="submit" style={styles.homeBtn} disabled={creatingPeriod}>
            {creatingPeriod ? "Creating…" : "Create Period"}
          </button>
        </form>
      </div>

      {selectedPeriodId !== "" && (
        <>
          {/* ---------------------- GENERATE FEES ---------------------- */}
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Apply a Fee by Class</h3>
            <p style={styles.text}>
              Set an amount per class for the selected period — leave a class blank to skip it. A
              student's fee is the total of every class they're in (most students are in one; a
              student in more than one, e.g. an after-school club, gets both added together).
              Students who already have a fee for this period are left untouched.
            </p>
            {classes.length === 0 ? (
              <p style={styles.text}>No classes found for this school yet.</p>
            ) : (
              <form onSubmit={handleGenerate}>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
                  {classes.map(cls => (
                    <div key={cls.id}>
                      <label style={styles.label}>{cls.class_name} (£)</label>
                      <input
                        style={{ ...styles.input, width: 110 }}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Skip"
                        value={classAmounts[cls.id] ?? ""}
                        onChange={e => setClassAmounts({ ...classAmounts, [cls.id]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
                <button type="submit" style={styles.homeBtn} disabled={generating}>
                  {generating ? "Applying…" : "Apply Fees"}
                </button>
              </form>
            )}
          </div>

          {/* ---------------------- PER-STUDENT FEES ---------------------- */}
          <div style={styles.card}>
            <h3 style={styles.sectionTitle}>Students</h3>
            {feesLoading ? (
              <p style={styles.text}>Loading…</p>
            ) : fees.length === 0 ? (
              <p style={styles.text}>No students found.</p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ ...styles.table, width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left" }}>Student</th>
                      <th style={{ textAlign: "left" }}>Class</th>
                      <th style={{ textAlign: "left" }}>Amount</th>
                      <th style={{ textAlign: "left" }}>Status</th>
                      <th style={{ textAlign: "left" }}>Method</th>
                      <th style={{ textAlign: "left" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fees.map(row => (
                      <tr key={row.student_id}>
                        <td>
                          <strong>{row.student_first_name} {row.student_surname}</strong>
                        </td>
                        <td>{row.class_name || "—"}</td>
                        <td>
                          {row.fee_id === null ? (
                            "—"
                          ) : editingFeeId === row.fee_id ? (
                            <input
                              style={{ ...styles.input, width: 100 }}
                              type="number"
                              min="0"
                              step="0.01"
                              value={editingAmount}
                              onChange={e => setEditingAmount(e.target.value)}
                            />
                          ) : (
                            `£${Number(row.amount).toFixed(2)}`
                          )}
                        </td>
                        <td>
                          {row.status === null ? (
                            <span style={{ color: "#6b7280" }}>Not generated</span>
                          ) : row.status === "paid" ? (
                            <span style={{ color: "#166534", fontWeight: 600 }}>Paid</span>
                          ) : row.status === "pending_collection" ? (
                            <span style={{ color: "#92400e", fontWeight: 600 }}>Awaiting Collection</span>
                          ) : row.status === "failed" ? (
                            <span style={{ color: "#991b1b", fontWeight: 600 }}>
                              Failed
                              {row.failure_reason && (
                                <div style={{ fontWeight: 400, fontSize: 12, color: "#6b7280" }}>{row.failure_reason}</div>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: "#991b1b", fontWeight: 600 }}>Unpaid</span>
                          )}
                        </td>
                        <td>
                          {row.payment_method === "direct_debit" ? "Direct Debit" : row.fee_id !== null ? "Manual" : "—"}
                        </td>
                        <td>
                          {row.fee_id !== null && (
                            <>
                              {editingFeeId === row.fee_id ? (
                                <>
                                  <button style={styles.actionBtn} onClick={() => saveEditedAmount(row.fee_id!)}>
                                    Save
                                  </button>
                                  <button style={styles.secondaryBtn} onClick={() => setEditingFeeId(null)}>
                                    Cancel
                                  </button>
                                </>
                              ) : row.status === "paid" ? (
                                <button style={styles.secondaryBtn} onClick={() => markUnpaid(row.fee_id!)}>
                                  Mark as Unpaid
                                </button>
                              ) : row.status === "pending_collection" ? (
                                <>
                                  <button style={styles.presentBtn} onClick={() => simulateCollection(row.fee_id!, "paid")}>
                                    Simulate: Collected
                                  </button>
                                  <button style={styles.secondaryBtn} onClick={() => simulateCollection(row.fee_id!, "failed")}>
                                    Simulate: Failed
                                  </button>
                                  <button style={styles.secondaryBtn} onClick={() => markPaid(row.fee_id!)}>
                                    Mark as Paid (override)
                                  </button>
                                </>
                              ) : row.status === "failed" ? (
                                <>
                                  <button style={styles.presentBtn} onClick={() => markPaid(row.fee_id!)}>
                                    Mark as Paid (override)
                                  </button>
                                  <button style={styles.secondaryBtn} onClick={() => markUnpaid(row.fee_id!)}>
                                    Reset to Unpaid
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button style={styles.presentBtn} onClick={() => markPaid(row.fee_id!)}>
                                    Mark as Paid
                                  </button>
                                  <button style={styles.secondaryBtn} onClick={() => startEditingAmount(row)}>
                                    Edit Amount
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FeeTrackingSection;
