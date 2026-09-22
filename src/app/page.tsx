// Placeholder landing page. This phase built the repo foundation, database
// schema, and the Excel import parser (src/lib/import/*) only — the real
// dashboard, search/filters, import review screen, and bilingual UI are a
// separate follow-up phase (see the plan's §6-8).
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-2xl font-semibold">PLPM Viewer</h1>
      <p className="text-gray-500">Backend foundation in place. Dashboard UI lands in the next phase.</p>
    </main>
  )
}
