import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { adminApi } from "@/api/client.js";
import type { RecentRun } from "@/api/client.js";

const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-green-900 text-green-300",
  failed: "bg-red-900 text-red-300",
  running: "bg-blue-900 text-blue-300",
  idle: "bg-gray-700 text-gray-400",
};

function StatCard({ label, value, icon }: { label: string; value: string | number; icon: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-gray-400 text-sm">{label}</span>
        <span className="text-2xl">{icon}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  );
}

function RunRow({ run }: { run: RecentRun }) {
  const started = run.startedAt ? new Date(run.startedAt).toLocaleString() : "—";
  return (
    <tr className="border-b border-gray-700 last:border-0">
      <td className="py-2 pr-4 text-sm text-white font-medium">{run.pipelineName}</td>
      <td className="py-2 pr-4">
        <span className={`badge text-xs ${STATUS_COLORS[run.status] ?? STATUS_COLORS.idle}`}>
          {run.status}
        </span>
      </td>
      <td className="py-2 pr-4 text-xs text-gray-400">{started}</td>
      <td className="py-2 text-xs text-gray-400">
        {run.recordsProcessed != null ? `${run.recordsProcessed} records` : "—"}
      </td>
    </tr>
  );
}

export default function OverviewPage() {
  const { data: programs } = useQuery({
    queryKey: ["admin-programs-count"],
    queryFn: () => adminApi.programs.list({ page: 1 }),
  });
  const { data: institutions } = useQuery({
    queryKey: ["admin-institutions-count"],
    queryFn: () => adminApi.institutions.list({ page: 1 }),
  });
  const { data: regulations } = useQuery({
    queryKey: ["admin-regulations-count"],
    queryFn: () => adminApi.regulations.list({ page: 1 }),
  });
  const { data: pipelines } = useQuery({
    queryKey: ["admin-pipelines"],
    queryFn: () => adminApi.pipelines.list(),
  });
  const { data: users } = useQuery({
    queryKey: ["admin-users-count"],
    queryFn: () => adminApi.users.list(),
  });
  const { data: recentRuns } = useQuery({
    queryKey: ["admin-recent-runs"],
    queryFn: () => adminApi.runs.recent(10),
    refetchInterval: 30_000,
  });
  const { data: apiKeys } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: () => adminApi.apiKeys.list(),
  });

  const pipelineCount = pipelines?.meta.total ?? pipelines?.data.length ?? "—";
  const runSummary = recentRuns?.meta.summary ?? {};
  const failedCount = runSummary["failed"] ?? 0;
  const runningCount = runSummary["running"] ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Overview</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        <StatCard
          label="Study Programs"
          value={programs?.pagination.total.toLocaleString() ?? "—"}
          icon="🎓"
        />
        <StatCard
          label="Institutions"
          value={institutions?.pagination.total.toLocaleString() ?? "—"}
          icon="🏛️"
        />
        <StatCard
          label="Regulations"
          value={regulations?.pagination.total.toLocaleString() ?? "—"}
          icon="📋"
        />
        <StatCard label="Pipelines" value={pipelineCount} icon="⚙️" />
        <StatCard
          label="Users"
          value={users?.meta.total.toLocaleString() ?? "—"}
          icon="👤"
        />
      </div>

      {/* Run health summary */}
      {recentRuns && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <div>
              <div className="text-xs text-gray-400">Succeeded</div>
              <div className="text-xl font-bold text-white">{runSummary["succeeded"] ?? 0}</div>
            </div>
          </div>
          <div className={`bg-gray-800 border rounded-xl p-4 flex items-center gap-3 ${failedCount > 0 ? "border-red-700" : "border-gray-700"}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${failedCount > 0 ? "bg-red-400" : "bg-gray-500"}`} />
            <div>
              <div className="text-xs text-gray-400">Failed</div>
              <div className={`text-xl font-bold ${failedCount > 0 ? "text-red-400" : "text-white"}`}>{failedCount}</div>
            </div>
          </div>
          <div className={`bg-gray-800 border rounded-xl p-4 flex items-center gap-3 ${runningCount > 0 ? "border-blue-700" : "border-gray-700"}`}>
            <div className={`w-2.5 h-2.5 rounded-full ${runningCount > 0 ? "bg-blue-400 animate-pulse" : "bg-gray-500"}`} />
            <div>
              <div className="text-xs text-gray-400">Running</div>
              <div className={`text-xl font-bold ${runningCount > 0 ? "text-blue-400" : "text-white"}`}>{runningCount}</div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent pipeline runs */}
        {recentRuns && recentRuns.data.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Recent Runs</h2>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700 text-left">
                  <th className="pb-2 text-xs text-gray-400 font-medium">Pipeline</th>
                  <th className="pb-2 text-xs text-gray-400 font-medium">Status</th>
                  <th className="pb-2 text-xs text-gray-400 font-medium">Started</th>
                  <th className="pb-2 text-xs text-gray-400 font-medium">Records</th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.data.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pipeline health */}
        {pipelines && pipelines.data.length > 0 && (
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <h2 className="text-lg font-semibold text-white mb-4">Pipeline Health</h2>
            <div className="space-y-3">
              {pipelines.data.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-700 last:border-0">
                  <div>
                    <div className="text-sm font-medium text-white">{p.name}</div>
                    {p.lastRun?.startedAt && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        Last: {new Date(p.lastRun.startedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.schedule && (
                      <span className="text-xs text-gray-500 font-mono">{p.schedule}</span>
                    )}
                    {p.lastRun ? (
                      <span className={`badge text-xs ${STATUS_COLORS[p.lastRun.status] ?? STATUS_COLORS.idle}`}>
                        {p.lastRun.status}
                      </span>
                    ) : (
                      <span className="badge text-xs bg-gray-700 text-gray-400">no runs</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* API key usage charts */}
      {apiKeys && apiKeys.data.length > 0 && (() => {
        const topKeys = [...apiKeys.data]
          .filter((k) => k.requestCount > 0)
          .sort((a, b) => b.requestCount - a.requestCount)
          .slice(0, 10)
          .map((k) => ({
            name: k.name ?? `key-${k.id}`,
            requests: k.requestCount,
            tier: k.tier,
          }));

        const tierCounts = apiKeys.data.reduce<Record<string, number>>((acc, k) => {
          acc[k.tier] = (acc[k.tier] ?? 0) + 1;
          return acc;
        }, {});
        const tierData = Object.entries(tierCounts).map(([tier, count]) => ({ tier, count }));

        const TIER_COLORS: Record<string, string> = {
          free: "#6b7280",
          pro: "#2563eb",
          enterprise: "#7c3aed",
        };

        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            {topKeys.length > 0 && (
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
                <h2 className="text-lg font-semibold text-white mb-4">Top API Keys by Requests</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={topKeys} margin={{ top: 4, right: 4, bottom: 24, left: 0 }}>
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                      angle={-35}
                      textAnchor="end"
                      interval={0}
                    />
                    <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      labelStyle={{ color: "#f3f4f6" }}
                      itemStyle={{ color: "#93c5fd" }}
                    />
                    <Bar dataKey="requests" radius={[4, 4, 0, 0]}>
                      {topKeys.map((entry, i) => (
                        <Cell key={i} fill={TIER_COLORS[entry.tier] ?? "#4b5563"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
              <h2 className="text-lg font-semibold text-white mb-4">API Keys by Tier</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tierData} margin={{ top: 4, right: 4, bottom: 8, left: 0 }}>
                  <XAxis dataKey="tier" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#f3f4f6" }}
                    itemStyle={{ color: "#93c5fd" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {tierData.map((entry, i) => (
                      <Cell key={i} fill={TIER_COLORS[entry.tier] ?? "#4b5563"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
