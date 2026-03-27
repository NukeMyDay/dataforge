import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, UserRecord } from "@/api/client.js";

const TIER_COLORS: Record<string, string> = {
  free: "bg-gray-700 text-gray-300",
  pro: "bg-blue-900 text-blue-300",
  enterprise: "bg-purple-900 text-purple-300",
};

const TIERS = ["free", "pro", "enterprise"] as const;

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-users", query],
    queryFn: () => adminApi.users.list(query ? { q: query } : undefined),
  });

  const updateUser = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: { tier?: string; isActive?: boolean } }) =>
      adminApi.users.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setQuery(search.trim());
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Users</h1>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 max-w-sm bg-gray-800 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 placeholder-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          className="px-4 py-2 text-sm bg-blue-700 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Search
        </button>
        {query && (
          <button
            type="button"
            onClick={() => { setSearch(""); setQuery(""); }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {isLoading && <p className="text-gray-400">Loading…</p>}

      {data && (
        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Email</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Tier</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">API Keys</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Created</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {data.data.map((user: UserRecord) => (
                <tr key={user.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3 text-sm text-white">{user.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={user.tier}
                      onChange={(e) =>
                        updateUser.mutate({ id: user.id, patch: { tier: e.target.value } })
                      }
                      className={`text-xs font-medium rounded px-2 py-1 border-0 cursor-pointer ${TIER_COLORS[user.tier] ?? "bg-gray-700 text-gray-300"}`}
                    >
                      {TIERS.map((t) => (
                        <option key={t} value={t} className="bg-gray-800 text-white">
                          {t}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-400">{user.apiKeyCount}</td>
                  <td className="px-4 py-3 text-xs text-gray-400">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`badge text-xs ${
                        user.isActive
                          ? "bg-green-900 text-green-300"
                          : "bg-red-900 text-red-300"
                      }`}
                    >
                      {user.isActive ? "active" : "blocked"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() =>
                        updateUser.mutate({ id: user.id, patch: { isActive: !user.isActive } })
                      }
                      disabled={updateUser.isPending}
                      className={`text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                        user.isActive
                          ? "bg-red-800 text-red-200 hover:bg-red-700"
                          : "bg-green-800 text-green-200 hover:bg-green-700"
                      }`}
                    >
                      {user.isActive ? "Block" : "Unblock"}
                    </button>
                  </td>
                </tr>
              ))}
              {data.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500">
            {data.meta.total} user{data.meta.total !== 1 ? "s" : ""}
          </div>
        </div>
      )}
    </div>
  );
}
