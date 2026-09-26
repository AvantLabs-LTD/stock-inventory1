/** Browser-only discovery: scores are suggestions, never persisted membership rules. */
export function nameSimilarity(left: string, right: string) {
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim()
  const a = normalize(left), b = normalize(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const grams = (value: string) => { const counts = new Map<string,number>(); for (let i=0;i<value.length-1;i++) counts.set(value.slice(i,i+2),(counts.get(value.slice(i,i+2))||0)+1); return counts }
  const x = grams(a), y = grams(b)
  let shared = 0
  for (const [key,count] of x) shared += Math.min(count,y.get(key)||0)
  return 2 * shared / Math.max(a.length + b.length - 2, 1)
}
export function itemSimilarity(a: {title:string;specification?:string|null}, b: {title:string;specification?:string|null}, compareSpecs: boolean) {
  const names = nameSimilarity(a.title,b.title)
  return compareSpecs ? Math.min(names,nameSimilarity(a.specification||"",b.specification||"")) : names
}
