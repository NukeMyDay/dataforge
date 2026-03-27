export default function ResearchPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      {/* Header */}
      <div className="mb-12">
        <div className="text-sm text-brand-600 font-medium mb-2">Sophex Research</div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Research</h1>
        <p className="text-lg text-gray-600 max-w-2xl">
          Analysen, Whitepapers und Datenstudien zum deutschen Gründungsgeschehen —
          kuratiert vom Sophex-Team.
        </p>
      </div>

      {/* Coming soon */}
      <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-2xl p-12 text-center">
        <div className="text-5xl mb-4">📄</div>
        <h2 className="text-xl font-semibold text-gray-900 mb-3">
          Research coming soon
        </h2>
        <p className="text-gray-500 max-w-md mx-auto mb-6">
          Die ersten Whitepapers und Studien sind in Arbeit. Wir informieren dich,
          sobald neue Inhalte veröffentlicht werden.
        </p>
        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href="mailto:research@sophex.de"
            className="btn-secondary text-sm"
          >
            Kontakt aufnehmen
          </a>
        </div>
      </div>

      {/* Planned content preview */}
      <section className="mt-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Geplante Themen</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {[
            {
              title: "Förderlandschaft Deutschland 2025",
              abstract:
                "Ein strukturierter Überblick über öffentliche Förderprogramme für Startups und KMU — Bundesebene vs. Länder, Volumen und Erreichbarkeit.",
              tag: "Förderung",
            },
            {
              title: "Rechtsformwahl und Wachstumspfade",
              abstract:
                "Wie beeinflusst die initiale Rechtsformwahl den weiteren Wachstumspfad eines Unternehmens? Analyse auf Basis von Handelsregisterdaten.",
              tag: "Recht",
            },
            {
              title: "Bürokratiekosten der Gründung",
              abstract:
                "Zeitaufwand und Kosten für behördliche Prozesse bei der Unternehmensgründung — ein Bundesländer-Vergleich.",
              tag: "Regulatorik",
            },
            {
              title: "Gründungsaktivität nach Branche 2020–2024",
              abstract:
                "Zeitreihenanalyse der Unternehmensgründungen in Deutschland nach Branche, Region und Rechtsform.",
              tag: "Daten",
            },
          ].map((item) => (
            <div key={item.title} className="card border border-gray-200 opacity-60">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="font-medium text-gray-900 text-sm">{item.title}</h3>
                <span className="badge bg-gray-100 text-gray-500 text-xs shrink-0">{item.tag}</span>
              </div>
              <p className="text-sm text-gray-500">{item.abstract}</p>
              <div className="mt-3 text-xs text-gray-400 italic">In Vorbereitung</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
