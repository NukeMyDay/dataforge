import React from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, FundingProgram } from "@/api/client.js";
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

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span className={`badge ${color}`}>{label}</span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-gray-500 font-medium min-w-[140px] shrink-0">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function FundingDetail({ program }: { program: FundingProgram }) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-wrap gap-2 mb-3">
          {program.fundingType && (
            <Badge label={program.fundingType} color="bg-blue-50 text-blue-700" />
          )}
          {program.level && (
            <Badge label={program.level} color="bg-violet-50 text-violet-700" />
          )}
          {program.fundingRegion && (
            <Badge label={program.fundingRegion} color="bg-gray-100 text-gray-600" />
          )}
          {program.state && (
            <Badge label={program.state} color="bg-amber-50 text-amber-700" />
          )}
          {program.category && (
            <Badge label={program.category} color="bg-teal-50 text-teal-700" />
          )}
          {program.fundingArea && (
            <Badge label={program.fundingArea} color="bg-indigo-50 text-indigo-700" />
          )}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-snug">
          {program.titleDe}
        </h1>
        {program.titleEn && (
          <p className="text-gray-500 mt-1 text-sm">{program.titleEn}</p>
        )}
      </div>

      {/* Überblick */}
      {program.summaryDe && (
        <Section title="Überblick">
          <p>{program.summaryDe}</p>
          <div className="mt-4 grid sm:grid-cols-2 gap-2 text-sm">
            {program.fundingType && (
              <DetailRow label="Förderart" value={program.fundingType} />
            )}
            {program.fundingArea && (
              <DetailRow label="Förderbereich" value={program.fundingArea} />
            )}
            {program.fundingRegion && (
              <DetailRow label="Region" value={program.fundingRegion} />
            )}
            {program.level && (
              <DetailRow label="Ebene" value={program.level} />
            )}
            {program.state && (
              <DetailRow label="Bundesland" value={program.state} />
            )}
            {program.category && (
              <DetailRow label="Kategorie" value={program.category} />
            )}
          </div>
        </Section>
      )}

      {/* Beschreibung */}
      {program.descriptionDe && (
        <Section title="Beschreibung">
          <p className="whitespace-pre-line">{program.descriptionDe}</p>
        </Section>
      )}

      {/* Konditionen */}
      {program.fundingAmountInfo && (
        <Section title="Konditionen">
          <p className="whitespace-pre-line">{program.fundingAmountInfo}</p>
        </Section>
      )}

      {/* Voraussetzungen */}
      {(program.eligibleApplicants || program.legalRequirementsDe) && (
        <Section title="Voraussetzungen">
          {program.eligibleApplicants && (
            <div className="mb-3">
              <p className="font-medium text-gray-800 mb-1">Antragsberechtigte</p>
              <p className="whitespace-pre-line">{program.eligibleApplicants}</p>
            </div>
          )}
          {program.legalRequirementsDe && (
            <div>
              <p className="font-medium text-gray-800 mb-1">Rechtliche Voraussetzungen</p>
              <p className="whitespace-pre-line">{program.legalRequirementsDe}</p>
            </div>
          )}
        </Section>
      )}

      {/* Antragstellung */}
      {(program.applicationProcess || program.deadlineInfo) && (
        <Section title="Antragstellung">
          {program.applicationProcess && (
            <div className="mb-3">
              <p className="font-medium text-gray-800 mb-1">Antragsprozess</p>
              <p className="whitespace-pre-line">{program.applicationProcess}</p>
            </div>
          )}
          {program.deadlineInfo && (
            <div>
              <p className="font-medium text-gray-800 mb-1">Fristen</p>
              <p className="whitespace-pre-line">{program.deadlineInfo}</p>
            </div>
          )}
        </Section>
      )}

      {/* Kontakt */}
      {program.contactInfo && (
        <Section title="Kontakt">
          <p className="whitespace-pre-line">{program.contactInfo}</p>
        </Section>
      )}

      {/* Rechtsgrundlage */}
      {program.directiveDe && (
        <Section title="Rechtsgrundlage">
          <p className="whitespace-pre-line">{program.directiveDe}</p>
        </Section>
      )}

      {/* Quelle */}
      {program.sourceUrl && (
        <Section title="Quelle">
          <a
            href={program.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-600 hover:text-brand-800 font-medium break-all"
          >
            Zur Originalquelle ↗
          </a>
        </Section>
      )}
    </div>
  );
}

export default function FoerderungDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["funding", slug],
    queryFn: () => api.funding.get(slug!),
    enabled: !!slug,
  });

  const program = data?.data;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6" aria-label="Breadcrumb">
        <Link to="/gruendung" className="hover:text-gray-900">Gründungsdaten</Link>
        <span className="mx-2">›</span>
        <Link to="/gruendung/foerderung" className="hover:text-gray-900">Förderprogramme</Link>
        <span className="mx-2">›</span>
        <span className="text-gray-900 truncate max-w-[200px] inline-block align-bottom">
          {program?.titleDe ?? slug}
        </span>
      </nav>

      {isLoading && <LoadingSpinner />}

      {error && (
        <ErrorMessage message={(error as Error).message} />
      )}

      {!isLoading && !error && program && (
        <FundingDetail program={program} />
      )}

      {!isLoading && !error && !program && (
        <div className="text-center py-16 text-gray-500">
          <p className="font-medium text-gray-900 mb-1">Förderprogramm nicht gefunden</p>
          <Link to="/gruendung/foerderung" className="text-sm text-brand-600 hover:text-brand-800">
            ← Zurück zur Übersicht
          </Link>
        </div>
      )}
    </div>
  );
}
