import { Link } from "react-router-dom";

const publishedArticles = [
  {
    title: "Blockchain-verified Data Integrity for Government Data",
    abstract:
      "Tamper-evident, third-party-verifiable integrity guarantees for all Sophex data records using cryptographic Merkle trees and Bitcoin-backed OpenTimestamps anchoring — at near-zero cost via Merkle batching of up to 1,000 records per anchor.",
    tag: "Security",
    date: "March 27, 2026",
    readTime: "~20 min",
    href: "/research/blockchain-data-integrity",
  },
  {
    title: "Primary Source Verification — Eliminating Intermediary Bias in Public Data Aggregation",
    abstract:
      "A four-layer verification framework combining authority registration, cryptographic fetch integrity, TLS certificate chain capture, and CDN/proxy detection — with empirical findings on German federal portal infrastructure including Cloudflare deployment on foerderdatenbank.de.",
    tag: "Security",
    date: "March 27, 2026",
    readTime: "~18 min",
    href: "/research/primary-source-verification",
  },
  {
    title: "CSS Selectors vs. LLM-Based Extraction: A Benchmark on German Government Data",
    abstract:
      "A head-to-head benchmark of three extraction strategies — CSS-only, LLM-only (Claude Haiku), and a CSS-first hybrid with LLM fallback — on 20 pages of foerderdatenbank.de. The hybrid achieves 92% field fill rate and 0% error rate at 18% lower cost than LLM-only. CSS-only is 307× faster but blind to prose-embedded fields. LLM-only fails catastrophically on 35% of pages.",
    tag: "Machine Learning",
    date: "March 27, 2026",
    readTime: "~22 min",
    href: "/research/css-vs-llm-extraction",
  },
  {
    title: "AI-assisted Data Extraction from Unstructured Government Sources",
    abstract:
      "A hybrid CSS+LLM extraction pipeline that increases field coverage by 21 percentage points on foerderdatenbank.de, recovers 94% of fields lost to CMS restructuring, and costs ~$5 per full corpus run using Claude Haiku as a semantic fallback layer.",
    tag: "Machine Learning",
    date: "March 27, 2026",
    readTime: "~20 min",
    href: "/research/ai-assisted-extraction",
  },
  {
    title: "Data Provenance & Freshness Guarantees in Public Data Aggregation",
    abstract:
      "A lightweight architecture for verifiable data provenance in public-data pipelines: HTTP-header-based freshness gating, content-hash versioning with scrape-run linkage, and a composite confidence score — demonstrated on the Sophex German funding corpus.",
    tag: "Data Engineering",
    date: "March 27, 2026",
    readTime: "~15 min",
    href: "/research/data-provenance-freshness",
  },
];

const plannedArticles = [
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
];

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

      {/* Published articles */}
      <section className="mb-16">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Published</h2>
        <div className="space-y-4">
          {publishedArticles.map((article) => (
            <Link
              key={article.href}
              to={article.href}
              className="block card border border-gray-200 hover:border-brand-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="font-semibold text-gray-900">{article.title}</h3>
                <span className="badge bg-brand-50 text-brand-700 text-xs shrink-0">{article.tag}</span>
              </div>
              <p className="text-sm text-gray-600 mb-3">{article.abstract}</p>
              <div className="flex gap-3 text-xs text-gray-400">
                <span>{article.date}</span>
                <span>·</span>
                <span>{article.readTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Planned content */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Geplante Themen</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {plannedArticles.map((item) => (
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
