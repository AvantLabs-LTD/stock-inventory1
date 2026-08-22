export function tokenizeItemSearch(query: string | null | undefined) {
  if (!query?.trim()) return []
  return Array.from(new Set(query.trim().split(/\s+/).map(term => term.trim()).filter(Boolean))).slice(0, 10)
}

export function matchesItemSearch(terms: string[], fields: Array<string | null | undefined>) {
  const searchable = fields.filter((field): field is string => Boolean(field)).map(field => field.toLocaleLowerCase())
  return terms.every(term => searchable.some(field => field.includes(term.toLocaleLowerCase())))
}
