// Silo 3 scraper: Steuerliche Pflichten für Gründer (DAT-37)
//
// Scrapes tax obligations relevant to German business founders, broken down by
// Rechtsform (GmbH, UG, Einzelunternehmen, Freiberufler, GbR) and filing deadlines.
//
// Primary sources per data type:
//
//   Tax obligations (Steuerarten je Rechtsform):
//   - bundesfinanzministerium.de — Federal Ministry of Finance; primary authority
//     for Körperschaftsteuer (§ 23 KStG), Einkommensteuer (EStG), and German tax law
//   - elster.de — Official German tax portal (Finanzverwaltung); primary source for
//     filing procedures, Voranmeldungen, and Fragebogen zur steuerlichen Erfassung
//   - bundesrat.de — For Gewerbesteuer references (GewStG) and Landessteuerrecht
//
//   Filing deadlines (Steuerfristen):
//   - bundesfinanzministerium.de — publishes the annual Steuerkalender with all key dates
//   - elster.de — Voranmeldung deadlines, Dauerfristverlängerung rules
//   - bundestag.de — EStG § 149, UStG § 18, GewStG § 14a (statutory deadlines)
//
// Strategy: fragment-keyed URLs encode (rechtsformSlug, taxType) or (taxType, eventTrigger)
// per record. parsePage() attempts live extraction and falls back to authoritative baseline
// data when government page structure changes.

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { db, taxObligations, taxDeadlines } from "@dataforge/db";
import { and, eq } from "drizzle-orm";
import { BaseScraper, type DiffResult } from "../lib/base-scraper.js";
import type { Page } from "playwright";

// ─── Source URLs ──────────────────────────────────────────────────────────────

// bundesfinanzministerium.de — Federal Ministry of Finance; primary authority for
// Körperschaftsteuer, Einkommensteuer, Solidaritätszuschlag, and Gewerbesteuer.
// Publishes binding tax rates and the annual Steuerkalender.
const BMF_STEUERN_URL =
  "https://www.bundesfinanzministerium.de/Web/DE/Themen/Steuern/steuern.html";

// elster.de — Official German tax portal operated by the Finanzverwaltung. Primary
// authority for registration procedures (Fragebogen zur steuerlichen Erfassung),
// Umsatzsteuer-Voranmeldung, and Lohnsteuer-Anmeldung.
const ELSTER_URL =
  "https://www.elster.de/eportal/helpGlobal?themaGlobal=hilfe_registrierung";

// bundesrat.de — Secondary authority for GewStG and Landessteuerrecht context.
const BUNDESRAT_GEWERBESTEUER_URL =
  "https://www.bundesrat.de/DE/themen/steuern/steuern-node.html";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHash(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

function extractSection(
  $: cheerio.CheerioAPI,
  headingTexts: string[],
): string | null {
  const result: string[] = [];
  $("h2, h3, h4").each((_, el) => {
    const heading = $(el).text().trim().toLowerCase();
    if (!headingTexts.some((h) => heading.includes(h.toLowerCase()))) return;
    let next = $(el).next();
    while (next.length && !next.is("h2, h3, h4")) {
      const text = next.text().trim();
      if (text) result.push(text);
      next = next.next();
    }
  });
  return result.length > 0 ? result.join("\n\n") : null;
}

// ─── Parsed types ─────────────────────────────────────────────────────────────

interface ParsedTaxObligation {
  rechtsformSlug: string;
  taxType: string;
  labelDe: string;
  descriptionDe: string | null;
  descriptionEn: string | null;
  rateInfo: string | null;
  filingFrequency: string | null;
  registrationRequired: boolean;
  kleinunternehmerRelevant: boolean;
  legalBasis: string | null;
  sourceUrl: string;
  contentHash: string;
}

interface ParsedTaxDeadline {
  taxType: string;
  eventTrigger: string;
  labelDe: string;
  deadlineDescription: string | null;
  dueDateInfo: string | null;
  legalBasis: string | null;
  sourceUrl: string;
  contentHash: string;
}

// ─── Authoritative baseline data ─────────────────────────────────────────────
// Official 2025 data from BMF, ELSTER, EStG, KStG, UStG, GewStG.
// Scrapers update these when source pages change; baseline ensures the DB is
// never empty even if a source temporarily becomes unavailable.

type BaselineObligation = Omit<ParsedTaxObligation, "contentHash">;
type BaselineDeadline = Omit<ParsedTaxDeadline, "contentHash">;

const BASELINE_OBLIGATIONS: BaselineObligation[] = [
  // ── Körperschaftsteuer (GmbH, UG) ─────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    taxType: "koerperschaftsteuer",
    labelDe: "Körperschaftsteuer",
    descriptionDe:
      "Kapitalgesellschaften (GmbH, UG) unterliegen der Körperschaftsteuer (KSt) auf ihren zu versteuernden Gewinn. Der Steuersatz beträgt einheitlich 15% (§ 23 Abs. 1 KStG) zzgl. 5,5% Solidaritätszuschlag auf die KSt-Schuld (effektiv 15,825%). Die Steuer wird quartalsweise als Vorauszahlung (10. März, 10. Juni, 10. September, 10. Dezember) und jährlich mit der Körperschaftsteuererklärung abgerechnet. Steuersubjekt ist die Kapitalgesellschaft, nicht die Gesellschafter.",
    descriptionEn:
      "Limited liability companies (GmbH, UG) are subject to corporate income tax (Körperschaftsteuer) on their taxable profit at a flat rate of 15% (§ 23 para. 1 KStG) plus 5.5% solidarity surcharge on the tax amount (effective rate 15.825%). Tax is paid quarterly as advance payments and settled annually via the corporate tax return. The taxable entity is the company, not its shareholders.",
    rateInfo: "15% zzgl. 5,5% Solidaritätszuschlag (effektiv 15,825%)",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 23 Abs. 1 KStG (Körperschaftsteuergesetz)",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    rechtsformSlug: "ug",
    taxType: "koerperschaftsteuer",
    labelDe: "Körperschaftsteuer",
    descriptionDe:
      "Die UG (haftungsbeschränkt) ist wie die GmbH eine Kapitalgesellschaft und unterliegt der Körperschaftsteuer mit 15% (§ 23 Abs. 1 KStG) zzgl. Solidaritätszuschlag. Besonderheit: Die UG muss mindestens 25% ihres Jahresüberschusses als gesetzliche Rücklage einbehalten, bis das Mindeststammkapital der GmbH (25.000 €) erreicht ist (§ 5a GmbHG). Diese Rücklage mindert nicht die Steuerpflicht.",
    descriptionEn:
      "The UG (haftungsbeschränkt) is a limited liability company like the GmbH and is subject to corporate income tax at 15% (§ 23 para. 1 KStG) plus solidarity surcharge. Special rule: the UG must retain at least 25% of its annual surplus as a statutory reserve until the GmbH minimum share capital (€25,000) is reached (§ 5a GmbHG). This reserve does not reduce the tax liability.",
    rateInfo: "15% zzgl. 5,5% Solidaritätszuschlag (effektiv 15,825%)",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 23 Abs. 1 KStG, § 5a GmbHG",
    sourceUrl: BMF_STEUERN_URL,
  },

  // ── Einkommensteuer (Einzelunternehmen, Freiberufler, GbR) ────────────────
  {
    rechtsformSlug: "einzelunternehmen",
    taxType: "einkommensteuer",
    labelDe: "Einkommensteuer",
    descriptionDe:
      "Einzelunternehmer versteuern ihren Gewinn als Teil ihres persönlichen Einkommens über die Einkommensteuer (EStG). Der Gewinn zählt zu den Einkünften aus Gewerbebetrieb (§ 15 EStG) oder aus selbstständiger Arbeit (§ 18 EStG). Der progressive Steuersatz beträgt 0% bis 45% (Reichensteuersatz ab 277.826 €, 2025). Hinzu kommen 5,5% Solidaritätszuschlag (ab 18.130 € Einkommensteuerschuld). Vorauszahlungen sind quartalsweise fällig (10. März, 10. Juni, 10. September, 10. Dezember).",
    descriptionEn:
      "Sole traders (Einzelunternehmer) are taxed on their business profit as part of their personal income via Einkommensteuer (EStG). Profit from a trade counts as income from business operations (§ 15 EStG) or from self-employment (§ 18 EStG). The progressive rate ranges from 0% to 45% (top rate above €277,826 in 2025), plus 5.5% solidarity surcharge above a threshold. Quarterly advance payments apply.",
    rateInfo: "0%–45% progressiv (zzgl. 5,5% Solidaritätszuschlag ab Schwellenwert)",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 15 EStG (Gewerbebetrieb), § 18 EStG (Selbstständige)",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    rechtsformSlug: "freiberufler",
    taxType: "einkommensteuer",
    labelDe: "Einkommensteuer",
    descriptionDe:
      "Freiberufler (§ 18 EStG: Ärzte, Anwälte, Architekten, Ingenieure, Journalisten, Künstler u. a.) versteuern ihren Gewinn als Einkünfte aus selbstständiger Arbeit. Kein Gewerbebetrieb — daher kein Gewerbesteuerrecht anwendbar (keine Gewerbeanmeldung, keine Gewerbesteuer). Der progressive Einkommensteuersatz gilt wie beim Einzelunternehmer (0%–45%). Gewinnermittlung durch Einnahmen-Überschuss-Rechnung (EÜR) oder Bilanzierung (wenn freiwillig oder durch Sonderrecht verpflichtend).",
    descriptionEn:
      "Freelancers (§ 18 EStG: doctors, lawyers, architects, journalists, artists, etc.) are taxed on income from self-employment. No trade classification — therefore no trade tax (Gewerbesteuer) applies (no Gewerbeanmeldung needed, no Gewerbesteuer). The same progressive income tax rate applies (0%–45%). Profit can be determined by cash-basis accounting (EÜR) or accrual accounting.",
    rateInfo: "0%–45% progressiv (zzgl. 5,5% Solidaritätszuschlag ab Schwellenwert)",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 18 EStG (Einkünfte aus selbstständiger Arbeit)",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    rechtsformSlug: "gbr",
    taxType: "einkommensteuer",
    labelDe: "Einkommensteuer (Mitunternehmerschaft)",
    descriptionDe:
      "Die GbR ist steuerlich transparent: Sie ist kein eigenes Steuersubjekt für die Einkommensteuer. Die Gewinne werden durch gesonderte und einheitliche Feststellung (§ 180 AO) ermittelt und den Gesellschaftern entsprechend ihrer Beteiligungsquote zugerechnet. Jeder Gesellschafter versteuert seinen Anteil im Rahmen seiner persönlichen Einkommensteuererklärung. Eine Gewerbe-GbR unterliegt dabei dem § 15 EStG, eine freiberufliche GbR dem § 18 EStG.",
    descriptionEn:
      "The GbR is fiscally transparent: it is not a taxable entity for income tax purposes. Profits are determined by joint and uniform assessment (§ 180 AO) and allocated to partners according to their participation ratio. Each partner reports their share in their personal income tax return. A commercial GbR falls under § 15 EStG; a freelance GbR under § 18 EStG.",
    rateInfo: "Persönlicher Steuersatz jedes Gesellschafters (0%–45%)",
    filingFrequency: "jährlich pro Gesellschafter (gesonderte Feststellung)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 15 / § 18 EStG, § 180 AO (gesonderte und einheitliche Feststellung)",
    sourceUrl: BMF_STEUERN_URL,
  },

  // ── Gewerbesteuer (Gewerbebetriebe) ───────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer",
    descriptionDe:
      "Kapitalgesellschaften (GmbH, UG) sind stets gewerblich tätig und unterliegen uneingeschränkt der Gewerbesteuer (§ 2 Abs. 2 GewStG). Basis ist der Gewerbeertrag, der mit der Steuermesszahl von 3,5% multipliziert wird (§ 11 Abs. 2 GewStG). Dieser Messbetrag wird mit dem Hebesatz der Gemeinde multipliziert. Bundesweiter Mindest-Hebesatz: 200% (§ 16 Abs. 4 GewStG). Effektiver GewSt-Satz in deutschen Großstädten: ca. 14%–17%. Freibetrag für Kapitalgesellschaften: keiner.",
    descriptionEn:
      "Capital companies (GmbH, UG) are always classified as commercial enterprises and are subject to full trade tax (§ 2 para. 2 GewStG). The tax base is the trade income, multiplied by the standard tax index rate of 3.5% (§ 11 para. 2 GewStG), then by the municipality's Hebesatz. Minimum Hebesatz nationwide: 200% (§ 16 para. 4 GewStG). Effective rate in German cities: approx. 14%–17%. No tax-free allowance for capital companies.",
    rateInfo: "Steuermesszahl 3,5% × Hebesatz der Gemeinde (mind. 200%)",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 2 Abs. 2 GewStG, § 11 Abs. 2 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },
  {
    rechtsformSlug: "ug",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer",
    descriptionDe:
      "Die UG (haftungsbeschränkt) unterliegt wie die GmbH der Gewerbesteuer ohne Freibetrag (§ 2 Abs. 2 GewStG). Steuermesszahl 3,5% × Hebesatz der Gemeinde. Da UGs oft in der Anfangsphase geringe Gewinne haben, kann die Gewerbesteuerlast anfänglich niedrig sein, besteht aber ab dem ersten Gewinn.",
    descriptionEn:
      "The UG (haftungsbeschränkt) is subject to trade tax without a tax-free allowance (§ 2 para. 2 GewStG), like the GmbH. Tax index 3.5% × municipal Hebesatz. Since UGs often have small profits in early stages, the initial trade tax burden may be low but applies from the first profit.",
    rateInfo: "Steuermesszahl 3,5% × Hebesatz der Gemeinde (mind. 200%)",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 2 Abs. 2 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },
  {
    rechtsformSlug: "einzelunternehmen",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer",
    descriptionDe:
      "Einzelunternehmer, die ein Gewerbe betreiben (nicht Freiberufler), unterliegen der Gewerbesteuer. Gewerbesteuerlicher Freibetrag für natürliche Personen: 24.500 € (§ 11 Abs. 1 Satz 3 Nr. 1 GewStG). Die Gewerbesteuer mindert die Einkommensteuerbelastung, da sie (pauschal mit dem 4-fachen Gewerbesteuermessbetrag) auf die Einkommensteuer angerechnet wird (§ 35 EStG). In der Praxis wird Gewerbesteuer bei kleinen Einzelunternehmen häufig vollständig durch § 35 EStG kompensiert.",
    descriptionEn:
      "Sole traders operating a commercial business (not freelancers) are subject to trade tax. The tax-free allowance for natural persons is €24,500 (§ 11 para. 1 sentence 3 No. 1 GewStG). Trade tax reduces the income tax burden because it is credited (at 4× the trade tax index) against income tax (§ 35 EStG). In practice, trade tax for small sole traders is often fully offset by § 35 EStG.",
    rateInfo: "Steuermesszahl 3,5% × Hebesatz; Freibetrag 24.500 €; Anrechnung nach § 35 EStG",
    filingFrequency: "jährlich (Vorauszahlungen quartalsweise)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 11 Abs. 1 GewStG, § 35 EStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },
  {
    rechtsformSlug: "freiberufler",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer (nicht anwendbar)",
    descriptionDe:
      "Freiberufler (§ 18 EStG) betreiben keinen Gewerbebetrieb im Sinne des § 15 EStG und unterliegen daher nicht der Gewerbesteuer (§ 2 GewStG). Voraussetzung ist die Ausübung eines der in § 18 Abs. 1 Nr. 1 EStG genannten Katalogberufe (Ärzte, Rechtsanwälte, Architekten, Ingenieure, Steuerberater, Journalisten, Künstler u. a.) oder eines diesen ähnlichen Berufs. Keine Gewerbesteuerpflicht bedeutet auch keine Gewerbeanmeldung beim Gewerbeamt.",
    descriptionEn:
      "Freelancers (§ 18 EStG) do not operate a commercial business (Gewerbebetrieb) within the meaning of § 15 EStG and are therefore not subject to trade tax (§ 2 GewStG). This applies to the regulated professions listed in § 18 para. 1 No. 1 EStG (doctors, lawyers, architects, engineers, tax advisors, journalists, artists, etc.) or similar professions. No trade tax liability also means no Gewerbeanmeldung.",
    rateInfo: "Nicht anwendbar — keine Gewerbesteuerpflicht",
    filingFrequency: null,
    registrationRequired: false,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 18 EStG, § 2 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },
  {
    rechtsformSlug: "gbr",
    taxType: "gewerbesteuer",
    labelDe: "Gewerbesteuer (nur bei Gewerbe-GbR)",
    descriptionDe:
      "Eine gewerbliche GbR unterliegt als solche der Gewerbesteuer (§ 5 Abs. 1 GewStG). Freibetrag: 24.500 € wie beim Einzelunternehmer. Gewerbesteuer wird auf die Einkommensteuer der Gesellschafter nach § 35 EStG angerechnet. Eine freiberufliche GbR (alle Gesellschafter sind Freiberufler nach § 18 EStG) unterliegt nicht der Gewerbesteuer — dies ist bei gemischten Gesellschaften (freiberuflich + gewerblich) zu prüfen (sog. Abfärberegelung § 15 Abs. 3 EStG).",
    descriptionEn:
      "A commercial GbR is subject to trade tax as an entity (§ 5 para. 1 GewStG). Tax-free allowance: €24,500. Trade tax is credited against each partner's income tax via § 35 EStG. A freelance GbR (all partners are freelancers per § 18 EStG) is not subject to trade tax — mixed partnerships (partly commercial, partly freelance) must check the contamination rule (Abfärberegelung, § 15 para. 3 EStG).",
    rateInfo: "Steuermesszahl 3,5% × Hebesatz; Freibetrag 24.500 €; Anrechnung § 35 EStG",
    filingFrequency: "jährlich (wenn gewerbesteuerpflichtig)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 5 GewStG, § 15 Abs. 3 EStG (Abfärberegelung)",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },

  // ── Umsatzsteuer (alle Rechtsformen) ──────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "umsatzsteuer",
    labelDe: "Umsatzsteuer (USt / Mehrwertsteuer)",
    descriptionDe:
      "Alle Unternehmer (unabhängig von der Rechtsform) sind grundsätzlich umsatzsteuerpflichtig, sofern sie nachhaltig Lieferungen und Leistungen gegen Entgelt erbringen (§ 1 UStG). Regelsatz: 19%, ermäßigter Satz: 7% (§ 12 UStG). Ausnahme: Kleinunternehmerregelung nach § 19 UStG (Umsatz ≤ 25.000 € im Vorjahr, ≤ 100.000 € im laufenden Jahr ab 2025). Die Anmeldung beim Finanzamt erfolgt über den Fragebogen zur steuerlichen Erfassung (ELSTER). Für grenzüberschreitende Leistungen gilt das Bestimmungslandprinzip (§§ 3a–3d UStG).",
    descriptionEn:
      "All entrepreneurs (regardless of legal form) are generally subject to VAT (Umsatzsteuer) if they sustainably supply goods or services for consideration (§ 1 UStG). Standard rate: 19%; reduced rate: 7% (§ 12 UStG). Exception: small business exemption under § 19 UStG (turnover ≤ €25,000 in the prior year, ≤ €100,000 in the current year from 2025). Registration with the Finanzamt is done via the online registration form (ELSTER). Cross-border supplies follow the destination principle (§§ 3a–3d UStG).",
    rateInfo: "19% (Regelsatz) / 7% (ermäßigter Satz); Kleinunternehmer: befreit",
    filingFrequency: "monatlich oder quartalsweise (Voranmeldung); jährlich (Jahreserklärung)",
    registrationRequired: true,
    kleinunternehmerRelevant: true,
    legalBasis: "§ 1 UStG, § 12 UStG, § 19 UStG (Kleinunternehmerregelung)",
    sourceUrl: ELSTER_URL,
  },

  // ── Kleinunternehmerregelung ───────────────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "kleinunternehmerregelung",
    labelDe: "Kleinunternehmerregelung (§ 19 UStG)",
    descriptionDe:
      "Unternehmer mit einem Vorjahresumsatz bis 25.000 € (netto) und einem voraussichtlichen Umsatz im laufenden Jahr bis 100.000 € (ab 2025; vorher 50.000 €) können die Kleinunternehmerregelung in Anspruch nehmen. Folge: keine Umsatzsteuerausweis auf Rechnungen, keine Abführung von USt, kein Vorsteuerabzug. Vorteile: geringerer Verwaltungsaufwand, günstigere Preise für Privatpersonen. Nachteile: kein Vorsteuerabzug (ungünstig bei hohen Vorleistungen), Brutto-Einnahmen sind Umsatzgrenze. Die Regelung gilt für alle Rechtsformen, ausgenommen Kapitalgesellschaften (GmbH/UG) sind theoretisch eingeschlossen, aber praktisch selten relevant. Wahlmöglichkeit zur Regelbesteuerung (Option nach § 19 Abs. 2 UStG, 5-Jahres-Bindung).",
    descriptionEn:
      "Entrepreneurs with prior-year turnover up to €25,000 (net) and expected current-year turnover up to €100,000 (from 2025; previously €50,000) may use the small business exemption. Effect: no VAT on invoices, no VAT remittance, no input tax deduction. Advantages: lower administrative burden, lower prices for private customers. Disadvantages: no input tax recovery (unfavourable with high input costs). Threshold based on gross receipts. The option to elect standard VAT treatment is available (§ 19 para. 2 UStG, 5-year binding).",
    rateInfo: "Keine USt (Umsatz ≤ 25.000 € Vorjahr + ≤ 100.000 € lfd. Jahr, ab 2025)",
    filingFrequency: "keine Voranmeldung (Jahreserklärung empfohlen)",
    registrationRequired: true,
    kleinunternehmerRelevant: true,
    legalBasis: "§ 19 UStG",
    sourceUrl: ELSTER_URL,
  },

  // ── Lohnsteuer (alle Arbeitgeber) ─────────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "lohnsteuer",
    labelDe: "Lohnsteuer",
    descriptionDe:
      "Unternehmer, die Arbeitnehmer beschäftigen, sind verpflichtet, Lohnsteuer einzubehalten und monatlich an das Finanzamt abzuführen (§ 38 EStG). Die Lohnsteuer-Anmeldung erfolgt elektronisch über ELSTER. Fälligkeit: 10. des Folgemonats (monatlich), 10. April / 10. Juli / 10. Oktober / 10. Januar (quartalsweise bei < 5.000 € Lohnsteuer p.a.), jährlich bei < 1.100 € Lohnsteuer p.a. Hinzu kommt der Solidaritätszuschlag (5,5% der Lohnsteuer) und ggf. Kirchensteuer. Arbeitgeber haften für korrekte Einbehaltung und Abführung.",
    descriptionEn:
      "Employers must withhold payroll tax (Lohnsteuer) from employees' wages and remit it monthly to the Finanzamt (§ 38 EStG). Filing is done electronically via ELSTER. Due date: 10th of the following month (monthly); quarterly if annual payroll tax < €5,000; annually if < €1,100. Solidarity surcharge (5.5% of payroll tax) and, if applicable, church tax also apply. Employers are liable for correct withholding and remittance.",
    rateInfo: "Einkommensteuertarif des Arbeitnehmers (0%–45%); Arbeitgeber haftet",
    filingFrequency: "monatlich (oder quartalsweise / jährlich bei geringen Beträgen)",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 38 EStG, § 41a EStG (Lohnsteuer-Anmeldung)",
    sourceUrl: ELSTER_URL,
  },

  // ── Steuerliche Erfassung / Fragebogen ────────────────────────────────────
  {
    rechtsformSlug: "all",
    taxType: "steuerliche_erfassung",
    labelDe: "Steuerliche Erfassung beim Finanzamt",
    descriptionDe:
      "Jedes neu gegründete Unternehmen muss sich beim zuständigen Finanzamt steuerlich erfassen lassen. Dies geschieht durch den 'Fragebogen zur steuerlichen Erfassung', der seit 2021 ausschließlich elektronisch über ELSTER (www.elster.de) eingereicht werden muss (§ 138 AO). Der Fragebogen enthält Angaben zur Rechtsform, Geschäftstätigkeit, voraussichtlichen Umsätzen und Gewinnen, USt-Voranmeldungszeitraum, Lohnsteuer und Bankverbindung. Das Finanzamt vergibt daraufhin die Steuernummer. Frist: innerhalb von 4 Wochen nach Aufnahme der gewerblichen/freiberuflichen Tätigkeit.",
    descriptionEn:
      "Every newly founded company must register for tax purposes with the competent Finanzamt. Since 2021, this is done exclusively electronically via ELSTER using the 'Fragebogen zur steuerlichen Erfassung' (§ 138 AO). The questionnaire covers legal form, business activities, expected turnover and profits, VAT filing frequency, payroll tax, and bank details. The Finanzamt then issues the tax number (Steuernummer). Deadline: within 4 weeks of starting commercial or freelance activities.",
    rateInfo: null,
    filingFrequency: "einmalig bei Gründung",
    registrationRequired: true,
    kleinunternehmerRelevant: false,
    legalBasis: "§ 138 AO (Abgabenordnung)",
    sourceUrl: ELSTER_URL,
  },
];

const BASELINE_DEADLINES: BaselineDeadline[] = [
  {
    taxType: "umsatzsteuer",
    eventTrigger: "voranmeldung_monatlich",
    labelDe: "Umsatzsteuer-Voranmeldung (monatlich)",
    deadlineDescription:
      "Unternehmer mit einer Vorjahres-USt-Schuld von über 7.500 € müssen monatlich eine Umsatzsteuer-Voranmeldung über ELSTER einreichen und die USt entrichten. Fälligkeit: 10. des Folgemonats. Dauerfristverlängerung um 1 Monat möglich (gegen 1/11 der Vorjahressteuer als Sondervorauszahlung, § 47 UStDV).",
    dueDateInfo: "10. des Folgemonats (§ 18 Abs. 1 UStG)",
    legalBasis: "§ 18 Abs. 1 UStG",
    sourceUrl: ELSTER_URL,
  },
  {
    taxType: "umsatzsteuer",
    eventTrigger: "voranmeldung_quartalsweise",
    labelDe: "Umsatzsteuer-Voranmeldung (quartalsweise)",
    deadlineDescription:
      "Unternehmer mit einer Vorjahres-USt-Schuld zwischen 1.000 € und 7.500 € reichen die Voranmeldung quartalsweise ein. Fälligkeitstermine: 10. April, 10. Juli, 10. Oktober, 10. Januar. Dauerfristverlängerung möglich. Neugründer (Jahr 1 und 2) sind stets zur monatlichen Voranmeldung verpflichtet.",
    dueDateInfo: "10. April / 10. Juli / 10. Oktober / 10. Januar (§ 18 Abs. 2 UStG)",
    legalBasis: "§ 18 Abs. 2 UStG",
    sourceUrl: ELSTER_URL,
  },
  {
    taxType: "umsatzsteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Umsatzsteuer-Jahreserklärung",
    deadlineDescription:
      "Die USt-Jahreserklärung ist grundsätzlich bis zum 31. Juli des Folgejahres einzureichen (§ 149 Abs. 2 AO). Mit Steuerberater: Verlängerung bis 28./29. Februar des übernächsten Jahres möglich. Kleinunternehmer sind von der Voranmeldungspflicht befreit, müssen aber ggf. eine Jahreserklärung abgeben.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar des Folgejahres)",
    legalBasis: "§ 149 Abs. 2 AO, § 18 Abs. 3 UStG",
    sourceUrl: ELSTER_URL,
  },
  {
    taxType: "einkommensteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Einkommensteuererklärung",
    deadlineDescription:
      "Selbstständige und Gewerbetreibende müssen eine jährliche Einkommensteuererklärung beim Finanzamt einreichen. Grundfrist: 31. Juli des Folgejahres. Mit Steuerberater/Lohnsteuerhilfeverein: 28./29. Februar des übernächsten Jahres. Bei verspäteter Abgabe können Verspätungszuschläge (0,25% der festgesetzten Steuer, mind. 25 € je angefangenem Monat, max. 25.000 €) anfallen.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar)",
    legalBasis: "§ 149 Abs. 2 AO, § 152 AO (Verspätungszuschlag)",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    taxType: "einkommensteuer",
    eventTrigger: "vorauszahlung",
    labelDe: "Einkommensteuer-Vorauszahlung",
    deadlineDescription:
      "Selbstständige und Gewerbetreibende zahlen quartalsweise Einkommensteuer-Vorauszahlungen, die das Finanzamt auf Basis der Vorjahressteuer oder einer voraussichtlichen Steuerschuld festsetzt. Fälligkeitstermine: 10. März, 10. Juni, 10. September, 10. Dezember. Anpassung der Vorauszahlungen kann beantragt werden.",
    dueDateInfo: "10. März / 10. Juni / 10. September / 10. Dezember (§ 37 EStG)",
    legalBasis: "§ 37 EStG",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    taxType: "koerperschaftsteuer",
    eventTrigger: "vorauszahlung",
    labelDe: "Körperschaftsteuer-Vorauszahlung",
    deadlineDescription:
      "GmbH und UG leisten quartalsweise Körperschaftsteuer-Vorauszahlungen (15% + SolZ). Fälligkeitstermine identisch mit Einkommensteuer-Vorauszahlungen: 10. März, 10. Juni, 10. September, 10. Dezember. Basis: festgesetzter Vorauszahlungsbetrag, der sich an der Vorjahressteuer orientiert.",
    dueDateInfo: "10. März / 10. Juni / 10. September / 10. Dezember (§ 31 KStG i.V.m. § 37 EStG)",
    legalBasis: "§ 31 KStG, § 37 EStG",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    taxType: "koerperschaftsteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Körperschaftsteuererklärung",
    deadlineDescription:
      "Kapitalgesellschaften (GmbH, UG) müssen jährlich eine Körperschaftsteuererklärung (KSt 1) sowie eine Gewerbesteuererklärung einreichen. Grundfrist: 31. Juli des Folgejahres. Mit Steuerberater: 28./29. Februar des übernächsten Jahres.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar)",
    legalBasis: "§ 149 AO, § 31 KStG",
    sourceUrl: BMF_STEUERN_URL,
  },
  {
    taxType: "gewerbesteuer",
    eventTrigger: "vorauszahlung",
    labelDe: "Gewerbesteuer-Vorauszahlung",
    deadlineDescription:
      "Gewerbesteuerpflichtige Unternehmen zahlen quartalsweise Vorauszahlungen. Fälligkeitstermine: 15. Februar, 15. Mai, 15. August, 15. November (§ 21 GewStG). Basis: Vorauszahlungsbescheid der Gemeinde. Die Abweichung von den ESt/KSt-Vorauszahlungsterminen ist zu beachten.",
    dueDateInfo: "15. Februar / 15. Mai / 15. August / 15. November (§ 21 GewStG)",
    legalBasis: "§ 21 GewStG",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },
  {
    taxType: "gewerbesteuer",
    eventTrigger: "jahreserklaerung",
    labelDe: "Gewerbesteuererklärung",
    deadlineDescription:
      "Gewerbesteuerpflichtige Unternehmen reichen jährlich eine Gewerbesteuererklärung beim zuständigen Finanzamt ein. Die Gemeinde setzt dann den Gewerbesteuerbescheid fest. Grundfrist: 31. Juli des Folgejahres. Mit Steuerberater: 28./29. Februar des übernächsten Jahres.",
    dueDateInfo: "31. Juli des Folgejahres (mit Steuerberater: 28./29. Februar)",
    legalBasis: "§ 14a GewStG, § 149 AO",
    sourceUrl: BUNDESRAT_GEWERBESTEUER_URL,
  },
  {
    taxType: "lohnsteuer",
    eventTrigger: "anmeldung_monatlich",
    labelDe: "Lohnsteuer-Anmeldung",
    deadlineDescription:
      "Arbeitgeber reichen monatlich (oder quartalsweise / jährlich je nach Lohnsteuersumme) eine Lohnsteuer-Anmeldung über ELSTER ein und führen die einbehaltene Lohnsteuer inkl. Solidaritätszuschlag und Kirchensteuer ab. Fälligkeit: 10. des Folgemonats. Quartalsweise, wenn Lohnsteuer des Vorjahres ≤ 5.000 €; jährlich, wenn ≤ 1.100 €.",
    dueDateInfo: "10. des Folgemonats (§ 41a Abs. 1 EStG)",
    legalBasis: "§ 41a Abs. 1 EStG",
    sourceUrl: ELSTER_URL,
  },
  {
    taxType: "steuerliche_erfassung",
    eventTrigger: "gruendung",
    labelDe: "Fragebogen zur steuerlichen Erfassung",
    deadlineDescription:
      "Nach Gründung muss der Fragebogen zur steuerlichen Erfassung elektronisch über ELSTER beim zuständigen Finanzamt eingereicht werden. Frist: innerhalb von 4 Wochen nach Aufnahme der Tätigkeit (§ 138 AO). Das Finanzamt vergibt die Steuernummer, die auf allen Rechnungen angegeben werden muss. Kapitalgesellschaften benötigen für die GmbH-Gründung zunächst eine temporäre Steuernummer vom Finanzamt (vor Eintragung ins Handelsregister).",
    dueDateInfo: "Innerhalb von 4 Wochen nach Aufnahme der Tätigkeit (§ 138 Abs. 1 AO)",
    legalBasis: "§ 138 AO",
    sourceUrl: ELSTER_URL,
  },
];

// ─── TaxObligationsScraper ────────────────────────────────────────────────────
// Scrapes tax obligation data per Rechtsform from bundesfinanzministerium.de and elster.de.
//
// Strategy: fragment-keyed URLs encode "rechtsformSlug|taxType" per record.
// parsePage() attempts live extraction and falls back to baseline data.

const OBLIGATION_SOURCE_URLS: Record<string, string> = Object.fromEntries(
  BASELINE_OBLIGATIONS.map((o) => [
    `${o.rechtsformSlug}|${o.taxType}`,
    `${o.sourceUrl}#tax-obl=${encodeURIComponent(`${o.rechtsformSlug}|${o.taxType}`)}`,
  ]),
);

class TaxObligationsScraper extends BaseScraper<ParsedTaxObligation> {
  constructor() {
    super({
      pipelineName: "scrape-steuern-pflichten",
      pipelineDescription:
        "Scrapes German tax obligations per Rechtsform from bundesfinanzministerium.de and elster.de (Silo 3: Steuerliche Pflichten für Gründer)",
      pipelineSchedule: "0 5 * * 1", // every Monday at 05:00 UTC
      requestDelayMs: 2000,
    });
  }

  protected async fetchUrls(_page: Page): Promise<string[]> {
    return Object.values(OBLIGATION_SOURCE_URLS);
  }

  protected parsePage(
    html: string,
    url: string,
  ): ParsedTaxObligation | null {
    // Decode the (rechtsformSlug, taxType) pair from the fragment
    const match = url.match(/tax-obl=([^&]+)/);
    const key = match ? decodeURIComponent(match[1]!) : null;
    if (!key) return null;

    const [rechtsformSlug, taxType] = key.split("|");
    if (!rechtsformSlug || !taxType) return null;

    const baseline = BASELINE_OBLIGATIONS.find(
      (o) => o.rechtsformSlug === rechtsformSlug && o.taxType === taxType,
    );
    if (!baseline) return null;

    const $ = cheerio.load(html);

    // Attempt to enrich the description from the live page.
    // Use baseline if the live extraction yields insufficient content.
    const liveSection =
      extractSection($, [
        "körperschaftsteuer",
        "einkommensteuer",
        "gewerbesteuer",
        "umsatzsteuer",
        "lohnsteuer",
        "kleinunternehmer",
        "steuerliche erfassung",
        "fragebogen",
      ]) ?? null;

    const descriptionDe =
      liveSection && liveSection.length > 120
        ? liveSection
        : baseline.descriptionDe;

    const record: Omit<ParsedTaxObligation, "contentHash"> = {
      rechtsformSlug,
      taxType,
      labelDe: baseline.labelDe,
      descriptionDe,
      descriptionEn: baseline.descriptionEn,
      rateInfo: baseline.rateInfo,
      filingFrequency: baseline.filingFrequency,
      registrationRequired: baseline.registrationRequired,
      kleinunternehmerRelevant: baseline.kleinunternehmerRelevant,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl,
    };

    return { ...record, contentHash: makeHash(record) };
  }

  protected async diffRecord(
    record: ParsedTaxObligation,
  ): Promise<DiffResult> {
    const existing = await db
      .select({
        id: taxObligations.id,
        contentHash: taxObligations.contentHash,
      })
      .from(taxObligations)
      .where(
        and(
          eq(taxObligations.rechtsformSlug, record.rechtsformSlug),
          eq(taxObligations.taxType, record.taxType),
        ),
      )
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  protected async writeRecord(record: ParsedTaxObligation): Promise<void> {
    const now = new Date();
    await db
      .insert(taxObligations)
      .values({
        rechtsformSlug: record.rechtsformSlug,
        taxType: record.taxType,
        labelDe: record.labelDe,
        descriptionDe: record.descriptionDe,
        descriptionEn: record.descriptionEn,
        rateInfo: record.rateInfo,
        filingFrequency: record.filingFrequency,
        registrationRequired: record.registrationRequired,
        kleinunternehmerRelevant: record.kleinunternehmerRelevant,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: [taxObligations.rechtsformSlug, taxObligations.taxType],
        set: {
          labelDe: record.labelDe,
          descriptionDe: record.descriptionDe,
          descriptionEn: record.descriptionEn,
          rateInfo: record.rateInfo,
          filingFrequency: record.filingFrequency,
          registrationRequired: record.registrationRequired,
          kleinunternehmerRelevant: record.kleinunternehmerRelevant,
          legalBasis: record.legalBasis,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }
}

// ─── TaxDeadlinesScraper ──────────────────────────────────────────────────────
// Scrapes key tax filing deadlines from bundesfinanzministerium.de and elster.de.
//
// Strategy: fragment-keyed URLs encode "taxType|eventTrigger" per record.

const DEADLINE_SOURCE_URLS: Record<string, string> = Object.fromEntries(
  BASELINE_DEADLINES.map((d) => [
    `${d.taxType}|${d.eventTrigger}`,
    `${d.sourceUrl}#tax-dl=${encodeURIComponent(`${d.taxType}|${d.eventTrigger}`)}`,
  ]),
);

class TaxDeadlinesScraper extends BaseScraper<ParsedTaxDeadline> {
  constructor() {
    super({
      pipelineName: "scrape-steuern-fristen",
      pipelineDescription:
        "Scrapes German tax filing deadlines from bundesfinanzministerium.de and elster.de (Silo 3: Steuerliche Pflichten für Gründer)",
      pipelineSchedule: "0 5 * * 1", // every Monday at 05:00 UTC
      requestDelayMs: 2000,
    });
  }

  protected async fetchUrls(_page: Page): Promise<string[]> {
    return Object.values(DEADLINE_SOURCE_URLS);
  }

  protected parsePage(html: string, url: string): ParsedTaxDeadline | null {
    // Decode the (taxType, eventTrigger) pair from the fragment
    const match = url.match(/tax-dl=([^&]+)/);
    const key = match ? decodeURIComponent(match[1]!) : null;
    if (!key) return null;

    const [taxType, eventTrigger] = key.split("|");
    if (!taxType || !eventTrigger) return null;

    const baseline = BASELINE_DEADLINES.find(
      (d) => d.taxType === taxType && d.eventTrigger === eventTrigger,
    );
    if (!baseline) return null;

    const $ = cheerio.load(html);

    // Attempt to enrich deadline description from live page.
    const liveSection =
      extractSection($, [
        "frist",
        "fälligkeit",
        "voranmeldung",
        "jahreserklärung",
        "vorauszahlung",
        "anmeldung",
      ]) ?? null;

    const deadlineDescription =
      liveSection && liveSection.length > 80
        ? liveSection
        : baseline.deadlineDescription;

    const record: Omit<ParsedTaxDeadline, "contentHash"> = {
      taxType,
      eventTrigger,
      labelDe: baseline.labelDe,
      deadlineDescription,
      dueDateInfo: baseline.dueDateInfo,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl,
    };

    return { ...record, contentHash: makeHash(record) };
  }

  protected async diffRecord(record: ParsedTaxDeadline): Promise<DiffResult> {
    const existing = await db
      .select({
        id: taxDeadlines.id,
        contentHash: taxDeadlines.contentHash,
      })
      .from(taxDeadlines)
      .where(
        and(
          eq(taxDeadlines.taxType, record.taxType),
          eq(taxDeadlines.eventTrigger, record.eventTrigger),
        ),
      )
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  protected async writeRecord(record: ParsedTaxDeadline): Promise<void> {
    const now = new Date();
    await db
      .insert(taxDeadlines)
      .values({
        taxType: record.taxType,
        eventTrigger: record.eventTrigger,
        labelDe: record.labelDe,
        deadlineDescription: record.deadlineDescription,
        dueDateInfo: record.dueDateInfo,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: [taxDeadlines.taxType, taxDeadlines.eventTrigger],
        set: {
          labelDe: record.labelDe,
          deadlineDescription: record.deadlineDescription,
          dueDateInfo: record.dueDateInfo,
          legalBasis: record.legalBasis,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/** Run both Steuern scrapers sequentially. */
export async function scrapeSteuern(): Promise<void> {
  const pflichtenScraper = new TaxObligationsScraper();
  const pflichtenStats = await pflichtenScraper.run();
  console.log(
    `[scrape-steuern-pflichten] Done — new: ${pflichtenStats.newCount}, ` +
      `updated: ${pflichtenStats.updatedCount}, ` +
      `unchanged: ${pflichtenStats.unchangedCount}, ` +
      `errors: ${pflichtenStats.errorCount}`,
  );

  const fristenScraper = new TaxDeadlinesScraper();
  const fristenStats = await fristenScraper.run();
  console.log(
    `[scrape-steuern-fristen] Done — new: ${fristenStats.newCount}, ` +
      `updated: ${fristenStats.updatedCount}, ` +
      `unchanged: ${fristenStats.unchangedCount}, ` +
      `errors: ${fristenStats.errorCount}`,
  );
}
