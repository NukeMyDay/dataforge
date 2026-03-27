import { useSearchParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, FormEvent } from "react";
import { api } from "@/api/client.js";
import LoadingSpinner from "@/components/LoadingSpinner.js";

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get("q") ?? "";
  const [inputQ, setInputQ] = useState(initialQ);

  const q = searchParams.get("q") ?? "";

  const { data: funding, isLoading } = useQuery({
    queryKey: ["search-funding", q],
    queryFn: () => api.funding.list({ q, pageSize: 20 }),
    enabled: !!q,
  });

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (inputQ.trim()) {
      setSearchParams({ q: inputQ.trim() });
    }
  }

  const programs = funding?.data ?? [];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Suche</h1>

      <form onSubmit={handleSearch} className="flex gap-2 mb-6">
        <input
          type="search"
          value={inputQ}
          onChange={(e) => setInputQ(e.target.value)}
          placeholder="Förderprogramme suchen..."
          className="input flex-1 text-base"
          autoFocus
        />
        <button type="submit" className="btn-primary">Suchen</button>
      </form>

      {isLoading && <LoadingSpinner />}

      {q && !isLoading && (
        <div>
          {programs.length > 0 ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-500 mb-4">
                {(funding?.meta.total ?? 0).toLocaleString("de-DE")} Ergebnisse für „{q}"
              </p>
              {programs.map((p) => (
                <div
                  key={p.id}
                  className="card border border-gray-200 hover:border-brand-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-gray-900 mb-1">{p.titleDe}</div>
                      {p.provider && (
                        <div className="text-xs text-gray-500 mb-2">{p.provider}</div>
                      )}
                      {p.description && (
                        <div className="text-sm text-gray-600 line-clamp-2">{p.description}</div>
                      )}
                    </div>
                    {p.type && (
                      <span className="badge bg-blue-50 text-blue-700 shrink-0">{p.type}</span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.region && <span className="badge bg-gray-100 text-gray-600">{p.region}</span>}
                    {p.targetGroup && <span className="badge bg-violet-50 text-violet-700">{p.targetGroup}</span>}
                    {p.fundingAmount && <span className="badge bg-emerald-50 text-emerald-700">{p.fundingAmount}</span>}
                  </div>
                  {p.sourceUrl && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <a
                        href={p.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-600 hover:text-brand-800 font-medium"
                      >
                        Zum Programm →
                      </a>
                    </div>
                  )}
                </div>
              ))}
              {(funding?.meta.total ?? 0) > 20 && (
                <Link
                  to={`/gruendung/foerderung?q=${encodeURIComponent(q)}`}
                  className="block mt-4 text-sm text-brand-600 hover:underline text-center"
                >
                  Alle {funding?.meta.total} Ergebnisse ansehen →
                </Link>
              )}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-medium text-gray-900 mb-1">Keine Ergebnisse für „{q}"</p>
              <p className="text-sm">Versuche einen anderen Suchbegriff.</p>
            </div>
          )}
        </div>
      )}

      {!q && (
        <div className="text-center py-16 text-gray-400">
          Suchbegriff eingeben, um Förderprogramme zu finden.
        </div>
      )}
    </div>
  );
}
