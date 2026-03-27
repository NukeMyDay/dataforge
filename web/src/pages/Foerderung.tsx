import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useState, FormEvent } from "react";
import { api, FundingProgram } from "@/api/client.js";
import LoadingSpinner from "@/components/LoadingSpinner.js";
import Pagination from "@/components/Pagination.js";
import ErrorMessage from "@/components/ErrorMessage.js";

const REGIONS = [
  "Bundesweit",
  "Baden-Württemberg",
  "Bayern",
  "Berlin",
  "Brandenburg",
  "Bremen",
  "Hamburg",
  "Hessen",
  "Mecklenburg-Vorpommern",
  "Niedersachsen",
  "Nordrhein-Westfalen",
  "Rheinland-Pfalz",
  "Saarland",
  "Sachsen",
  "Sachsen-Anhalt",
  "Schleswig-Holstein",
  "Thüringen",
];

const TYPES = ["Zuschuss", "Darlehen", "Bürgschaft", "Beteiligung", "Beratung"];

const TARGET_GROUPS = [
  "Alle Gründer",
  "Frauen",
  "Jugendliche",
  "Hochschulabsolventen",
  "Technologie-Startups",
  "Soziale Unternehmen",
];

function FundingCard({ program }: { program: FundingProgram }) {
  return (
    <div className="card border border-gray-200 hover:border-brand-300 hover:shadow-md transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <Link
            to={`/gruendung/foerderung/${program.slug}`}
            className="font-semibold text-gray-900 hover:text-brand-700 mb-1 leading-snug block"
          >
            {program.titleDe}
          </Link>
          {program.summaryDe && (
            <p className="text-sm text-gray-600 line-clamp-2 mt-1">{program.summaryDe}</p>
          )}
        </div>
        {program.fundingType && (
          <span className="badge bg-blue-50 text-blue-700 shrink-0">{program.fundingType}</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 items-center">
        {program.fundingRegion && (
          <span className="badge bg-gray-100 text-gray-600">{program.fundingRegion}</span>
        )}
        {program.level && (
          <span className="badge bg-violet-50 text-violet-700">{program.level}</span>
        )}
        {program.fundingAmountInfo && (
          <span className="badge bg-emerald-50 text-emerald-700 max-w-[200px] truncate">
            {program.fundingAmountInfo}
          </span>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4">
        <Link
          to={`/gruendung/foerderung/${program.slug}`}
          className="text-sm text-brand-600 hover:text-brand-800 font-medium"
        >
          Details ansehen →
        </Link>
        {program.sourceUrl && (
          <a
            href={program.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-gray-500 hover:text-gray-800"
          >
            Zur Originalquelle ↗
          </a>
        )}
      </div>
    </div>
  );
}

export default function FoerderungPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const q = searchParams.get("q") ?? "";
  const region = searchParams.get("region") ?? "";
  const type = searchParams.get("type") ?? "";
  const targetGroup = searchParams.get("targetGroup") ?? "";
  const page = Number(searchParams.get("page") ?? "1");

  const [inputQ, setInputQ] = useState(q);

  const { data, isLoading, error } = useQuery({
    queryKey: ["funding", q, region, type, targetGroup, page],
    queryFn: () =>
      api.funding.list({
        q: q || undefined,
        region: region || undefined,
        type: type || undefined,
        targetGroup: targetGroup || undefined,
        page,
        pageSize: 20,
      }),
  });

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (inputQ.trim()) {
      next.set("q", inputQ.trim());
    } else {
      next.delete("q");
    }
    next.delete("page");
    setSearchParams(next);
  }

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete("page");
    setSearchParams(next);
  }

  function setPage(p: number) {
    const next = new URLSearchParams(searchParams);
    next.set("page", String(p));
    setSearchParams(next);
  }

  const programs = data?.data ?? [];
  const pagination = data?.meta;
  const hasFilters = !!(q || region || type || targetGroup);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/gruendung" className="hover:text-gray-900">Gründungsdaten</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">Förderprogramme</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Förderprogramme</h1>
        <p className="text-gray-600">
          Öffentliche Förderungen für Gründerinnen und Gründer in Deutschland — nach Region,
          Förderart und Zielgruppe filterbar.
        </p>
      </div>

      {/* Search + Filters */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-8">
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            type="search"
            value={inputQ}
            onChange={(e) => setInputQ(e.target.value)}
            placeholder="Suchbegriff, z.B. Digitalisierung, Gründerkredit..."
            className="input flex-1 text-sm"
            aria-label="Förderprogramme suchen"
          />
          <button type="submit" className="btn-primary text-sm">
            Suchen
          </button>
        </form>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="filter-region" className="block text-xs font-medium text-gray-600 mb-1">
              Region
            </label>
            <select
              id="filter-region"
              className="select text-sm"
              value={region}
              onChange={(e) => setFilter("region", e.target.value)}
            >
              <option value="">Alle Regionen</option>
              {REGIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-type" className="block text-xs font-medium text-gray-600 mb-1">
              Förderart
            </label>
            <select
              id="filter-type"
              className="select text-sm"
              value={type}
              onChange={(e) => setFilter("type", e.target.value)}
            >
              <option value="">Alle Arten</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="filter-target" className="block text-xs font-medium text-gray-600 mb-1">
              Zielgruppe
            </label>
            <select
              id="filter-target"
              className="select text-sm"
              value={targetGroup}
              onChange={(e) => setFilter("targetGroup", e.target.value)}
            >
              <option value="">Alle Zielgruppen</option>
              {TARGET_GROUPS.map((tg) => (
                <option key={tg} value={tg}>{tg}</option>
              ))}
            </select>
          </div>
        </div>

        {hasFilters && (
          <button
            onClick={() => setSearchParams({})}
            className="mt-3 text-xs text-gray-500 hover:text-gray-900 underline"
          >
            Filter zurücksetzen
          </button>
        )}
      </div>

      {/* Results */}
      {isLoading && <LoadingSpinner />}

      {error && (
        <ErrorMessage message={(error as Error).message} />
      )}

      {!isLoading && !error && (
        <>
          {pagination && (
            <p className="text-sm text-gray-500 mb-5">
              {pagination.total.toLocaleString("de-DE")} Förderprogramme gefunden
              {q && ` für „${q}"`}
            </p>
          )}

          {programs.length > 0 ? (
            <div className="space-y-4">
              {programs.map((program) => (
                <FundingCard key={program.id} program={program} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">🔍</div>
              <p className="font-medium text-gray-900 mb-1">Keine Treffer gefunden</p>
              <p className="text-sm">Versuche einen anderen Suchbegriff oder entferne Filter.</p>
            </div>
          )}

          {pagination && pagination.total > pagination.pageSize && (
            <div className="mt-8">
              <Pagination
                page={pagination.page}
                pageSize={pagination.pageSize}
                total={pagination.total}
                onChange={setPage}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
