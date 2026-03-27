import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, Rechtsform } from "@/api/client.js";
import LoadingSpinner from "@/components/LoadingSpinner.js";
import ErrorMessage from "@/components/ErrorMessage.js";

function YesNo({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  return value ? (
    <span className="text-emerald-600 font-medium">Ja</span>
  ) : (
    <span className="text-red-500 font-medium">Nein</span>
  );
}

function RechtsformRow({ r }: { r: Rechtsform }) {
  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
      <td className="py-3 px-4">
        <Link
          to={`/gruendung/rechtsformen/${r.slug}`}
          className="font-semibold text-brand-700 hover:text-brand-900"
        >
          {r.name}
        </Link>
        {r.fullName && (
          <p className="text-xs text-gray-500 mt-0.5">{r.fullName}</p>
        )}
      </td>
      <td className="py-3 px-4 text-sm text-gray-700">
        {r.minCapitalEur !== null
          ? `${r.minCapitalEur.toLocaleString("de-DE")} €`
          : <span className="text-gray-400">Kein Minimum</span>}
      </td>
      <td className="py-3 px-4 text-sm text-gray-700">
        {r.liabilityType ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="py-3 px-4 text-sm text-center">
        <YesNo value={r.notaryRequired} />
      </td>
      <td className="py-3 px-4 text-sm text-center">
        <YesNo value={r.tradeRegisterRequired} />
      </td>
      <td className="py-3 px-4 text-sm text-gray-700">
        {r.founderCount ?? <span className="text-gray-400">—</span>}
      </td>
      <td className="py-3 px-4 text-sm">
        <Link
          to={`/gruendung/rechtsformen/${r.slug}`}
          className="text-brand-600 hover:text-brand-800 font-medium"
        >
          Details →
        </Link>
      </td>
    </tr>
  );
}

export default function RechtsformenList() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["rechtsformen"],
    queryFn: () => api.rechtsformen.list(),
  });

  const rechtsformen = data?.data ?? [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/gruendung" className="hover:text-gray-900">Gründungsdaten</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">Rechtsformen</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Rechtsformen im Vergleich</h1>
        <p className="text-gray-600">
          GmbH, UG, AG, GbR, eG und weitere — alle Rechtsformen nach Haftung, Kapital,
          Notarpflicht und Gründerzahl verglichen.
        </p>
      </div>

      {isLoading && <LoadingSpinner />}

      {error && <ErrorMessage message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            {rechtsformen.length} Rechtsformen
          </p>

          {rechtsformen.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Name
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Mindestkapital
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Haftung
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide text-center">
                      Notarpflicht
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide text-center">
                      Handelsregister
                    </th>
                    <th className="py-3 px-4 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      Gründer min.
                    </th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {rechtsformen.map((r) => (
                    <RechtsformRow key={r.id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">⚖️</div>
              <p className="font-medium text-gray-900 mb-1">Keine Rechtsformen gefunden</p>
              <p className="text-sm">Die Datenbank wird gerade befüllt.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
