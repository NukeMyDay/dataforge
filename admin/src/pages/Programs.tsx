import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/api/client.js";

export default function ProgramsPage() {
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-programs", appliedQ, page],
    queryFn: () => adminApi.programs.list({ q: appliedQ, page }),
  });

  const programs = data?.data as Array<Record<string, unknown>> | undefined;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Study Programs</h1>
        <span className="text-gray-400 text-sm">{data?.pagination.total.toLocaleString() ?? "—"} total</span>
      </div>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); setAppliedQ(q); }}}
          placeholder="Search programs..."
          className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={() => { setPage(1); setAppliedQ(q); }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Search
        </button>
      </div>

      {isLoading && <p className="text-gray-400">Loading...</p>}
      {programs && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Program</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Degree</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Country</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Language</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {programs.map((p) => (
                <tr key={String(p.id)}>
                  <td className="px-4 py-3">
                    <div className="text-sm text-white truncate max-w-xs">
                      {String(p.titleEn ?? p.titleNl ?? p.titleDe ?? "—")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300 capitalize">{String(p.degreeType ?? "—")}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{String(p.country ?? "—")}</td>
                  <td className="px-4 py-3 text-sm text-gray-300">{String(p.language ?? "—")}</td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${p.isActive ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                      {p.isActive ? "active" : "inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-600"
          >
            Previous
          </button>
          <span className="text-sm text-gray-400">Page {page} of {Math.ceil(data.pagination.total / data.pagination.pageSize)}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={page * data.pagination.pageSize >= data.pagination.total}
            className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-600"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
