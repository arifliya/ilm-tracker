export const sortData = <T extends Record<string, any>>(
  data: T[],
  key: string,
  mode: string
): T[] => {
  const sorted = [...data];

  if (mode === "az") {
    sorted.sort((a, b) => ((a?.[key] as string) || "").localeCompare((b?.[key] as string) || ""));
  }

  if (mode === "za") {
    sorted.sort((a, b) => ((b?.[key] as string) || "").localeCompare((a?.[key] as string) || ""));
  }

  if (mode === "new" || mode === "old") {
    const hasNumericId = sorted.length > 0 && typeof sorted[0]?.id === "number";

    if (hasNumericId) {
      // Higher id = created more recently, regardless of the order the
      // API happened to return rows in.
      sorted.sort((a, b) => (mode === "new" ? b.id - a.id : a.id - b.id));
    } else if (mode === "new") {
      sorted.reverse();
    }
    // "old" with no id field: no reliable signal to sort by, so leave
    // the API's natural order as-is rather than guessing.
  }

  return sorted;
};

export const paginate = <T,>(data: T[], page: number, pageSize: number): T[] =>
  data.slice(page * pageSize, page * pageSize + pageSize);
