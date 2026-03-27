// Silo 6 scraper: Handelsregister & Notarpflichten für Gründer (DAT-39)
//
// Scrapes trade register obligations and notary requirements relevant to German
// business founders, broken down by Rechtsform (GmbH, UG, AG, OHG, KG, GbR,
// Einzelunternehmen) and act type for notary costs.
//
// Primary sources per data type:
//
//   Trade register obligations (Eintragungspflicht, Eintragungsinhalt, Fristen):
//   - handelsregister.de — Official German trade register portal (BMJ); primary
//     authority for registration procedures and mandatory content
//   - bmj.bund.de — Bundesministerium der Justiz; GmbHG, AktG, HGB legal basis
//   - registerportal.de — Official portal for Amtsgericht registration procedures
//
//   Notary requirements and costs (Notarpflicht, GNotKG):
//   - bundesnotarkammer.de — Federal Chamber of Notaries; primary authority for
//     notary requirements, GNotKG fee tables, and cost examples
//
// Strategy: fragment-keyed URLs encode (rechtsformSlug, obligationType) per
// hr_obligations record and actType per notary_costs record. parsePage()
// attempts live extraction and falls back to authoritative baseline data when
// government page structure changes.

import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { db, hrObligations, notaryCosts } from "@dataforge/db";
import { and, eq } from "drizzle-orm";
import { BaseScraper, type DiffResult } from "../lib/base-scraper.js";
import type { Page } from "playwright";

// ─── Source URLs ──────────────────────────────────────────────────────────────

// handelsregister.de — Official German trade register portal operated by the
// Bundesministerium der Justiz. Primary authority for HR registration procedures.
const HR_PORTAL_URL = "https://www.handelsregister.de/rp_web/search.do";

// bundesnotarkammer.de — Federal Chamber of Notaries. Primary authority for
// notary requirements and GNotKG fee information.
const BNK_COSTS_URL =
  "https://www.bundesnotarkammer.de/notare/notarkosten";

// bmj.bund.de — Bundesministerium der Justiz. Primary legal source for
// GmbHG, AktG, and HGB as applied to Handelsregister obligations.
const BMJ_GMBHG_URL =
  "https://www.bmj.bund.de/DE/Themen/RechtundGesetze/Gesellschaftsrecht/Gesellschaftsrecht_node.html";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeHash(data: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// ─── Parsed types ─────────────────────────────────────────────────────────────

interface ParsedHrObligation {
  rechtsformSlug: string;
  obligationType: string;
  labelDe: string;
  descriptionDe: string;
  descriptionEn: string | null;
  isMandatory: boolean;
  legalBasis: string | null;
  sourceUrl: string;
  contentHash: string;
}

interface ParsedNotaryCost {
  actType: string;
  labelDe: string;
  costBasis: string | null;
  exampleCostEur: string | null;
  notes: string | null;
  legalBasis: string | null;
  sourceUrl: string;
  contentHash: string;
}

// ─── Authoritative baseline data ─────────────────────────────────────────────
// Official 2025 data from BMJ, BNotK, GmbHG, AktG, HGB, GNotKG.
// Scrapers update these when source pages change; baseline ensures the DB is
// never empty even if a source temporarily becomes unavailable.

type BaselineObligation = Omit<ParsedHrObligation, "contentHash">;
type BaselineNotaryCost = Omit<ParsedNotaryCost, "contentHash">;

const BASELINE_OBLIGATIONS: BaselineObligation[] = [
  // ── Eintragungspflicht ────────────────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht GmbH",
    descriptionDe:
      "Die GmbH entsteht als juristische Person erst mit Eintragung in das Handelsregister (§ 11 Abs. 1 GmbHG). Vor der Eintragung haftet die Vorgesellschaft (Vor-GmbH) als solche; die Gründer haften persönlich für Verbindlichkeiten der Vor-GmbH. Die Anmeldung muss notariell beglaubigt beim zuständigen Amtsgericht (Registergericht) eingereicht werden. Das Stammkapital muss bei Anmeldung mindestens zur Hälfte (12.500 €) eingezahlt sein.",
    descriptionEn:
      "The GmbH only becomes a legal entity upon entry in the commercial register (§ 11 para. 1 GmbHG). Before registration, the pre-company (Vor-GmbH) exists; founders are personally liable for its obligations. The application must be notarially authenticated and submitted to the competent local court (Registergericht). At least half the share capital (€12,500) must be paid up at the time of application.",
    isMandatory: true,
    legalBasis: "§ 7 GmbHG, § 11 GmbHG",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "ug",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht UG (haftungsbeschränkt)",
    descriptionDe:
      "Die UG (haftungsbeschränkt) ist eine Variante der GmbH (§ 5a GmbHG) und unterliegt denselben Eintragungspflichten. Sie entsteht ebenfalls erst mit HR-Eintragung. Mindest-Stammkapital: 1 €. Das Wort 'Unternehmergesellschaft (haftungsbeschränkt)' oder die Abkürzung 'UG (haftungsbeschränkt)' muss zwingend im Namen erscheinen. Rücklagenpflicht: 25% des Jahresüberschusses bis zum Erreichen von 25.000 € Stammkapital.",
    descriptionEn:
      "The UG (haftungsbeschränkt) is a variant of the GmbH (§ 5a GmbHG) and is subject to the same registration obligations. It also only comes into existence upon HR registration. Minimum share capital: €1. The name must include 'Unternehmergesellschaft (haftungsbeschränkt)' or 'UG (haftungsbeschränkt)'. Mandatory reserve: 25% of annual surplus until €25,000 share capital is reached.",
    isMandatory: true,
    legalBasis: "§ 5a GmbHG, § 7 GmbHG",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "ag",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht AG",
    descriptionDe:
      "Die AG entsteht als juristische Person erst mit Eintragung in das Handelsregister (§ 41 AktG). Mindest-Grundkapital: 50.000 € (§ 7 AktG). Vor der Eintragung besteht eine Vorgesellschaft; der Vorstand haftet persönlich für vor Eintragung eingegangene Verbindlichkeiten. Die Anmeldung erfolgt durch den Vorstand und Aufsichtsrat beim Registergericht und bedarf notarieller Beglaubigung.",
    descriptionEn:
      "The AG only becomes a legal entity upon entry in the commercial register (§ 41 AktG). Minimum share capital: €50,000 (§ 7 AktG). Before registration, a pre-company exists; the board of directors is personally liable for obligations incurred before registration. The application is filed by the board and supervisory board with the registration court and requires notarial authentication.",
    isMandatory: true,
    legalBasis: "§ 36 AktG, § 41 AktG, § 7 AktG",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "ohg",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht OHG",
    descriptionDe:
      "Die OHG (Offene Handelsgesellschaft) entsteht im Innenverhältnis mit Abschluss des Gesellschaftsvertrags, im Außenverhältnis (als Kaufmann gegenüber Dritten) aber erst mit Eintragung in das Handelsregister (§ 123 Abs. 1 HGB). Betreibt die OHG ein Handelsgewerbe, ist die Eintragung Pflicht (§ 106 HGB). Die Haftung der Gesellschafter ist persönlich und unbeschränkt (§ 128 HGB).",
    descriptionEn:
      "The OHG (general partnership) is formed internally upon signing the partnership agreement, but only becomes effective externally (as a merchant vis-à-vis third parties) upon registration in the commercial register (§ 123 para. 1 HGB). If the OHG operates a commercial enterprise, registration is mandatory (§ 106 HGB). Partners are personally and unlimitedly liable (§ 128 HGB).",
    isMandatory: true,
    legalBasis: "§ 106 HGB, § 123 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "kg",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht KG",
    descriptionDe:
      "Die KG (Kommanditgesellschaft) ist nach §§ 161 ff. HGB im Handelsregister einzutragen. Die KG entsteht im Außenverhältnis mit der HR-Eintragung (§ 162 Abs. 1 HGB). Komplementäre haften unbeschränkt persönlich; Kommanditisten nur bis zur Höhe ihrer Einlage. Die Haftungsbeschränkung des Kommanditisten wirkt erst mit Eintragung seiner Haftsumme im Handelsregister.",
    descriptionEn:
      "The KG (limited partnership) must be registered in the commercial register under §§ 161 ff. HGB. The KG becomes effective externally upon registration (§ 162 para. 1 HGB). General partners (Komplementäre) are personally liable without limit; limited partners (Kommanditisten) only up to their contribution. The limited partner's liability cap only takes effect once their contribution amount is entered in the commercial register.",
    isMandatory: true,
    legalBasis: "§ 161 HGB, § 162 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "gbr",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht GbR",
    descriptionDe:
      "Die GbR (Gesellschaft bürgerlichen Rechts) unterliegt seit dem MoPeG (Gesetz zur Modernisierung des Personengesellschaftsrechts, in Kraft seit 1. Januar 2024) einer freiwilligen Eintragungspflicht in das neue Gesellschaftsregister. Eine GbR, die ein Grundstück oder GmbH-Anteile erwerben oder veräußern will, muss eingetragen sein (§§ 707 ff. BGB n.F.). Betreibt sie ein Handelsgewerbe, muss sie sich als OHG oder KG registrieren lassen.",
    descriptionEn:
      "Since the MoPeG reform (effective 1 January 2024), the GbR (civil law partnership) may voluntarily register in the new Gesellschaftsregister. A GbR that wishes to acquire or sell real estate or GmbH shares must be registered (§§ 707 ff. BGB new version). If it operates a commercial enterprise, it must register as an OHG or KG instead.",
    isMandatory: false,
    legalBasis: "§§ 707 ff. BGB (n.F., MoPeG 2024), § 106 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "einzelunternehmen",
    obligationType: "eintragungspflicht",
    labelDe: "Eintragungspflicht Einzelunternehmen",
    descriptionDe:
      "Einzelkaufleute sind nach § 29 HGB verpflichtet, ihr Unternehmen im Handelsregister anzumelden, wenn sie ein Handelsgewerbe (§ 1 HGB) betreiben. Kleingewerbetreibende (§ 2 HGB) können sich freiwillig eintragen lassen, um den Kaufmansstatus zu erlangen. Freiberufler und rein land- oder forstwirtschaftliche Betriebe sind nicht eintragungspflichtig.",
    descriptionEn:
      "Sole traders (Einzelkaufleute) must register in the commercial register under § 29 HGB if they operate a commercial business (§ 1 HGB). Small businesses (§ 2 HGB) may voluntarily register to obtain merchant status. Freelancers and purely agricultural/forestry operations are exempt from the registration requirement.",
    isMandatory: false,
    legalBasis: "§ 1 HGB, § 2 HGB, § 29 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },

  // ── Eintragungsinhalt ─────────────────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    obligationType: "eintragungsinhalt",
    labelDe: "Eintragungsinhalt GmbH",
    descriptionDe:
      "In das Handelsregister werden bei der GmbH eingetragen (§ 10 GmbHG): Firma und Sitz der Gesellschaft, der Unternehmensgegenstand, die Höhe des Stammkapitals, die Namen der Geschäftsführer mit Angabe zur Vertretungsbefugnis (Einzel- oder Gesamtvertretung), Angaben zu etwaigen Prokuristen. Änderungen (Kapitalerhöhung, Geschäftsführerwechsel, Sitzverlegung) sind unverzüglich anzumelden.",
    descriptionEn:
      "The following must be registered in the commercial register for a GmbH (§ 10 GmbHG): company name (Firma) and registered office (Sitz), the business purpose (Unternehmensgegenstand), the amount of share capital (Stammkapital), the names of managing directors (Geschäftsführer) with their authority to represent the company (sole or joint representation), and any Prokuristen. Changes (capital increase, change of director, relocation) must be reported without delay.",
    isMandatory: true,
    legalBasis: "§ 10 GmbHG, § 8 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },

  // ── Notarpflicht ──────────────────────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    obligationType: "notarpflicht",
    labelDe: "Notarpflicht bei der GmbH-Gründung",
    descriptionDe:
      "Die Gründung einer GmbH erfordert zwingend eine notarielle Beurkundung des Gesellschaftsvertrags (Satzung) nach § 2 GmbHG. Der Notar beurkundet auch die Übernahmeerklärungen der Gesellschafter. Die Anmeldung zum Handelsregister (§ 7 GmbHG) muss notariell beglaubigt (Unterschriftsbeglaubigung) eingereicht werden. Weitere notarpflichtige Akte: Kapitalerhöhung (§ 55 GmbHG), Änderung des Gesellschaftsvertrags (§ 53 GmbHG), Übertragung von GmbH-Anteilen (§ 15 GmbHG).",
    descriptionEn:
      "Founding a GmbH requires mandatory notarial authentication of the articles of association (§ 2 GmbHG). The notary also authenticates the partners' subscription declarations. The application for commercial register entry (§ 7 GmbHG) must be submitted with notarial certification. Other notarization-required acts: capital increase (§ 55 GmbHG), amendment of articles of association (§ 53 GmbHG), transfer of GmbH shares (§ 15 GmbHG).",
    isMandatory: true,
    legalBasis: "§ 2 GmbHG, § 7 GmbHG, § 15 GmbHG, § 53 GmbHG, § 55 GmbHG",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    rechtsformSlug: "ug",
    obligationType: "notarpflicht",
    labelDe: "Notarpflicht bei der UG-Gründung",
    descriptionDe:
      "Die UG (haftungsbeschränkt) unterliegt denselben Notarpflichten wie die GmbH (§ 5a i.V.m. § 2 GmbHG). Der Gesellschaftsvertrag muss notariell beurkundet werden. Bei Nutzung des Musterprotokolls (§ 2 Abs. 1a GmbHG) für die vereinfachte Gründung mit bis zu 3 Gesellschaftern und einem Geschäftsführer ist die Beurkundung ebenfalls notariell; das Musterprotokoll selbst vereinfacht den Prozess, hebt aber die Notarpflicht nicht auf.",
    descriptionEn:
      "The UG (haftungsbeschränkt) is subject to the same notarization requirements as the GmbH (§ 5a in conjunction with § 2 GmbHG). The articles of association must be notarially authenticated. When using the standard form (Musterprotokoll, § 2 para. 1a GmbHG) for simplified founding with up to 3 shareholders and one managing director, notarial authentication is still required; the standard form simplifies the process but does not remove the notarization requirement.",
    isMandatory: true,
    legalBasis: "§ 5a GmbHG, § 2 GmbHG, § 2 Abs. 1a GmbHG",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    rechtsformSlug: "ag",
    obligationType: "notarpflicht",
    labelDe: "Notarpflicht bei der AG-Gründung",
    descriptionDe:
      "Die Gründung einer AG erfordert die notarielle Beurkundung der Satzung und der Gründungserklärungen (§§ 23, 28 AktG). Weitere notarpflichtige Akte: Satzungsänderungen (§ 130 AktG), Kapitalerhöhungen (§ 182 AktG), Verschmelzungsverträge. Der Notar übernimmt auch die Anmeldung zum Handelsregister.",
    descriptionEn:
      "Founding an AG requires notarial authentication of the articles of association and the founding declarations (§§ 23, 28 AktG). Other acts requiring notarization: amendments to the articles of association (§ 130 AktG), capital increases (§ 182 AktG), and merger agreements. The notary also handles the commercial register application.",
    isMandatory: true,
    legalBasis: "§ 23 AktG, § 28 AktG, § 36 AktG, § 130 AktG",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    rechtsformSlug: "ohg",
    obligationType: "notarpflicht",
    labelDe: "Notarpflicht OHG",
    descriptionDe:
      "Der Gesellschaftsvertrag einer OHG bedarf keiner notariellen Form (formfrei nach § 705 BGB i.V.m. §§ 105 ff. HGB). Jedoch muss die Anmeldung zum Handelsregister notariell beglaubigt eingereicht werden (§ 12 HGB). Beinhaltet der Gesellschaftsvertrag eine Grundstückseinlage, ist für diesen Teil notarielle Beurkundung erforderlich (§ 311b BGB).",
    descriptionEn:
      "The partnership agreement of an OHG requires no notarial form (informal under § 705 BGB in conjunction with §§ 105 ff. HGB). However, the application to the commercial register must be notarially certified (§ 12 HGB). If the partnership agreement includes a real estate contribution, that part requires notarial authentication (§ 311b BGB).",
    isMandatory: false,
    legalBasis: "§ 12 HGB, § 105 HGB, § 311b BGB",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    rechtsformSlug: "einzelunternehmen",
    obligationType: "notarpflicht",
    labelDe: "Notarpflicht Einzelunternehmen",
    descriptionDe:
      "Für die Gründung eines Einzelunternehmens ist keine notarielle Beurkundung erforderlich. Die Anmeldung zum Handelsregister (sofern Eintragungspflicht besteht) muss jedoch in notariell beglaubigter Form eingereicht werden (§ 12 HGB). Immobilienerwerb im Rahmen der Betriebsgründung erfordert notarielle Beurkundung (§ 311b BGB).",
    descriptionEn:
      "No notarial authentication is required to found a sole tradership. However, if registration in the commercial register is required, the application must be submitted in notarially certified form (§ 12 HGB). Acquisition of real estate as part of the business setup requires notarial authentication (§ 311b BGB).",
    isMandatory: false,
    legalBasis: "§ 12 HGB, § 311b BGB",
    sourceUrl: BNK_COSTS_URL,
  },

  // ── Fristen ───────────────────────────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    obligationType: "fristen",
    labelDe: "Anmeldefrist GmbH",
    descriptionDe:
      "Die Anmeldung der GmbH zum Handelsregister hat unverzüglich nach Abschluss des Gesellschaftsvertrags zu erfolgen (§ 7 Abs. 1 GmbHG). Es gibt keine gesetzliche Maximalfrist; 'unverzüglich' bedeutet ohne schuldhaftes Zögern, typischerweise innerhalb weniger Wochen. Die Vor-GmbH haftet bis zur Eintragung. Das Registergericht bearbeitet Anmeldungen in der Regel innerhalb von 1–6 Wochen.",
    descriptionEn:
      "The application to register the GmbH must be made immediately after signing the articles of association (§ 7 para. 1 GmbHG). There is no statutory maximum deadline; 'immediately' means without culpable delay, typically within a few weeks. The pre-GmbH (Vor-GmbH) remains liable until registration. Registration courts typically process applications within 1–6 weeks.",
    isMandatory: true,
    legalBasis: "§ 7 Abs. 1 GmbHG",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "ag",
    obligationType: "fristen",
    labelDe: "Anmeldefrist AG",
    descriptionDe:
      "Der Vorstand und die Mitglieder des Aufsichtsrats haben die AG zur Eintragung in das Handelsregister unverzüglich nach der Gründungsversammlung anzumelden (§ 36 Abs. 1 AktG). Auch hier gilt: keine gesetzliche Maximalfrist, aber unverzügliches Handeln ist geboten. Die AG entsteht erst mit der Eintragung.",
    descriptionEn:
      "The board of directors and supervisory board members must apply for registration in the commercial register immediately after the founding meeting (§ 36 para. 1 AktG). Again, there is no statutory maximum deadline, but prompt action is required. The AG only comes into existence upon registration.",
    isMandatory: true,
    legalBasis: "§ 36 AktG, § 41 AktG",
    sourceUrl: BMJ_GMBHG_URL,
  },

  // ── Publizitätspflicht ────────────────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    obligationType: "publizitaetspflicht",
    labelDe: "Publizitätspflicht GmbH",
    descriptionDe:
      "GmbHs unterliegen der Pflicht zur Offenlegung des Jahresabschlusses (§ 325 HGB). Kleine GmbHs müssen die Bilanz und einen Anhang einreichen; mittelgroße und große GmbHs zusätzlich die Gewinn- und Verlustrechnung und einen Lagebericht. Die Einreichung erfolgt beim Bundesanzeiger (elektronisch über www.unternehmensregister.de). Frist: 12 Monate nach Ablauf des Geschäftsjahres (§ 325 Abs. 1a HGB für kleine GmbHs: 12 Monate).",
    descriptionEn:
      "GmbHs are required to disclose their annual financial statements (§ 325 HGB). Small GmbHs must submit a balance sheet and notes; medium and large GmbHs must additionally submit the profit and loss account and a management report. Submission is made to the Bundesanzeiger (electronically via www.unternehmensregister.de). Deadline: 12 months after the end of the financial year (§ 325 para. 1a HGB for small GmbHs: 12 months).",
    isMandatory: true,
    legalBasis: "§ 325 HGB, § 267 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "ug",
    obligationType: "publizitaetspflicht",
    labelDe: "Publizitätspflicht UG (haftungsbeschränkt)",
    descriptionDe:
      "Die UG unterliegt denselben Offenlegungspflichten wie die GmbH (§ 325 HGB). Da UGs in der Regel kleine Kapitalgesellschaften sind, genügt die vereinfachte Offenlegung (nur Bilanz und Anhang). Frist: 12 Monate nach Ablauf des Geschäftsjahres.",
    descriptionEn:
      "The UG is subject to the same disclosure obligations as the GmbH (§ 325 HGB). As UGs are typically small companies, the simplified disclosure (balance sheet and notes only) is sufficient. Deadline: 12 months after the end of the financial year.",
    isMandatory: true,
    legalBasis: "§ 325 HGB, § 5a GmbHG",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "ag",
    obligationType: "publizitaetspflicht",
    labelDe: "Publizitätspflicht AG",
    descriptionDe:
      "AGs unterliegen strengen Offenlegungspflichten nach §§ 325 ff. HGB und dem AktG. Pflicht zur Offenlegung von Jahresabschluss, Lagebericht, Gewinn- und Verlustrechnung sowie Bericht des Aufsichtsrats. Börsennotierte AGs unterliegen zusätzlich dem Wertpapierhandelsgesetz (WpHG) mit Adhoc-Publizität (§ 15 WpHG). Frist: 4 Monate nach Ablauf des Geschäftsjahres für Jahresabschluss; unverzüglich für kursrelevante Informationen.",
    descriptionEn:
      "AGs are subject to strict disclosure obligations under §§ 325 ff. HGB and the AktG, including the annual financial statements, management report, profit and loss account, and supervisory board report. Listed AGs are additionally subject to the Securities Trading Act (WpHG) with ad-hoc disclosure obligations (§ 15 WpHG). Deadline: 4 months after the end of the financial year for annual accounts; immediately for price-sensitive information.",
    isMandatory: true,
    legalBasis: "§ 325 HGB, §§ 170 ff. AktG, § 15 WpHG",
    sourceUrl: BMJ_GMBHG_URL,
  },
  {
    rechtsformSlug: "einzelunternehmen",
    obligationType: "publizitaetspflicht",
    labelDe: "Publizitätspflicht Einzelunternehmen",
    descriptionDe:
      "Einzelkaufleute, die an zwei aufeinanderfolgenden Abschlussstichtagen nicht mehr als 600.000 € Umsatzerlöse und 60.000 € Jahresüberschuss aufweisen (§ 241a HGB), sind von der Buchführungspflicht nach HGB und damit auch von der Offenlegungspflicht befreit. Größere Einzelunternehmen unterliegen den allgemeinen Offenlegungspflichten des HGB.",
    descriptionEn:
      "Sole traders who do not exceed €600,000 in revenue and €60,000 net profit at two consecutive closing dates (§ 241a HGB) are exempt from accounting obligations under the HGB and therefore also from the disclosure requirement. Larger sole traders are subject to the general disclosure obligations of the HGB.",
    isMandatory: false,
    legalBasis: "§ 241a HGB, § 325 HGB",
    sourceUrl: BMJ_GMBHG_URL,
  },

  // ── Ablauf GmbH-Gründung ──────────────────────────────────────────────────
  {
    rechtsformSlug: "gmbh",
    obligationType: "ablauf",
    labelDe: "Schritt-für-Schritt-Anleitung GmbH-Gründung",
    descriptionDe:
      "1. Gesellschaftsvertrag (Satzung) aufsetzen — Firma, Sitz, Stammkapital (mind. 25.000 €), Unternehmensgegenstand, Geschäftsführer, Gesellschafter und Beteiligungsquoten festlegen.\n" +
      "2. Notartermin — Notarielle Beurkundung des Gesellschaftsvertrags und der Übernahmeerklärungen (§ 2 GmbHG). Kosten: ca. 300–800 € (GNotKG).\n" +
      "3. Geschäftskonto eröffnen — Eröffnung eines Geschäftskontos auf den Namen der Vor-GmbH.\n" +
      "4. Stammkapital einzahlen — Mindestens 12.500 € (50% des Stammkapitals) auf das Geschäftskonto einzahlen; Bankbestätigung einholen.\n" +
      "5. Handelsregisteranmeldung — Notar reicht die notariell beglaubigte Anmeldung beim Amtsgericht (Registergericht) ein (§ 7 GmbHG). Gerichtsgebühr: ca. 150–300 € (KV-GNotKG Nr. 26002).\n" +
      "6. Eintragung im Handelsregister — Das Registergericht prüft und trägt die GmbH ein. Bearbeitungszeit: 1–6 Wochen.\n" +
      "7. Steuerliche Erfassung — Fragebogen zur steuerlichen Erfassung beim zuständigen Finanzamt einreichen (§ 14 AO). Steuernummer wird zugeteilt.\n" +
      "8. Gewerbeanmeldung — Gewerbeanmeldung beim Gewerbeamt der Standortgemeinde (§ 14 GewO); Kosten: ca. 20–65 €.\n" +
      "9. IHK-Pflichtmitgliedschaft — Automatische Mitgliedschaft in der örtlichen IHK nach GmbH-Gründung.\n" +
      "10. Berufsgenossenschaft anmelden — Anmeldung bei der zuständigen Berufsgenossenschaft (gesetzliche Unfallversicherung) spätestens eine Woche nach Betriebsaufnahme.",
    descriptionEn:
      "1. Draft articles of association — define company name (Firma), registered office (Sitz), share capital (min. €25,000), business purpose, managing directors, shareholders, and shareholding ratios.\n" +
      "2. Notary appointment — Notarial authentication of the articles and shareholders' subscription declarations (§ 2 GmbHG). Cost: approx. €300–800 (GNotKG).\n" +
      "3. Open a business account — Open a business bank account in the name of the pre-GmbH (Vor-GmbH).\n" +
      "4. Pay in share capital — Pay at least €12,500 (50% of share capital) into the business account; obtain bank confirmation.\n" +
      "5. Commercial register application — Notary submits the notarially certified application to the local court (Registergericht) (§ 7 GmbHG). Court fee: approx. €150–300.\n" +
      "6. Registration in the commercial register — The registration court reviews and registers the GmbH. Processing time: 1–6 weeks.\n" +
      "7. Tax registration — Submit the tax registration questionnaire (Fragebogen zur steuerlichen Erfassung) to the responsible tax office (§ 14 AO). Tax number is assigned.\n" +
      "8. Trade registration — Register the business (Gewerbeanmeldung) with the local trade office (§ 14 GewO); cost: approx. €20–65.\n" +
      "9. IHK membership — Automatic membership in the local Chamber of Commerce (IHK) after GmbH registration.\n" +
      "10. Berufsgenossenschaft registration — Register with the relevant statutory accident insurance institution (Berufsgenossenschaft) no later than one week after commencing operations.",
    isMandatory: true,
    legalBasis: "§ 2 GmbHG, § 7 GmbHG, § 14 AO, § 14 GewO",
    sourceUrl: BMJ_GMBHG_URL,
  },

  // ── Ablauf UG-Gründung ────────────────────────────────────────────────────
  {
    rechtsformSlug: "ug",
    obligationType: "ablauf",
    labelDe: "Schritt-für-Schritt-Anleitung UG-Gründung",
    descriptionDe:
      "1. Gesellschaftsvertrag oder Musterprotokoll wählen — Bei bis zu 3 Gesellschaftern und einem Geschäftsführer kann das gesetzliche Musterprotokoll (Anlage zu § 2 Abs. 1a GmbHG) genutzt werden; spart Notarkosten.\n" +
      "2. Notartermin — Notarielle Beurkundung des Gesellschaftsvertrags oder Musterprotokolls. Stammkapital: mindestens 1 €, empfohlen mindestens 500–1.000 €.\n" +
      "3. Geschäftskonto eröffnen und Stammkapital einzahlen — Gesamtes Stammkapital muss vor Anmeldung eingezahlt sein (§ 5a Abs. 2 GmbHG); Bankbestätigung einholen.\n" +
      "4. Handelsregisteranmeldung — Notar reicht die Anmeldung beim Amtsgericht ein. Gerichtsgebühr: ca. 80–150 €.\n" +
      "5. Eintragung im Handelsregister — Bearbeitungszeit: 1–6 Wochen. Firma muss 'UG (haftungsbeschränkt)' enthalten.\n" +
      "6. Steuerliche Erfassung und Gewerbeanmeldung — Wie bei der GmbH.\n" +
      "7. Rücklagenpflicht beachten — 25% des jährlichen Überschusses als gesetzliche Rücklage einbehalten, bis das Stammkapital 25.000 € erreicht; danach Umwandlung in GmbH möglich.",
    descriptionEn:
      "1. Choose articles or standard form — For up to 3 shareholders and one managing director, the statutory standard form (Musterprotokoll, Annex to § 2 para. 1a GmbHG) can be used; saves notary costs.\n" +
      "2. Notary appointment — Notarial authentication of the articles or standard form. Share capital: at least €1, recommended at least €500–1,000.\n" +
      "3. Open a business account and pay in share capital — The full share capital must be paid before registration (§ 5a para. 2 GmbHG); obtain bank confirmation.\n" +
      "4. Commercial register application — Notary submits the application to the local court. Court fee: approx. €80–150.\n" +
      "5. Registration in the commercial register — Processing time: 1–6 weeks. Company name must contain 'UG (haftungsbeschränkt)'.\n" +
      "6. Tax registration and trade registration — As for the GmbH.\n" +
      "7. Observe mandatory reserve — Retain 25% of annual surplus as statutory reserve until share capital reaches €25,000; then conversion to GmbH is possible.",
    isMandatory: true,
    legalBasis: "§ 5a GmbHG, § 2 Abs. 1a GmbHG",
    sourceUrl: BMJ_GMBHG_URL,
  },
];

const BASELINE_NOTARY_COSTS: BaselineNotaryCost[] = [
  {
    actType: "gmbh_gruendung",
    labelDe: "GmbH-Gründung (Beurkundung Gesellschaftsvertrag)",
    costBasis:
      "GNotKG Anlage 1 Nr. 21100 (Beurkundungsgebühr), Geschäftswert = Stammkapital (mindestens 25.000 €). " +
      "Doppelte Gebühr nach KV-GNotKG Nr. 21100 (2,0-fach aus dem Geschäftswert). " +
      "Zzgl. Gerichtsgebühr (KV-GNotKG Nr. 26002) für die Eintragung im Handelsregister.",
    exampleCostEur: "300–800 € (Notargebühr) + 150–300 € (Gerichtsgebühr)",
    notes:
      "Bei Stammkapital von 25.000 € beträgt die Notargebühr ca. 300–400 €. Zzgl. Mehrwertsteuer (19%). " +
      "Das Musterprotokoll (§ 2 Abs. 1a GmbHG) für UGs ist deutlich günstiger (ca. 150–250 €). " +
      "Gerichtsgebühr für Handelsregistereintragung: nach KV-GNotKG Nr. 26002, mind. ca. 100–150 €.",
    legalBasis: "GNotKG Anlage 1 Nr. 21100, KV-GNotKG Nr. 26002",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    actType: "ug_gruendung_musterprotokoll",
    labelDe: "UG-Gründung mit Musterprotokoll",
    costBasis:
      "GNotKG Anlage 1 Nr. 21100 reduziert, Geschäftswert = Stammkapital. " +
      "Musterprotokoll-Beurkundung nach § 2 Abs. 1a GmbHG i.V.m. GNotKG; vereinfachtes Verfahren.",
    exampleCostEur: "150–300 € (Notargebühr) + 80–150 € (Gerichtsgebühr)",
    notes:
      "Nur bei bis zu 3 Gesellschaftern, 1 Geschäftsführer, Sacheinlagen ausgeschlossen. " +
      "Deutlich kostengünstiger als individueller Gesellschaftsvertrag. Zzgl. MwSt. (19%).",
    legalBasis: "§ 2 Abs. 1a GmbHG, GNotKG Anlage 1 Nr. 21100",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    actType: "ag_gruendung",
    labelDe: "AG-Gründung (Beurkundung Satzung)",
    costBasis:
      "GNotKG Anlage 1 Nr. 21100 (Beurkundungsgebühr), Geschäftswert = Grundkapital (mind. 50.000 €). " +
      "Zzgl. Gerichtsgebühr für Handelsregistereintragung.",
    exampleCostEur: "600–1.500 € (Notargebühr) + 300–600 € (Gerichtsgebühr)",
    notes:
      "Bei Grundkapital von 50.000 € ca. 600–800 € Notargebühr zzgl. MwSt. " +
      "Bei höherem Grundkapital steigen die Gebühren nach GNotKG-Tabelle.",
    legalBasis: "§§ 23, 28, 36 AktG, GNotKG Anlage 1 Nr. 21100",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    actType: "satzungsaenderung_gmbh",
    labelDe: "Satzungsänderung GmbH (z.B. Kapitalerhöhung, Gegenstandsänderung)",
    costBasis:
      "GNotKG Anlage 1 Nr. 21100 (Beurkundungsgebühr), Geschäftswert = Wert der Änderung bzw. " +
      "Stammkapital bei Kapitalerhöhung. Zzgl. Gerichtsgebühr für Handelsregistereintragung.",
    exampleCostEur: "200–600 € (Notargebühr) + 100–200 € (Gerichtsgebühr)",
    notes:
      "Jede Änderung des Gesellschaftsvertrags (§ 53 GmbHG) bedarf notarieller Beurkundung und " +
      "Handelsregistereintragung. Kapitalerhöhung nach § 55 GmbHG zusätzlich mit Übernahme- und " +
      "Einlageerklärung. Zzgl. MwSt. (19%).",
    legalBasis: "§ 53 GmbHG, § 55 GmbHG, GNotKG Anlage 1 Nr. 21100",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    actType: "anteilsuebertragung_gmbh",
    labelDe: "Übertragung von GmbH-Anteilen (§ 15 GmbHG)",
    costBasis:
      "GNotKG Anlage 1 Nr. 21100 (Beurkundungsgebühr), Geschäftswert = Kaufpreis der Anteile oder " +
      "Nennbetrag, je nachdem was höher ist (§ 97 GNotKG).",
    exampleCostEur: "300–2.000 € (je nach Anteilswert)",
    notes:
      "Anteilsübertragungen bei der GmbH sind nach § 15 GmbHG zwingend notariell zu beurkunden. " +
      "Kein Handelsregistereintrag erforderlich (nur interne Gesellschafterliste wird aktualisiert, " +
      "§ 16 GmbHG). Zzgl. MwSt. (19%).",
    legalBasis: "§ 15 GmbHG, § 97 GNotKG, GNotKG Anlage 1 Nr. 21100",
    sourceUrl: BNK_COSTS_URL,
  },
  {
    actType: "handelsregisteranmeldung_einzelkaufmann",
    labelDe: "Handelsregisteranmeldung Einzelkaufmann (§ 29 HGB)",
    costBasis:
      "Notarielle Beglaubigung der Unterschrift (§ 12 HGB). Gebühr nach GNotKG: Beglaubigungsgebühr " +
      "Nr. 25100 (0,2-fache Notargebühr, Geschäftswert = Jahresumsatz oder Unternehmenswert).",
    exampleCostEur: "50–150 € (Beglaubigung) + 70–120 € (Gerichtsgebühr)",
    notes:
      "Günstigste Form der HR-Anmeldung: nur Unterschriftsbeglaubigung erforderlich, keine " +
      "Beurkundung des Gesellschaftsvertrags (kein solcher vorhanden). Zzgl. MwSt. (19%).",
    legalBasis: "§ 12 HGB, § 29 HGB, GNotKG Nr. 25100",
    sourceUrl: BNK_COSTS_URL,
  },
];

// ─── Scraper ──────────────────────────────────────────────────────────────────

export class HandelsregisterScraper extends BaseScraper<
  ParsedHrObligation | ParsedNotaryCost
> {
  constructor() {
    super({
      pipelineName: "scrape-handelsregister",
      pipelineDescription:
        "Scrapes Handelsregister obligations and notary requirements for German founders (Silo 6)",
      pipelineSchedule: "0 4 * * 1", // weekly on Monday at 04:00
      requestDelayMs: 3000,
    });
  }

  // ─── Phase 1: collect URLs ─────────────────────────────────────────────────
  // We synthesize fragment-keyed URLs to encode the (rechtsformSlug, obligationType)
  // or actType per record. The parsePage() method parses the actual source page
  // and falls back to baseline data when the page structure is unrecognizable.

  protected async fetchUrls(_page: Page): Promise<string[]> {
    const obligationUrls = BASELINE_OBLIGATIONS.map(
      (o) =>
        `${o.sourceUrl}#hr-${o.rechtsformSlug}-${o.obligationType}`,
    );
    const notaryUrls = BASELINE_NOTARY_COSTS.map(
      (n) => `${n.sourceUrl}#notar-${n.actType}`,
    );
    return [...obligationUrls, ...notaryUrls];
  }

  // ─── Phase 2: parse ────────────────────────────────────────────────────────

  protected parsePage(
    html: string,
    url: string,
  ): ParsedHrObligation | ParsedNotaryCost | null {
    const fragment = url.split("#")[1] ?? "";

    if (fragment.startsWith("hr-")) {
      return this.parseObligationPage(html, url, fragment);
    }
    if (fragment.startsWith("notar-")) {
      return this.parseNotaryCostPage(html, url, fragment);
    }
    return null;
  }

  private parseObligationPage(
    html: string,
    url: string,
    fragment: string,
  ): ParsedHrObligation | null {
    // Fragment format: "hr-{rechtsformSlug}-{obligationType}"
    const parts = fragment.replace("hr-", "").split("-");
    if (parts.length < 2) return null;

    // obligationType is everything after the first segment
    const rechtsformSlug = parts[0]!;
    const obligationType = parts.slice(1).join("-");

    const baseline = BASELINE_OBLIGATIONS.find(
      (o) =>
        o.rechtsformSlug === rechtsformSlug &&
        o.obligationType === obligationType,
    );
    if (!baseline) return null;

    // Attempt live extraction from the government page
    const $ = cheerio.load(html);

    // Try to find relevant content matching key terms from the obligation type
    const keyTerms: Record<string, string[]> = {
      eintragungspflicht: ["handelsregister", "eintragung", "anmeldung"],
      eintragungsinhalt: ["eintragungsinhalt", "handelsregister", "firma"],
      notarpflicht: ["notar", "beurkundung", "beglaubigung"],
      fristen: ["frist", "unverzüglich", "anmeldung"],
      publizitaetspflicht: ["offenlegung", "jahresabschluss", "bundesanzeiger"],
      ablauf: ["gründung", "schritt", "prozess"],
    };

    const terms = keyTerms[obligationType] ?? [];
    let extractedDescription: string | null = null;

    if (terms.length > 0) {
      $("p, li").each((_, el) => {
        const text = $(el).text().trim().toLowerCase();
        if (terms.some((t) => text.includes(t)) && text.length > 100) {
          extractedDescription = $(el).text().trim();
          return false; // break
        }
      });
    }

    const record: ParsedHrObligation = {
      rechtsformSlug: baseline.rechtsformSlug,
      obligationType: baseline.obligationType,
      labelDe: baseline.labelDe,
      descriptionDe: extractedDescription ?? baseline.descriptionDe,
      descriptionEn: baseline.descriptionEn,
      isMandatory: baseline.isMandatory,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl,
      contentHash: "",
    };
    record.contentHash = makeHash({
      rechtsformSlug: record.rechtsformSlug,
      obligationType: record.obligationType,
      descriptionDe: record.descriptionDe,
      isMandatory: record.isMandatory,
    });

    return record;
  }

  private parseNotaryCostPage(
    html: string,
    url: string,
    fragment: string,
  ): ParsedNotaryCost | null {
    const actType = fragment.replace("notar-", "");
    const baseline = BASELINE_NOTARY_COSTS.find((n) => n.actType === actType);
    if (!baseline) return null;

    // Attempt live extraction
    const $ = cheerio.load(html);
    let extractedCostText: string | null = null;

    $("p, li, td").each((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      if (
        (text.includes("gnotkg") || text.includes("gebühr")) &&
        text.length > 50
      ) {
        extractedCostText = $(el).text().trim();
        return false;
      }
    });

    const record: ParsedNotaryCost = {
      actType: baseline.actType,
      labelDe: baseline.labelDe,
      costBasis: baseline.costBasis,
      exampleCostEur: extractedCostText ?? baseline.exampleCostEur,
      notes: baseline.notes,
      legalBasis: baseline.legalBasis,
      sourceUrl: baseline.sourceUrl,
      contentHash: "",
    };
    record.contentHash = makeHash({
      actType: record.actType,
      costBasis: record.costBasis,
      exampleCostEur: record.exampleCostEur,
      notes: record.notes,
    });

    return record;
  }

  // ─── Phase 3: diff ─────────────────────────────────────────────────────────

  protected async diffRecord(
    record: ParsedHrObligation | ParsedNotaryCost,
  ): Promise<DiffResult> {
    if ("rechtsformSlug" in record) {
      return this.diffObligation(record);
    }
    return this.diffNotaryCost(record);
  }

  private async diffObligation(
    record: ParsedHrObligation,
  ): Promise<DiffResult> {
    const existing = await db
      .select({ id: hrObligations.id, contentHash: hrObligations.contentHash })
      .from(hrObligations)
      .where(
        and(
          eq(hrObligations.rechtsformSlug, record.rechtsformSlug),
          eq(hrObligations.obligationType, record.obligationType),
        ),
      )
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  private async diffNotaryCost(record: ParsedNotaryCost): Promise<DiffResult> {
    const existing = await db
      .select({ id: notaryCosts.id, contentHash: notaryCosts.contentHash })
      .from(notaryCosts)
      .where(eq(notaryCosts.actType, record.actType))
      .limit(1);

    if (existing.length === 0) return "new";
    if (existing[0]!.contentHash === record.contentHash) return "unchanged";
    return "updated";
  }

  // ─── Phase 4: write ────────────────────────────────────────────────────────

  protected async writeRecord(
    record: ParsedHrObligation | ParsedNotaryCost,
  ): Promise<void> {
    if ("rechtsformSlug" in record) {
      await this.writeObligation(record);
    } else {
      await this.writeNotaryCost(record);
    }
  }

  private async writeObligation(record: ParsedHrObligation): Promise<void> {
    const now = new Date();
    await db
      .insert(hrObligations)
      .values({
        rechtsformSlug: record.rechtsformSlug,
        obligationType: record.obligationType,
        labelDe: record.labelDe,
        descriptionDe: record.descriptionDe,
        descriptionEn: record.descriptionEn,
        isMandatory: record.isMandatory,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: [hrObligations.rechtsformSlug, hrObligations.obligationType],
        set: {
          labelDe: record.labelDe,
          descriptionDe: record.descriptionDe,
          descriptionEn: record.descriptionEn,
          isMandatory: record.isMandatory,
          legalBasis: record.legalBasis,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }

  private async writeNotaryCost(record: ParsedNotaryCost): Promise<void> {
    const now = new Date();
    await db
      .insert(notaryCosts)
      .values({
        actType: record.actType,
        labelDe: record.labelDe,
        costBasis: record.costBasis,
        exampleCostEur: record.exampleCostEur,
        notes: record.notes,
        legalBasis: record.legalBasis,
        sourceUrl: record.sourceUrl,
        contentHash: record.contentHash,
        scrapedAt: now,
      })
      .onConflictDoUpdate({
        target: [notaryCosts.actType],
        set: {
          labelDe: record.labelDe,
          costBasis: record.costBasis,
          exampleCostEur: record.exampleCostEur,
          notes: record.notes,
          legalBasis: record.legalBasis,
          sourceUrl: record.sourceUrl,
          contentHash: record.contentHash,
          scrapedAt: now,
          updatedAt: now,
        },
      });
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const scraper = new HandelsregisterScraper();
scraper.run().catch((err) => {
  console.error("[scrape-handelsregister] Fatal:", err);
  process.exit(1);
});
