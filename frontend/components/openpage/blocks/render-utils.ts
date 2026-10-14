export function filterHiddenItems(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .filter((item) => {
        if (!item || typeof item !== "object") return true;
        const record = item as Record<string, unknown>;
        return !(typeof record._id === "string" && record.hidden === true);
      })
      .map(filterHiddenItems);
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, filterHiddenItems(nested)]),
  );
}
