import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client.js";

const SILOS = [
  {
    id: "foerderung",
    title: "Förderprogramme",
    description: "Öffentliche Förderungen, Zuschüsse und Darlehen für Gründerinnen und Gründer.",
    icon: "💶",
    href: "/gruendung/foerderung",
    status: "live" as const,
    statsKey: "fundingCount" as const,
    statsLabel: "Programme",
    color: "border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-50 text-blue-700",
    badge: "bg-emerald-100 text-emerald-700",
  },
  {
    id: "rechtsformen",
    title: "Rechtsformen",
    description: "GmbH, UG, AG, GbR, eG — Vergleich nach Haftung, Kapital, Aufwand und Eignung.",
    icon: "⚖️",
    href: null,
    status: "soon" as const,
    statsKey: null,
    statsLabel: null,
    color: "border-violet-200",
    iconBg: "bg-violet-50 text-violet-700",
    badge: "bg-gray-100 text-gray-500",
  },
  {
    id: "kosten",
    title: "Gründungskosten",
    description: "Notargebühren, Handelsregisterkosten, Beratung — realistische Kosten für jede Rechtsform.",
    icon: "🧮",
    href: null,
    status: "soon" as const,
    statsKey: null,
    statsLabel: null,
    color: "border-amber-200",
    iconBg: "bg-amber-50 text-amber-700",
    badge: "bg-gray-100 text-gray-500",
  },
  {
    id: "behoerden",
    title: "Behörden & Ämter",
    description: "Welche Ämter, in welcher Reihenfolge. Zuständigkeiten, Formulare und Fristen.",
    icon: "🏛️",
    href: null,
    status: "soon" as const,
    statsKey: null,
    statsLabel: null,
    color: "border-emerald-200",
    iconBg: "bg-emerald-50 text-emerald-700",
    badge: "bg-gray-100 text-gray-500",
  },
  {
    id: "berater",
    title: "Berater & Netzwerke",
    description: "Steuerberater, Anwälte, Acceleratoren, Gründerzentren — nach Region und Branche.",
    icon: "🤝",
    href: null,
    status: "soon" as const,
    statsKey: null,
    statsLabel: null,
    color: "border-rose-200",
    iconBg: "bg-rose-50 text-rose-700",
    badge: "bg-gray-100 text-gray-500",
  },
  {
    id: "markt",
    title: "Markt & Branchendaten",
    description: "Marktgrößen, Wachstumsraten, Wettbewerbslandschaft für relevante Gründungssektoren.",
    icon: "📊",
    href: null,
    status: "soon" as const,
    statsKey: null,
    statsLabel: null,
    color: "border-cyan-200",
    iconBg: "bg-cyan-50 text-cyan-700",
    badge: "bg-gray-100 text-gray-500",
  },
];

export default function GruendungPage() {
  const { data: statsData } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats.get(),
  });

  const stats = statsData?.data;

  return (
    <div>
      {/* Page header */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="text-brand-200 text-sm font-medium mb-2">Sophex</div>
          <h1 className="text-4xl font-bold mb-3">Gründungsdaten</h1>
          <p className="text-brand-100 text-lg max-w-2xl">
            Strukturierte Daten für die Unternehmensgründung in Deutschland — sechs Bereiche,
            automatisiert kuratiert und per API abrufbar.
          </p>
        </div>
      </section>

      {/* Stats */}
      {stats && (stats.fundingCount ?? 0) > 0 && (
        <section className="bg-brand-800 text-white py-4 px-4">
          <div className="max-w-4xl mx-auto flex flex-wrap gap-8">
            <div>
              <div className="text-2xl font-bold">{(stats.fundingCount).toLocaleString("de-DE")}</div>
              <div className="text-brand-200 text-sm">Förderprogramme indexiert</div>
            </div>
            {(stats.regionCount ?? 0) > 0 && (
              <div>
                <div className="text-2xl font-bold">{(stats.regionCount).toLocaleString("de-DE")}</div>
                <div className="text-brand-200 text-sm">Regionen</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Silos grid */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SILOS.map((silo) => {
            const isLive = silo.status === "live";

            const card = (
              <div
                className={`card border-2 h-full flex flex-col gap-3 transition-all ${silo.color} ${
                  isLive ? "hover:shadow-md cursor-pointer" : "opacity-75"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${silo.iconBg}`}>
                    {silo.icon}
                  </div>
                  <span className={`badge ${silo.badge} text-xs mt-1`}>
                    {isLive ? "Live" : "Bald verfügbar"}
                  </span>
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900 text-base mb-1">{silo.title}</h2>
                  <p className="text-gray-600 text-sm">{silo.description}</p>
                </div>
                {isLive && silo.statsKey && stats && (stats[silo.statsKey] ?? 0) > 0 && (
                  <div className="mt-auto pt-3 border-t border-gray-100 text-sm text-gray-500">
                    {(stats[silo.statsKey] as number).toLocaleString("de-DE")} {silo.statsLabel}
                  </div>
                )}
                {isLive && (
                  <div className="mt-auto text-sm font-medium text-brand-600">
                    Erkunden →
                  </div>
                )}
              </div>
            );

            return isLive && silo.href ? (
              <Link key={silo.id} to={silo.href} className="flex">
                {card}
              </Link>
            ) : (
              <div key={silo.id}>{card}</div>
            );
          })}
        </div>
      </section>

      {/* API entry point */}
      <section className="border-t border-gray-200 bg-gray-50 py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-xl font-bold text-gray-900 mb-2">Daten per API nutzen</h2>
          <p className="text-gray-600 text-sm mb-4">
            Alle Gründungsdaten sind über unsere REST API abrufbar — für eigene Anwendungen, Analysen und Tools.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <a href="/v1/docs" className="btn-primary text-sm">
              API-Dokumentation
            </a>
            <Link to="/register" className="btn-secondary text-sm">
              API-Key holen
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
