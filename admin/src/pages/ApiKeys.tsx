import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/client.js";

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: () => adminApi.apiKeys.list(),
  });

  const revoke = useMutation({
    mutationFn: (id: number) => adminApi.apiKeys.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-api-keys"] }),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">API Keys</h1>
        <span className="text-gray-400 text-sm">{data?.pagination.total ?? "—"} total</span>
      </div>
      {isLoading && <p className="text-gray-400">Loading...</p>}
      {data && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Name</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Tier</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Requests</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Last Used</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {data.data.map((key) => (
                <tr key={key.id}>
                  <td className="px-4 py-3 text-sm text-white">{key.name ?? `Key #${key.id}`}</td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${
                      key.tier === "enterprise" ? "bg-purple-900 text-purple-300" :
                      key.tier === "pro" ? "bg-blue-900 text-blue-300" :
                      "bg-gray-700 text-gray-300"
                    }`}>
                      {key.tier}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{key.requestCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge text-xs ${key.isActive ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}`}>
                      {key.isActive ? "active" : "revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {key.isActive && (
                      <button
                        onClick={() => revoke.mutate(key.id)}
                        disabled={revoke.isPending}
                        className="text-xs px-3 py-1 bg-red-900 text-red-300 rounded hover:bg-red-800 disabled:opacity-40 transition-colors"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
