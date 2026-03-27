import { useState, useEffect, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth.js";

interface Me {
  id: number;
  email: string;
  tier: "free" | "pro" | "enterprise";
  createdAt: string;
}

interface ApiKey {
  id: number;
  name: string | null;
  tier: string;
  requestCount: number;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  isActive: boolean;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const TIER_LIMITS: Record<string, string> = {
  free: "100 req/day",
  pro: "10,000 req/day",
  enterprise: "Unlimited",
};

export default function DashboardPage() {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  // Redirect if not logged in
  useEffect(() => {
    if (!token) navigate("/login", { state: { from: "/dashboard" }, replace: true });
  }, [token, navigate]);

  const { data: meData } = useQuery<{ data: Me }>({
    queryKey: ["me", token],
    queryFn: () =>
      fetch(`${apiBase}/v1/auth/me`, { headers: authHeaders(token!) }).then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      }),
    enabled: !!token,
  });

  const { data: keysData, isLoading: keysLoading } = useQuery<{ data: ApiKey[] }>({
    queryKey: ["my-api-keys", token],
    queryFn: () =>
      fetch(`${apiBase}/v1/auth/api-keys`, { headers: authHeaders(token!) }).then((r) => r.json()),
    enabled: !!token,
  });

  const createKey = useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${apiBase}/v1/auth/api-keys`, {
        method: "POST",
        headers: authHeaders(token!),
        body: JSON.stringify({ name }),
      });
      const body = (await res.json()) as { data?: { key?: string; apiKey?: ApiKey }; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to create key");
      return body.data;
    },
    onSuccess: (data) => {
      setFreshKey(data?.key ?? null);
      setNewKeyName("");
      qc.invalidateQueries({ queryKey: ["my-api-keys"] });
    },
  });

  const revokeKey = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${apiBase}/v1/auth/api-keys/${id}`, {
        method: "DELETE",
        headers: authHeaders(token!),
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-api-keys"] }),
  });

  function handleCopy() {
    if (!freshKey) return;
    navigator.clipboard.writeText(freshKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleCreateKey(e: FormEvent) {
    e.preventDefault();
    if (newKeyName.trim()) createKey.mutate(newKeyName.trim());
  }

  const upgrade = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/v1/billing/checkout`, {
        method: "POST",
        headers: authHeaders(token!),
      });
      const body = (await res.json()) as { data?: { url?: string }; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to start upgrade");
      return body.data;
    },
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
  });

  const openPortal = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${apiBase}/v1/billing/portal`, {
        method: "POST",
        headers: authHeaders(token!),
      });
      const body = (await res.json()) as { data?: { url?: string }; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed to open portal");
      return body.data;
    },
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
  });

  const me = meData?.data;
  const keys = keysData?.data ?? [];
  const activeKeys = keys.filter((k) => k.isActive);

  // Show upgrade success/cancelled banner from Stripe redirect
  const upgradeParam = new URLSearchParams(window.location.search).get("upgrade");

  if (!token) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => { logout(); navigate("/"); }}
          className="btn-secondary text-sm"
        >
          Sign out
        </button>
      </div>

      {/* Stripe redirect banners */}
      {upgradeParam === "success" && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 text-sm text-green-800">
          Your subscription is active. Welcome to Pro!
        </div>
      )}
      {upgradeParam === "cancelled" && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-6 text-sm text-gray-600">
          Upgrade cancelled. You can upgrade anytime from your dashboard.
        </div>
      )}

      {/* Profile card */}
      {me && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-gray-900">{me.email}</div>
              <div className="text-sm text-gray-500 mt-0.5">
                Member since {new Date(me.createdAt).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right">
              <span className={`badge capitalize ${
                me.tier === "enterprise" ? "bg-purple-100 text-purple-800" :
                me.tier === "pro" ? "bg-blue-100 text-blue-800" :
                "bg-gray-100 text-gray-700"
              }`}>
                {me.tier}
              </span>
              <div className="text-xs text-gray-500 mt-1">{TIER_LIMITS[me.tier]}</div>
            </div>
          </div>

          {/* Upgrade / manage subscription CTA */}
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
            {me.tier === "free" ? (
              <div>
                <div className="text-sm font-medium text-gray-900">Upgrade to Pro</div>
                <div className="text-xs text-gray-500">10,000 req/day · priority support</div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-gray-900">Manage subscription</div>
                <div className="text-xs text-gray-500">Update payment, cancel, or view invoices</div>
              </div>
            )}
            {me.tier === "free" ? (
              <button
                onClick={() => upgrade.mutate()}
                disabled={upgrade.isPending}
                className="btn-primary text-sm"
              >
                {upgrade.isPending ? "Loading…" : "Upgrade — €29/mo"}
              </button>
            ) : (
              <button
                onClick={() => openPortal.mutate()}
                disabled={openPortal.isPending}
                className="btn-secondary text-sm"
              >
                {openPortal.isPending ? "Loading…" : "Manage billing"}
              </button>
            )}
          </div>
          {(upgrade.isError || openPortal.isError) && (
            <div className="mt-2 text-xs text-red-600">
              {upgrade.error instanceof Error ? upgrade.error.message : openPortal.error instanceof Error ? openPortal.error.message : "Billing error"}
            </div>
          )}
        </div>
      )}

      {/* Fresh key banner */}
      {freshKey && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="text-xl">🔑</span>
            <div className="flex-1">
              <div className="font-semibold text-amber-900 text-sm mb-1">
                Your new API key — copy it now, it won't be shown again
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white border border-amber-200 rounded px-3 py-1.5 text-xs font-mono text-gray-800 break-all">
                  {freshKey}
                </code>
                <button
                  onClick={handleCopy}
                  className="shrink-0 px-3 py-1.5 bg-amber-600 text-white text-xs rounded-lg hover:bg-amber-700 transition-colors"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <button
                onClick={() => setFreshKey(null)}
                className="text-xs text-amber-700 hover:underline mt-2"
              >
                I've saved it — dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* API Keys section */}
      <div className="bg-white border border-gray-200 rounded-xl">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">API Keys</h2>
            <p className="text-xs text-gray-500 mt-0.5">Use these in the X-API-Key header</p>
          </div>
          <span className="text-sm text-gray-400">{activeKeys.length} active</span>
        </div>

        {/* Create new key form */}
        <form onSubmit={handleCreateKey} className="px-5 py-4 border-b border-gray-100 flex gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name (e.g. my-app)"
            className="input flex-1 text-sm"
            maxLength={64}
          />
          <button
            type="submit"
            disabled={createKey.isPending || !newKeyName.trim()}
            className="btn-primary text-sm"
          >
            {createKey.isPending ? "Creating…" : "Generate"}
          </button>
        </form>
        {createKey.isError && (
          <div className="px-5 py-2 text-sm text-red-600 bg-red-50">
            {createKey.error instanceof Error ? createKey.error.message : "Failed to create key"}
          </div>
        )}

        {/* Keys list */}
        {keysLoading && (
          <div className="px-5 py-6 text-sm text-gray-400 text-center">Loading keys…</div>
        )}
        {!keysLoading && keys.length === 0 && (
          <div className="px-5 py-6 text-sm text-gray-400 text-center">
            No API keys yet. Generate one above to get started.
          </div>
        )}
        {keys.map((key) => (
          <div key={key.id} className={`px-5 py-3 border-b border-gray-100 last:border-0 flex items-center gap-4 ${!key.isActive ? "opacity-50" : ""}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {key.name ?? `Key #${key.id}`}
                </span>
                {!key.isActive && (
                  <span className="badge bg-red-100 text-red-700 text-xs">revoked</span>
                )}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {key.requestCount.toLocaleString()} requests
                {key.lastUsedAt && ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}`}
              </div>
            </div>
            {key.isActive && (
              <button
                onClick={() => revokeKey.mutate(key.id)}
                disabled={revokeKey.isPending}
                className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40 shrink-0"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>

      {/* API usage info */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-5">
        <h3 className="font-medium text-gray-900 mb-2 text-sm">Using your API key</h3>
        <div className="bg-gray-900 rounded-lg p-3 text-xs font-mono text-green-400 overflow-x-auto">
          <span className="text-gray-500">$ </span>curl -H "X-API-Key: your_key_here" \<br />
          &nbsp;&nbsp;https://api.gonear.de/v1/programs?country=NL
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Your tier: <strong className="capitalize">{me?.tier ?? "free"}</strong> — {TIER_LIMITS[me?.tier ?? "free"]}
        </p>
      </div>
    </div>
  );
}
