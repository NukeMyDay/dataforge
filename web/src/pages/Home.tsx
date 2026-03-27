import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client.js";
import SiloCard from "@/components/SiloCard.js";

const SILOS = [
  {
    id: "foerderung",
    title: "Förderprogramme",
    description: "Öffentliche Förderprogramme für Gründerinnen und Gründer — gefiltert nach Region, Zielgruppe und Förderart.",
    icon: "💶",
    href: "/gruendung/foerderung",
    status: "live" as const,
    color: "border-blue-200 hover:border-blue-400",
    iconBg: "bg-blue-50 text-blue-700",
  },
  {
    id: "rechtsformen",
    title: "Rechtsformen",
    description: "GmbH, UG, AG, GbR — Vor- und Nachteile, Mindestkapital, Haftung und Gründungsaufwand im Vergleich.",
    icon: "⚖️",
    href: "/gruendung/rechtsformen",
    status: "live" as const,
    color: "border-violet-200 hover:border-violet-400",
    iconBg: "bg-violet-50 text-violet-700",
  },
  {
    id: "gewerbeanmeldung",
    title: "Gewerbeanmeldung",
    description: "Gebühren, Bearbeitungszeiten und Unterlagen für die Gewerbeanmeldung in allen 16 Bundesländern.",
    icon: "🏢",
    href: "/gruendung/gewerbeanmeldung",
    status: "live" as const,
    color: "border-green-200 hover:border-green-400",
    iconBg: "bg-green-50 text-green-700",
  },
  {
    id: "kosten",
    title: "Gründungskosten",
    description: "Notarkosten, Handelsregistergebühren, Beratungskosten — eine realistische Kalkulation für den Einstieg.",
    icon: "🧮",
    href: null,
    status: "soon" as const,
    color: "border-amber-200",
    iconBg: "bg-amber-50 text-amber-700",
  },
  {
    id: "behoerden",
    title: "Behörden & Ämter",
    description: "Welche Ämter brauche ich, in welcher Reihenfolge? Zuständigkeiten, Formulare und Fristen.",
    icon: "🏛️",
    href: null,
    status: "soon" as const,
    color: "border-emerald-200",
    iconBg: "bg-emerald-50 text-emerald-700",
  },
  {
    id: "berater",
    title: "Berater & Netzwerke",
    description: "Steuerberater, Anwälte, Acceleratoren und Gründerzentren — regional und nach Branche filterbar.",
    icon: "🤝",
    href: null,
    status: "soon" as const,
    color: "border-rose-200",
    iconBg: "bg-rose-50 text-rose-700",
  },
  {
    id: "markt",
    title: "Markt & Branchendaten",
    description: "Marktgrößen, Wachstumsraten und Wettbewerbslandschaften für die relevantesten Gründungssektoren.",
    icon: "📊",
    href: null,
    status: "soon" as const,
    color: "border-cyan-200",
    iconBg: "bg-cyan-50 text-cyan-700",
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const { data: statsData } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats.get(),
  });

  const stats = statsData?.data;

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-brand-700 to-brand-900 text-white py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 text-brand-100 text-sm px-4 py-1.5 rounded-full mb-6 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Gründungsdaten · Deutschland
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-5 tracking-tight">
            Alle Daten für deine Gründung —<br className="hidden sm:block" /> an einem Ort.
          </h1>
          <p className="text-xl text-brand-200 mb-10 max-w-2xl mx-auto">
            Förderprogramme, Rechtsformen, Behördenwege und mehr. Strukturiert, aktuell, kostenlos.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link to="/gruendung" className="px-6 py-3 bg-white text-brand-700 font-semibold rounded-xl hover:bg-brand-50 transition-colors">
              Gründungsdaten erkunden →
            </Link>
            <Link to="/gruendung/foerderung" className="px-6 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors border border-white/20">
              Förderprogramme suchen
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      {stats && (
        <section className="bg-brand-800 text-white py-5 px-4">
          <div className="max-w-4xl mx-auto flex flex-wrap justify-center gap-8 text-center">
            {(stats.fundingCount ?? 0) > 0 && (
              <div>
                <div className="text-3xl font-bold">{(stats.fundingCount).toLocaleString("de-DE")}</div>
                <div className="text-brand-200 text-sm">Förderprogramme</div>
              </div>
            )}
            {(stats.regionCount ?? 0) > 0 && (
              <div>
                <div className="text-3xl font-bold">{(stats.regionCount).toLocaleString("de-DE")}</div>
                <div className="text-brand-200 text-sm">Regionen abgedeckt</div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Data Silos */}
      <section className="max-w-6xl mx-auto px-4 py-20">
        <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Gründungsdaten</h2>
        <p className="text-gray-600 text-center mb-10">
          Sechs Datenbereiche — unabhängig kuratiert, über API und Web abrufbar.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {SILOS.map((silo) => (
            <SiloCard key={silo.id} {...silo} />
          ))}
        </div>
      </section>

      {/* Founder Assistant Teaser */}
      <section className="bg-gradient-to-r from-brand-600 to-brand-800 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center text-white">
          <div className="inline-flex items-center gap-2 bg-white/10 text-brand-100 text-sm px-4 py-1.5 rounded-full mb-5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Jetzt verfügbar
          </div>
          <h2 className="text-3xl font-bold mb-4">Startup Assistant</h2>
          <p className="text-brand-100 text-lg mb-8 max-w-xl mx-auto">
            Dein KI-Assistent für die Gründung. Stellt die richtigen Fragen, findet passende Förderprogramme
            und begleitet dich durch Behördenwege — alles in einem Gespräch.
          </p>
          <button
            onClick={() => navigate("/assistant")}
            className="px-6 py-3 bg-white text-brand-700 font-semibold rounded-xl hover:bg-brand-50 transition-colors"
          >
            Assistant starten →
          </button>
        </div>
      </section>

      {/* API CTA */}
      <section className="bg-gray-50 border-t border-gray-200 py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Zugriff per REST API</h2>
          <p className="text-gray-600 mb-6">
            Alle Daten sind programmatisch abrufbar. API-Key holen und direkt loslegen.
          </p>
          <div className="bg-gray-900 rounded-xl p-4 text-left text-sm font-mono text-green-400 mb-6 overflow-x-auto">
            <span className="text-gray-500">$ </span>curl -H "X-API-Key: your_key" \<br />
            &nbsp;&nbsp;https://api.sophex.de/v1/funding?region=Bayern&amp;type=Zuschuss
          </div>
          <a href="/v1/docs" className="btn-primary">
            API-Dokumentation ansehen →
          </a>
        </div>
      </section>
    </div>
  );
}
