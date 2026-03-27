import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/client.js";

function CompletenessBar({ label, pct }: { label: string; pct: number }) {
  const color =
    pct >= 90 ? "bg-green-500" : pct >= 70 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 text-xs text-gray-400 shrink-0">{label}</div>
      <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <div
        className={`text-xs font-mono w-10 text-right shrink-0 ${
          pct >= 90 ? "text-green-400" : pct >= 70 ? "text-yellow-400" : "text-red-400"
        }`}
      >
        {pct}%
      </div>
    </div>
  );
}

function SiloCard({
  title,
  icon,
  total,
  stale30d,
  stale90d,
  inactive,
  completeness,
}: {
  title: string;
  icon: string;
  total: number;
  stale30d: number;
  stale90d?: number;
  inactive?: number;
  completeness: Record<string, number>;
}) {
  const overallScore = Math.round(
    Object.values(completeness).reduce((a, b) => a + b, 0) / Object.keys(completeness).length,
  );

  const FIELD_LABELS: Record<string, string> = {
    title: "Title",
    titleEn: "Title (EN)",
    description: "Description",
    bodyEn: "Body (EN)",
    fieldOfStudy: "Field of study",
    tuitionFee: "Tuition fee",
    language: "Language",
    sourceUrl: "Source URL",
    name: "Name",
    city: "City",
    website: "Website",
    geocoords: "Geo-coordinates",
  };

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <h2 className="text-base font-semibold text-white">{title}</h2>
        </div>
        <div className="text-right">
          <div
            className={`text-2xl font-bold ${
              overallScore >= 90 ? "text-green-400" : overallScore >= 70 ? "text-yellow-400" : "text-red-400"
            }`}
          >
            {overallScore}%
          </div>
          <div className="text-xs text-gray-500">completeness</div>
        </div>
      </div>

      {/* Alerts */}
      <div className="flex gap-2 flex-wrap mb-5">
        <span className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded-full">
          {total.toLocaleString()} total
        </span>
        {stale30d > 0 && (
          <span className="text-xs px-2 py-1 bg-yellow-900/60 text-yellow-300 rounded-full">
            {stale30d.toLocaleString()} stale &gt;30d
          </span>
        )}
        {stale90d != null && stale90d > 0 && (
          <span className="text-xs px-2 py-1 bg-red-900/60 text-red-300 rounded-full">
            {stale90d.toLocaleString()} stale &gt;90d
          </span>
        )}
        {inactive != null && inactive > 0 && (
          <span className="text-xs px-2 py-1 bg-gray-600 text-gray-400 rounded-full">
            {inactive.toLocaleString()} inactive
          </span>
        )}
      </div>

      {/* Field completeness bars */}
      <div className="space-y-2.5">
        {Object.entries(completeness).map(([key, pct]) => (
          <CompletenessBar key={key} label={FIELD_LABELS[key] ?? key} pct={pct} />
        ))}
      </div>
    </div>
  );
}

export default function DataQualityPage() {
  const { data, isLoading, isError, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ["admin-data-quality"],
    queryFn: () => adminApi.dataQuality.get(),
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Quality</h1>
          {data && (
            <p className="text-xs text-gray-500 mt-1">
              Generated at {new Date(data.meta.generatedAt).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs px-3 py-1.5 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 disabled:opacity-40 transition-colors"
        >
          {isFetching ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {isLoading && <p className="text-gray-400">Computing quality report…</p>}
      {isError && <p className="text-red-400">Failed to load data quality report.</p>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SiloCard
            title="Study Programs"
            icon="🎓"
            total={data.data.programs.total}
            stale30d={data.data.programs.stale30d}
            stale90d={data.data.programs.stale90d}
            inactive={data.data.programs.inactive}
            completeness={data.data.programs.completeness}
          />
          <SiloCard
            title="Institutions"
            icon="🏛️"
            total={data.data.institutions.total}
            stale30d={data.data.institutions.stale30d}
            completeness={data.data.institutions.completeness}
          />
          <SiloCard
            title="Regulations"
            icon="📋"
            total={data.data.regulations.total}
            stale30d={data.data.regulations.stale30d}
            completeness={data.data.regulations.completeness}
          />
        </div>
      )}

      {!isLoading && !data && (
        <p className="text-gray-500 text-sm">No data available.</p>
      )}
    </div>
  );
}
