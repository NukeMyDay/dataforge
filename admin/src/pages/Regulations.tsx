import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/client.js";

export default function RegulationsPage() {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-regulations", appliedQ, page],
    queryFn: () => adminApi.regulations.list({ q: appliedQ, page }),
  });

  const regulations = data?.data as Array<Record<string, unknown>> | undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Regulations</h1>
        <span className="text-gray-400 text-sm">{data?.pagination.total.toLocaleString() ?? "—"} total</span>
      </div>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setAppliedQ(q); }}}
          placeholder="Search regulations..."
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={() => { setPage(1); setAppliedQ(q); }} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          Search
        </button>
      </div>
      {isLoading && <p className="text-gray-400">Loading...</p>}
      {regulations && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Title</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Category</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Jurisdiction</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {regulations.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-3 text-sm text-white">{String(r.titleEn ?? r.titleDe ?? "—")}</td>
                  <td className="px-4 py-3 text-sm text-gray-300 capitalize">{String(r.category ?? "—")}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{String(r.jurisdiction ?? "—")}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">v{String(r.version ?? 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
