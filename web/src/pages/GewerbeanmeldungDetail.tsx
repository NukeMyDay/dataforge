import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client.js";
import LoadingSpinner from "@/components/LoadingSpinner.js";
import ErrorMessage from "@/components/ErrorMessage.js";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2 pb-1 border-b border-gray-200">
        {title}
      </h2>
      <div className="text-gray-700 text-sm leading-relaxed">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 font-medium min-w-[180px] shrink-0">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

export default function GewerbeanmeldungDetail() {
  const { bundesland } = useParams<{ bundesland: string }>();
  const decoded = bundesland ? decodeURIComponent(bundesland) : "";

  const { data, isLoading, error } = useQuery({
    queryKey: ["gewerbeanmeldung", decoded],
    queryFn: () => api.gewerbeanmeldung.get(decoded),
    enabled: !!decoded,
  });

  const info = data?.data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/gruendung" className="hover:text-gray-900">Gründungsdaten</Link>
        <span className="mx-2">›</span>
        <Link to="/gruendung/gewerbeanmeldung" className="hover:text-gray-900">Gewerbeanmeldung</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{info?.bundesland ?? decoded}</span>
      </nav>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={(error as Error).message} />}

      {!isLoading && !error && info && (
        <div className="space-y-8">
          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-gray-900">{info.bundesland}</h1>
            {info.onlineAvailable !== null && (
              info.onlineAvailable ? (
                <span className="badge bg-emerald-50 text-emerald-700">Online möglich</span>
              ) : (
                <span className="badge bg-gray-100 text-gray-500">Nur vor Ort</span>
              )
            )}
          </div>

          {/* Überblick */}
          <Section title="Überblick">
            <div className="space-y-2">
              {info.zustaendigeStelleDescription && (
                <DetailRow label="Zuständige Stelle" value={info.zustaendigeStelleDescription} />
              )}
              {info.kostenEur !== null && (
                <DetailRow label="Gebühr" value={`${info.kostenEur} €`} />
              )}
              {info.bearbeitungszeitTage !== null && (
                <DetailRow
                  label="Bearbeitungszeit"
                  value={`${info.bearbeitungszeitTage} Werktage`}
                />
              )}
              {info.onlineAvailable !== null && (
                <DetailRow
                  label="Online-Anmeldung"
                  value={
                    info.onlineAvailable ? (
                      <span className="text-emerald-600 font-medium">Verfügbar</span>
                    ) : (
                      <span className="text-gray-500">Nicht verfügbar</span>
                    )
                  }
                />
              )}
            </div>
          </Section>

          {/* Required Documents */}
          {info.requiredDocuments && info.requiredDocuments.length > 0 && (
            <Section title="Erforderliche Unterlagen">
              <ul className="list-disc list-inside space-y-1">
                {info.requiredDocuments.map((doc, i) => (
                  <li key={i}>{doc}</li>
                ))}
              </ul>
            </Section>
          )}

          {/* Notes */}
          {info.noteDe && (
            <Section title="Hinweise">
              <p className="whitespace-pre-line">{info.noteDe}</p>
            </Section>
          )}

          {/* Quelle */}
          <Section title="Quelle">
            <a
              href={info.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-800 font-medium break-all"
            >
              Zur Originalquelle ↗
            </a>
          </Section>
        </div>
      )}

      {!isLoading && !error && !info && (
        <div className="text-center py-16 text-gray-500">
          <p className="font-medium text-gray-900 mb-1">Bundesland nicht gefunden</p>
          <Link to="/gruendung/gewerbeanmeldung" className="text-sm text-brand-600 hover:text-brand-800">
            ← Zurück zur Übersicht
          </Link>
        </div>
      )}
    </div>
  );
}
