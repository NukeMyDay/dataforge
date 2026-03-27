import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi } from "@/api/client.js";

const SETTING_LABELS: Record<string, { label: string; description?: string; type?: "password" | "text" | "number" }> = {
  anthropic_api_key: { label: "Anthropic API Key", description: "Used for AI chat features", type: "password" },
  smtp_host: { label: "SMTP Host", description: "Outbound email server hostname", type: "text" },
  smtp_port: { label: "SMTP Port", description: "Default: 587 (STARTTLS)", type: "number" },
  smtp_user: { label: "SMTP Username", type: "text" },
  smtp_pass: { label: "SMTP Password", type: "password" },
  smtp_from: { label: "From Address", description: "e.g. noreply@gonear.de", type: "text" },
};

const SECTIONS = [
  {
    title: "AI",
    keys: ["anthropic_api_key"],
  },
  {
    title: "Email (SMTP)",
    keys: ["smtp_host", "smtp_port", "smtp_user", "smtp_pass", "smtp_from"],
  },
];

export default function SettingsPage() {
  const qc = useQueryClient();
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-settings"],
    queryFn: () => adminApi.settings.list(),
  });

  const save = useMutation({
    mutationFn: (items: Array<{ key: string; value: string | null }>) =>
      adminApi.settings.update(items),
    onSuccess: () => {
      setEdits({});
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      qc.invalidateQueries({ queryKey: ["admin-settings"] });
    },
  });

  function getValue(key: string): string {
    if (key in edits) return edits[key];
    const row = data?.data.find((r) => r.key === key);
    // Masked secrets show as ••• — display empty so user can re-enter
    if (row?.value === "•••") return "";
    return row?.value ?? "";
  }

  function handleChange(key: string, value: string) {
    setEdits((prev) => ({ ...prev, [key]: value }));
  }

  function handleSave() {
    const items = Object.entries(edits).map(([key, value]) => ({
      key,
      value: value.trim() === "" ? null : value.trim(),
    }));
    if (items.length > 0) {
      save.mutate(items);
    }
  }

  const hasChanges = Object.keys(edits).length > 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <div className="flex items-center gap-3">
          {saved && <span className="text-sm text-green-400">Saved ✓</span>}
          <button
            onClick={handleSave}
            disabled={!hasChanges || save.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {isLoading && <p className="text-gray-400">Loading settings…</p>}

      {data && (
        <div className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title} className="bg-gray-800 border border-gray-700 rounded-xl p-6">
              <h2 className="text-base font-semibold text-white mb-5">{section.title}</h2>
              <div className="space-y-4">
                {section.keys.map((key) => {
                  const meta = SETTING_LABELS[key] ?? { label: key, type: "text" };
                  const isSecret = meta.type === "password";
                  const isMasked = data.data.find((r) => r.key === key)?.value === "•••";
                  return (
                    <div key={key}>
                      <label className="block text-sm font-medium text-gray-300 mb-1">
                        {meta.label}
                        {meta.description && (
                          <span className="ml-2 font-normal text-gray-500 text-xs">{meta.description}</span>
                        )}
                      </label>
                      <input
                        type={isSecret ? "password" : meta.type ?? "text"}
                        value={getValue(key)}
                        onChange={(e) => handleChange(key, e.target.value)}
                        placeholder={isMasked ? "••••••••  (leave blank to keep existing)" : "Not set"}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
