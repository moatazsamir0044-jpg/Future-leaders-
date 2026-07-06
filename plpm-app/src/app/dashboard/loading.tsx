export default function DashboardLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-44 bg-gray-200 rounded-lg" />
          <div className="h-4 w-28 bg-gray-100 rounded" />
        </div>
        <div className="h-9 w-56 bg-gray-100 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-gray-100 rounded-xl" />
        ))}
      </div>
      <div className="h-64 bg-gray-100 rounded-xl" />
      <div className="h-80 bg-gray-100 rounded-xl" />
    </div>
  )
}
