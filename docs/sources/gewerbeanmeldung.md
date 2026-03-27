# Source Research: Gewerbeanmeldung & Rechtsformen

**Silo:** 2 — Gewerbeanmeldung & Rechtsformen
**Vertical:** Gründungs
**Date:** 2026-03-27

---

## 1. Official Primary Sources

### Rechtsformen (Legal Entity Types)

| Source | URL | Role |
|--------|-----|------|
| **existenzgruender.de** (BMWi/BMWK) | `https://www.existenzgruender.de/DE/Planen/Rechtsformen/inhalt.html` | **Primary** — Federal Ministry for Economic Affairs official startup guide. Authoritative comparison of all major Rechtsformen (GmbH, UG, GbR, OHG, KG, AG, Einzelunternehmen, Freie Berufe). Non-commercial, government-maintained. |
| IHK.de | `https://www.ihk.de` | Secondary — Industrie- und Handelskammer portal for commercial entity guidance. Redirects to individual IHK websites by region. |
| Bundesministerium der Justiz | `https://www.bmj.de` | Tertiary — Legal basis (GmbHG, AktG, HGB). Not structured for scraping. |

### Gewerbeanmeldung (Business Registration)

| Source | URL | Role |
|--------|-----|------|
| **service.bund.de** | `https://service.bund.de/DE/ZentralerStatischerKontent/Einsteiger/Existenzgruendung/Unternehmen-anmelden/inhalt.html` | **Primary** — Federal online services portal (OZG Leistung 99013). Aggregates state-level online registration links. Government-operated. |
| **existenzgruender.de** (BMWi) | `https://www.existenzgruender.de/DE/Weg-in-die-Selbstaendigkeit/Formalitaeten/Gewerbeanmeldung/inhalt.html` | Secondary — Plain-text guidance on the Gewerbeanmeldung process, required documents, costs, and timeline. |
| IHK regional portals | Various, e.g. `https://www.ihk-muenchen.de` | Tertiary — Each IHK provides state-specific forms and fee schedules. Too fragmented for systematic scraping. |

---

## 2. Machine-Readable Interface

| Source | API / Open Data |
|--------|----------------|
| existenzgruender.de | No public API. Static HTML pages, government CMS (Typo3/BSCW). |
| service.bund.de | No structured data feed. The OZG registry (xZuFi) is not publicly exposed. |
| IHK.de | No public API. Regional portals are fragmented and vary by state. |

**Conclusion:** No machine-readable interface exists. Web scraping with Playwright + Cheerio is the only viable approach.

---

## 3. Website Structure

### existenzgruender.de — Rechtsformen

- **Overview page:** `/DE/Planen/Rechtsformen/inhalt.html` — lists all Rechtsformen with relative links.
- **Detail pages:** One page per Rechtsform, e.g. `/DE/Planen/Rechtsformen/GmbH/inhalt.html`. Consistent structure: `<h1>` for name, `<dl>` for metadata key/value pairs (Mindestkapital, Haftung, Notarpflicht, etc.), body text for description.
- **Pagination:** None — all Rechtsformen listed on a single overview page.
- **Known detail pages (fallback):** Einzelunternehmen, GbR, OHG, KG, GmbH, UG, AG, Freie Berufe.

### service.bund.de — Gewerbeanmeldung

- **Single page:** One federal page covers the entire procedure. State-specific links appear as anchor links or a list of Bundesland portals.
- **Pagination:** None — single static page.
- **Data model:** One record per Bundesland (16 total). The page does not render per-state structured data — state records are populated with federal defaults plus what can be extracted (costs, required documents, online availability flag). The `bundesland` key is encoded as a URL fragment so each state gets its own pipeline record.

---

## 4. Update Frequency

| Source | Observed Frequency | Our Schedule |
|--------|-------------------|-------------|
| existenzgruender.de | Infrequent — BMWi updates Rechtsform pages when legislation changes (GmbHG amendments, UG capital discussions). Roughly 1–2x per year. | Weekly Monday 03:00 UTC — content-hash diff prevents unnecessary writes |
| service.bund.de | Infrequent — Federal OZG service pages are updated when state portals change or OZG rollout progresses. | Weekly Monday 03:00 UTC (same job, `scrape-gewerbeanmeldung` pipeline) |

---

## 5. Data Schema Summary

### `rechtsformen` table

| Column | Type | Description |
|--------|------|-------------|
| `name` | varchar(256) | Short name, e.g. "GmbH" |
| `slug` | varchar(256) | URL-safe key, e.g. "gmbh" |
| `full_name` | text | Full legal name |
| `min_capital_eur` | integer | Statutory minimum capital in EUR (null if none) |
| `liability_type` | varchar(256) | Haftung description |
| `notary_required` | boolean | Notarpflicht for founding contract |
| `trade_register_required` | boolean | Handelsregisterpflicht |
| `founder_count` | varchar(64) | Minimum founders required |
| `description_de` | text | Main description (German) |
| `tax_notes_de` | text | Tax-specific notes |
| `founding_costs_de` | text | Founding costs description |
| `source_url` | text | Canonical source URL |
| `content_hash` | varchar(64) | SHA-256 for change detection |

### `gewerbeanmeldung_info` table

| Column | Type | Description |
|--------|------|-------------|
| `bundesland` | varchar(64) | German state (unique key) |
| `zustaendige_stelle_description` | text | Which Gewerbeamt/Ordnungsamt handles registration |
| `kosten_eur` | integer | Typical registration fee in EUR |
| `bearbeitungszeit_tage` | integer | Typical processing time in working days |
| `required_documents` | jsonb | Array of required document names |
| `online_available` | boolean | Whether online submission is offered |
| `note_de` | text | State-specific notes |
| `source_url` | text | Canonical source URL |
| `content_hash` | varchar(64) | SHA-256 for change detection |

---

## 6. Scraping Notes

- **existenzgruender.de** uses a government CMS with clean, consistent HTML. CSS selector `dl dt`/`dd` pairs reliably extract metadata. The `<h1>` is always the Rechtsform name.
- **service.bund.de** is a static government page providing federal-level guidance rather than per-state structured data. Gewerbeanmeldung records use federal defaults (cost: ~26 EUR, processing: ~3 days) supplemented by whatever the page currently exposes.
- Both sources are JavaScript-light; Playwright with `waitUntil: "networkidle"` is sufficient.
- A 2-second inter-request delay is used to respect server resources.
- Content-hash diffing ensures idempotency: unchanged pages do not generate DB writes.
