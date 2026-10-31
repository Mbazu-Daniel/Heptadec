export const dataSourceKeys = {
  list: ["data-sources"] as const,
  preview: (sourceId: string, object: string, query = "") =>
    ["source-preview", sourceId, object, query] as const,
  savedQueries: (sourceId: string) => ["saved-queries", sourceId] as const,
};
