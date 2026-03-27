import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, GewerbeanmeldungInfo } from "@/api/client.js";
import LoadingSpinner from "@/components/LoadingSpinner.js";
import ErrorMessage from "@/components/ErrorMessage.js";

function BundeslandCard({ info }: { info: GewerbeanmeldungInfo }) {
  return (
    <Link
      to={`/gruendung/gewerbeanmeldung/${encodeURIComponent(info.bundesland)}`}
      className="card border border-gray-200 hover:border-brand-300 hover:shadow-md transition-all flex flex-col gap-3"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-semibold text-gray-900 text-base">{info.bundesland}</h2>
        {info.onlineAvailable !== null && (
          info.onlineAvailable ? (
            <span className="badge bg-emerald-50 text-emerald-700 shrink-0">Online möglich</span>
          ) : (
            <span className="badge bg-gray-100 text-gray-500 shrink-0">Nur vor Ort</span>
          )
        )}
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
        {info.kostenEur !== null && (
          <span>
            <span className="font-medium text-gray-800">{info.kostenEur} €</span>{" "}
            Gebühr
          </span>
        )}
        {info.bearbeitungszeitTage !== null && (
          <span>
            <span className="font-medium text-gray-800">{info.bearbeitungszeitTage} Tage</span>{" "}
            Bearbeitung
          </span>
        )}
      </div>

      <div className="mt-auto text-sm font-medium text-brand-600">
        Details ansehen →
      </div>
    </Link>
  );
}

export default function GewerbeanmeldungPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["gewerbeanmeldung"],
    queryFn: () => api.gewerbeanmeldung.list(),
  });

  const infos = data?.data ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/gruendung" className="hover:text-gray-900">Gründungsdaten</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">Gewerbeanmeldung</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Gewerbeanmeldung</h1>
        <p className="text-gray-600">
          Gebühren, Bearbeitungszeiten und erforderliche Unterlagen für die Gewerbeanmeldung
          in allen 16 Bundesländern.
        </p>
      </div>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={(error as Error).message} />}

      {!isLoading && !error && (
        <>
          <p className="text-sm text-gray-500 mb-5">
            {infos.length} Bundesländer
          </p>

          {infos.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {infos.map((info) => (
                <BundeslandCard key={info.id} info={info} />
              ))}
            </div>
          ) : (
            <div className="text-center py-16 text-gray-500">
              <div className="text-4xl mb-3">🏢</div>
              <p className="font-medium text-gray-900 mb-1">Keine Daten gefunden</p>
              <p className="text-sm">Die Datenbank wird gerade befüllt.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
