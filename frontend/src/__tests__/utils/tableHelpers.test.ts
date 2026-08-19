import { describe, it, expect } from "vitest";
import { sortData, paginate } from "../../utils/tableHelpers";

describe("sortData", () => {
  const data = [
    { id: 1, name: "Charlie" },
    { id: 2, name: "alice" },
    { id: 3, name: "Bob" }
  ];

  it("sorts A-Z case-insensitively", () => {
    const sorted = sortData(data, "name", "az");
    expect(sorted.map(d => d.name)).toEqual(["alice", "Bob", "Charlie"]);
  });

  it("sorts Z-A case-insensitively", () => {
    const sorted = sortData(data, "name", "za");
    expect(sorted.map(d => d.name)).toEqual(["Charlie", "Bob", "alice"]);
  });

  it("sorts newest-first by numeric id when present", () => {
    const sorted = sortData(data, "name", "new");
    expect(sorted.map(d => d.id)).toEqual([3, 2, 1]);
  });

  it("sorts oldest-first by numeric id when present", () => {
    const sorted = sortData(data, "name", "old");
    expect(sorted.map(d => d.id)).toEqual([1, 2, 3]);
  });

  it("falls back to reversing natural order for 'new' when there's no numeric id", () => {
    const noId = [{ name: "a" }, { name: "b" }, { name: "c" }];
    const sorted = sortData(noId, "name", "new");
    expect(sorted.map(d => d.name)).toEqual(["c", "b", "a"]);
  });

  it("leaves natural order unchanged for 'old' when there's no numeric id", () => {
    const noId = [{ name: "a" }, { name: "b" }, { name: "c" }];
    const sorted = sortData(noId, "name", "old");
    expect(sorted.map(d => d.name)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the original array", () => {
    const original = [...data];
    sortData(data, "name", "az");
    expect(data).toEqual(original);
  });

  it("treats missing/unknown mode as a no-op", () => {
    const sorted = sortData(data, "name", "unknown");
    expect(sorted).toEqual(data);
  });
});

describe("paginate", () => {
  const data = [1, 2, 3, 4, 5, 6, 7];

  it("returns the first page", () => {
    expect(paginate(data, 0, 3)).toEqual([1, 2, 3]);
  });

  it("returns a middle page", () => {
    expect(paginate(data, 1, 3)).toEqual([4, 5, 6]);
  });

  it("returns a partial final page", () => {
    expect(paginate(data, 2, 3)).toEqual([7]);
  });

  it("returns an empty array past the end", () => {
    expect(paginate(data, 5, 3)).toEqual([]);
  });
});
