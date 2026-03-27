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

function YesNoBadge({ value }: { value: boolean | null }) {
  if (value === null || value === undefined) return <span className="text-gray-400">—</span>;
  return value ? (
    <span className="badge bg-emerald-50 text-emerald-700">Ja</span>
  ) : (
    <span className="badge bg-red-50 text-red-600">Nein</span>
  );
}

export default function RechtsformDetail() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["rechtsformen", slug],
    queryFn: () => api.rechtsformen.get(slug!),
    enabled: !!slug,
  });

  const r = data?.data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/gruendung" className="hover:text-gray-900">Gründungsdaten</Link>
        <span className="mx-2">›</span>
        <Link to="/gruendung/rechtsformen" className="hover:text-gray-900">Rechtsformen</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900">{r?.name ?? slug}</span>
      </nav>

      {isLoading && <LoadingSpinner />}
      {error && <ErrorMessage message={(error as Error).message} />}

      {!isLoading && !error && r && (
        <div className="space-y-8">
          {/* Header */}
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{r.name}</h1>
            {r.fullName && (
              <p className="text-gray-500 text-base">{r.fullName}</p>
            )}
          </div>

          {/* Überblick */}
          <Section title="Überblick">
            <div className="space-y-2">
              {r.minCapitalEur !== null && (
                <DetailRow
                  label="Mindestkapital"
                  value={`${r.minCapitalEur.toLocaleString("de-DE")} €`}
                />
              )}
              {r.liabilityType && (
                <DetailRow label="Haftung" value={r.liabilityType} />
              )}
              {r.notaryRequired !== null && (
                <DetailRow label="Notarpflicht" value={<YesNoBadge value={r.notaryRequired} />} />
              )}
              {r.tradeRegisterRequired !== null && (
                <DetailRow
                  label="Handelsregisterpflicht"
                  value={<YesNoBadge value={r.tradeRegisterRequired} />}
                />
              )}
              {r.founderCount && (
                <DetailRow label="Mindestgründerzahl" value={r.founderCount} />
              )}
            </div>
          </Section>

          {/* Beschreibung */}
          {r.descriptionDe && (
            <Section title="Beschreibung">
              <p className="whitespace-pre-line">{r.descriptionDe}</p>
            </Section>
          )}

          {/* Steuer */}
          {r.taxNotesDe && (
            <Section title="Steuer">
              <p className="whitespace-pre-line">{r.taxNotesDe}</p>
            </Section>
          )}

          {/* Gründungsaufwand */}
          {r.foundingCostsDe && (
            <Section title="Gründungsaufwand">
              <p className="whitespace-pre-line">{r.foundingCostsDe}</p>
            </Section>
          )}

          {/* Quelle */}
          <Section title="Quelle">
            <a
              href={r.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand-600 hover:text-brand-800 font-medium break-all"
            >
              Zur Originalquelle ↗
            </a>
          </Section>
        </div>
      )}

      {!isLoading && !error && !r && (
        <div className="text-center py-16 text-gray-500">
          <p className="font-medium text-gray-900 mb-1">Rechtsform nicht gefunden</p>
          <Link to="/gruendung/rechtsformen" className="text-sm text-brand-600 hover:text-brand-800">
            ← Zurück zur Übersicht
          </Link>
        </div>
      )}
    </div>
  );
}
