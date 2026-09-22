// Supabase returns `{ data: null, error }` rather than rejecting, so a failed
// query reads exactly like an empty table. Every server page here follows the
// `data ?? []` pattern, which turned a broken query into a page of zeros — the
// worst possible outcome for a payroll dashboard, because it is
// indistinguishable from a month that genuinely has no data.
//
// `q()` wraps a query so a failure throws instead. Next.js then routes it to
// the dashboard error boundary, which tells the user the page could not load.

interface QueryResult<T> {
  // `T` is inferred from the success branch of Supabase's response union and
  // already includes `null`, so it must not be widened again here — doing so
  // collapses the inference to `never` for `.single()` responses.
  data: T
  error: { message: string; code?: string } | null
}

export async function q<T>(
  builder: PromiseLike<QueryResult<T>>,
  context: string,
): Promise<{ data: T }> {
  const { data, error } = await builder
  if (error) {
    throw new Error(`Could not load ${context}: ${error.message}`)
  }
  return { data }
}

/**
 * Same, but for a lookup that is allowed to find nothing. `.single()` reports
 * a missing row as PGRST116; that is a 404, not a failure, so it comes back as
 * null and the caller decides what to do (usually `notFound()`).
 */
export async function qMaybe<T>(
  builder: PromiseLike<QueryResult<T>>,
  context: string,
): Promise<{ data: T | null }> {
  const { data, error } = await builder
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Could not load ${context}: ${error.message}`)
  }
  return { data: error ? null : data }
}
