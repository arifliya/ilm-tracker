import React from "react";
import { dashboardStyles as styles } from "../styles/dashboardStyles";

interface PaginationProps {
  page: number;
  setPage: (n: number) => void;
  total: number;
  pageSize: number;
}

const Pagination: React.FC<PaginationProps> = ({ page, setPage, total, pageSize }) => {
  const maxPage = Math.max(Math.ceil(total / pageSize) - 1, 0);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 16,
        alignItems: "center"
      }}
    >
      <button disabled={page === 0} onClick={() => setPage(page - 1)} style={styles.actionBtn}>
        Previous
      </button>

      <span style={{ fontSize: 14, color: "#475569" }}>
        Page {maxPage === 0 ? 1 : page + 1} of {maxPage + 1}
      </span>

      <button disabled={page >= maxPage} onClick={() => setPage(page + 1)} style={styles.actionBtn}>
        Next
      </button>
    </div>
  );
};

export default Pagination;
