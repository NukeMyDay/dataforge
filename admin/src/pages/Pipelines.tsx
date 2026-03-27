import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/client.js";
import type { PipelineRun } from "@/api/client.js";

const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-green-900 text-green-300",
  failed: "bg-red-900 text-red-300",
  running: "bg-blue-900 text-blue-300",
  idle: "bg-gray-700 text-gray-400",
};

function RunHistoryPanel({ pipelineId }: { pipelineId: number }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline-runs", pipelineId, page],
    queryFn: () => adminApi.pipelines.runs(pipelineId, page),
  });

  if (isLoading) return <p className="text-gray-500 text-xs p-3">Loading run history…</p>;
  if (!data || data.data.length === 0)
    return <p className="text-gray-500 text-xs p-3">No runs recorded.</p>;

  const { data: runs, meta } = data;
  const totalPages = Math.ceil(meta.total / meta.pageSize);

  return (
    <div className="bg-gray-900 border-t border-gray-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left border-b border-gray-700">
            <th className="px-6 py-2 text-gray-500 font-medium">Run ID</th>
            <th className="px-4 py-2 text-gray-500 font-medium">Status</th>
            <th className="px-4 py-2 text-gray-500 font-medium">Started</th>
            <th className="px-4 py-2 text-gray-500 font-medium">Finished</th>
            <th className="px-4 py-2 text-gray-500 font-medium">Records</th>
            <th className="px-4 py-2 text-gray-500 font-medium">Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {runs.map((run: PipelineRun) => (
            <tr key={run.id} className="hover:bg-gray-800/50">
              <td className="px-6 py-2 text-gray-400 font-mono">#{run.id}</td>
              <td className="px-4 py-2">
                <span className={`badge text-xs ${STATUS_COLORS[run.status] ?? STATUS_COLORS.idle}`}>
                  {run.status}
                </span>
              </td>
              <td className="px-4 py-2 text-gray-400">
                {run.startedAt ? new Date(run.startedAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-gray-400">
                {run.finishedAt ? new Date(run.finishedAt).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-gray-400">{run.recordsProcessed ?? "—"}</td>
              <td className="px-4 py-2 text-red-400 max-w-xs truncate" title={run.errorMessage ?? ""}>
                {run.errorMessage ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {totalPages > 1 && (
        <div className="flex items-center gap-2 px-6 py-2 border-t border-gray-800">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="text-xs px-2 py-1 bg-gray-700 rounded disabled:opacity-40 text-gray-300 hover:bg-gray-600"
          >
            ← Prev
          </button>
          <span className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="text-xs px-2 py-1 bg-gray-700 rounded disabled:opacity-40 text-gray-300 hover:bg-gray-600"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

export default function PipelinesPage() {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ["admin-pipelines"],
    queryFn: () => adminApi.pipelines.list(),
  });

  const trigger = useMutation({
    mutationFn: (id: number) => adminApi.pipelines.trigger(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-pipelines"] }),
  });

  function toggleExpanded(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Pipelines</h1>
      {isLoading && <p className="text-gray-400">Loading...</p>}
      {data && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase w-8" />
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Pipeline</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Schedule</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Last Run</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.data.map((p) => (
                <>
                  <tr
                    key={p.id}
                    className="border-b border-gray-700 hover:bg-gray-750 cursor-pointer"
                    onClick={() => toggleExpanded(p.id)}
                  >
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {expanded.has(p.id) ? "▼" : "▶"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium text-white">{p.name}</div>
                      {p.description && <div className="text-xs text-gray-400 mt-0.5">{p.description}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 font-mono">{p.schedule ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {p.lastRun?.startedAt
                        ? new Date(p.lastRun.startedAt).toLocaleString()
                        : "Never"}
                      {p.lastRun?.recordsProcessed != null && (
                        <div className="text-gray-500">{p.lastRun.recordsProcessed} records</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {p.lastRun ? (
                        <span className={`badge text-xs ${STATUS_COLORS[p.lastRun.status] ?? STATUS_COLORS.idle}`}>
                          {p.lastRun.status}
                        </span>
                      ) : (
                        <span className="badge text-xs bg-gray-700 text-gray-400">no runs</span>
                      )}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => trigger.mutate(p.id)}
                        disabled={trigger.isPending || p.lastRun?.status === "running"}
                        className="text-xs px-3 py-1.5 bg-blue-700 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 transition-colors"
                      >
                        Trigger
                      </button>
                    </td>
                  </tr>
                  {expanded.has(p.id) && (
                    <tr key={`${p.id}-history`}>
                      <td colSpan={6} className="p-0">
                        <RunHistoryPanel pipelineId={p.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
