import React from "react";
import { dashboardStyles as styles } from "../styles/dashboardStyles";

export const SORT_OPTIONS = [
  { label: "A → Z", value: "az" },
  { label: "Z → A", value: "za" },
  { label: "Newest", value: "new" },
  { label: "Oldest", value: "old" }
];

interface SearchSortProps {
  search: string;
  onSearch: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
}

const SearchSort: React.FC<SearchSortProps> = ({ search, onSearch, sort, onSort }) => (
  <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
    <input
      placeholder="Search..."
      value={search}
      onChange={e => onSearch(e.target.value)}
      style={styles.input}
    />

    <select value={sort} onChange={e => onSort(e.target.value)} style={styles.input}>
      {SORT_OPTIONS.map(opt => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  </div>
);

export default SearchSort;
