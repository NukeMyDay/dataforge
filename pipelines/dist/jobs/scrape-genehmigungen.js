// Silo 5 scraper: Genehmigungen & branchenspezifische Auflagen (DAT-38)
//
// Scrapes permit requirements and industry-specific regulatory obligations for
// German business founders, covering:
//   - Erlaubnispflichtige Gewerbe (§§ 30–38, 55 GewO)
//   - Meisterpflicht trades (Anlage A HwO)
//   - Überwachungsbedürftige Anlagen (§§ 37–39 GewO, BetrSichV)
//   - Berufsgenossenschaft membership obligations (SGB VII)
//
// Primary sources per data type:
//
//   Permits (Gewerbeerlaubnisse, Meisterpflicht, Konzessionen):
//   - gesetze-im-internet.de/gewo/ — Gewerbeordnung; primary legal authority
//   - gesetze-im-internet.de/hwo/ — Handwerksordnung; Anlage A Meisterpflicht trades
//   - ihk.de — IHK; practical guidance on erlaubnispflichtige Gewerbe
//   - hwk.de — HWK; Meisterpflicht and Handwerk regulation guidance
//
//   Berufsgenossenschaften:
//   - dguv.de — Deutsche Gesetzliche Unfallversicherung; authoritative list of all
//     statutory BGs, sector assignments, and membership obligations
//
// Strategy: fragment-keyed URLs encode "permit={permitKey}" or "bg={bgKey}"
// per record. parsePage() attempts live extraction and falls back to authoritative
// baseline data when government page structure changes.
import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { db, permits, berufsgenossenschaften } from "@dataforge/db";
import { eq } from "drizzle-orm";
import { BaseScraper } from "../lib/base-scraper.js";
// ─── Source URLs ──────────────────────────────────────────────────────────────
// gesetze-im-internet.de — Federal Ministry of Justice; official consolidated
// German statutory texts. Primary legal authority for GewO and HwO.
const GEWO_URL = "https://www.gesetze-im-internet.de/gewo/";
const HWO_URL = "https://www.gesetze-im-internet.de/hwo/";
// ihk.de — Industrie- und Handelskammer; primary source for practical guidance
// on erlaubnispflichtige Gewerbe and required application documents.
const IHK_ERLAUBNISSE_URL = "https://www.ihk.de/themen/gruendung/erlaubnispflichtige-gewerbe";
// hwk.de — Handwerkskammer; primary authority for Meisterpflicht trades.
const HWK_MEISTER_URL = "https://www.hwk.de/themen/meisterpflicht-anlage-a";
// dguv.de — Deutsche Gesetzliche Unfallversicherung; primary authority for
// all statutory Berufsgenossenschaften and their sector assignments.
const DGUV_BG_URL = "https://www.dguv.de/de/bg/index.jsp";
// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeHash(data) {
    return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}
function extractSection($, headingTexts) {
    const result = [];
    $("h2, h3, h4").each((_, el) => {
        const heading = $(el).text().trim().toLowerCase();
        if (!headingTexts.some((h) => heading.includes(h.toLowerCase())))
            return;
        let next = $(el).next();
        while (next.length && !next.is("h2, h3, h4")) {
            const text = next.text().trim();
            if (text)
                result.push(text);
            next = next.next();
        }
    });
    return result.length > 0 ? result.join("\n\n") : null;
}
const BASELINE_PERMITS = [
    // ── Erlaubnispflichtige Gewerbe (§§ 30–38, 55 GewO) ─────────────────────
    {
        permitKey: "gaststättengewerbe",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "gastronomie_tourismus",
        permitType: "Gaststättenerlaubnis",
        labelDe: "Gaststättengewerbe",
        descriptionDe: "Das Betreiben einer Gaststätte (Schank- und Speisewirtschaft, Beherbergungsbetriebe) erfordert in Bayern, Niedersachsen, Sachsen-Anhalt und Thüringen eine Gaststättenerlaubnis nach dem jeweiligen Landesgaststättengesetz. In allen anderen Bundesländern ist nach der Föderalismusreform 2006 keine besondere Gaststättenerlaubnis mehr erforderlich; stattdessen gelten Anforderungen aus Gewerberecht, Baurecht, Brandschutz, Lebensmittelrecht (LMHV, VO (EG) 852/2004) und Immissionsschutzrecht. Die gewerbliche Tätigkeit muss in allen Ländern beim zuständigen Gewerbeamt angemeldet werden.",
        authorityType: "Ordnungsamt / Gewerbeamt der zuständigen Gemeinde",
        authorityLevel: "local",
        requiredDocuments: "Gewerbeanmeldung, polizeiliches Führungszeugnis, Auszug aus dem Gewerbezentralregister, Nachweis der persönlichen Zuverlässigkeit, Grundrissplan der Betriebsräume, Nachweis der Einhaltung lebensmittelhygienischer Anforderungen (LMHV), ggf. Nachweis der Sachkunde (Alkoholausschank an Minderjährige, HACCP-Konzept)",
        costsEur: "100–500 € (je nach Bundesland und Gemeinde)",
        processingTimeDays: "14–60 Tage",
        legalBasis: "GastG Bayern Art. 2, GastG Niedersachsen, GastG Sachsen-Anhalt, GastG Thüringen; § 14 GewO (Gewerbeanmeldung); VO (EG) 852/2004 (Lebensmittelhygiene)",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    {
        permitKey: "taxiunternehmen",
        permitCategory: "konzession",
        tradeCategory: "transport_logistik",
        permitType: "Taxikonzession (Genehmigung nach PBefG)",
        labelDe: "Taxiunternehmen / Mietwagen",
        descriptionDe: "Der Betrieb eines Taxiunternehmens oder Mietwagenunternehmens bedarf einer Genehmigung nach dem Personenbeförderungsgesetz (PBefG). Die Genehmigung wird für jedes einzelne Fahrzeug erteilt und ist an die Person des Unternehmers gebunden. Voraussetzungen: Zuverlässigkeit, finanzielle Leistungsfähigkeit, fachliche Eignung (Unternehmerprüfung oder Ausnahmeregelung). Taxi: Betriebspflicht und Beförderungspflicht (§ 22 PBefG). Mietwagen: Rückkehrpflicht zum Betriebssitz (§ 49 Abs. 4 PBefG). Für Ridesharing-Dienste (§ 50 PBefG) und gebündelte Bedarfsverkehre (§ 44 PBefG) gelten seit der PBefG-Novelle 2021 gesonderte Regelungen.",
        authorityType: "Genehmigungsbehörde (Landratsamt, kreisfreie Stadt)",
        authorityLevel: "local",
        requiredDocuments: "Gewerbeanmeldung, Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis der finanziellen Leistungsfähigkeit, Nachweis der fachlichen Eignung (IHK-Fachkundeprüfung), Fahrzeugpapiere (Zulassung, HU, Taxameter-Eichbescheinigung), Nachweis der Kfz-Haftpflichtversicherung",
        costsEur: "200–800 € pro Fahrzeug",
        processingTimeDays: "30–90 Tage",
        legalBasis: "§§ 2, 13, 21, 22, 47–49 PBefG (Personenbeförderungsgesetz); BOKraft (Betriebsordnung für den Straßenpersonenverkehr)",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    {
        permitKey: "bewachungsgewerbe",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "sicherheit",
        permitType: "Bewachungserlaubnis",
        labelDe: "Bewachungsgewerbe",
        descriptionDe: "Das gewerbsmäßige Bewachen fremden Lebens oder fremden Eigentums bedarf einer Erlaubnis nach § 34a GewO. Die Erlaubnis wird für den Gewerbetreibenden persönlich erteilt. Voraussetzungen: Zuverlässigkeit, geordnete Vermögensverhältnisse, Nachweis einer Haftpflichtversicherung, Unterrichtungsnachweis (40 Stunden, IHK) oder Sachkundeprüfung für bestimmte Tätigkeitsbereiche (z. B. Türsteher, Bewachung von Flüchtlingsunterkünften, Geld- und Werttransport). Seit der Neuregelung 2019 (Bewachungsgewerbe-Verordnung) gelten verschärfte Anforderungen. Mitarbeiter müssen ebenfalls den Unterrichtungsnachweis vorweisen.",
        authorityType: "Industrie- und Handelskammer (IHK) / Gewerbeamt",
        authorityLevel: "local",
        requiredDocuments: "Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis der Zuverlässigkeit, Nachweis geordneter Vermögensverhältnisse (Schufa, kein Insolvenzverfahren), Nachweis der Haftpflichtversicherung (mind. 1 Mio. € Personenschäden, 750.000 € Sachschäden), IHK-Unterrichtungsnachweis (40 h) oder Sachkundeprüfung",
        costsEur: "200–1.000 €",
        processingTimeDays: "30–60 Tage",
        legalBasis: "§ 34a GewO; Bewachungsgewerbe-Verordnung (BewachV)",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    {
        permitKey: "versicherungsvermittler",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "finanzdienstleistungen",
        permitType: "Gewerbeerlaubnis Versicherungsvermittlung / -beratung",
        labelDe: "Versicherungsmakler / Versicherungsvertreter / Versicherungsberater",
        descriptionDe: "Die gewerbsmäßige Vermittlung oder Beratung von Versicherungen bedarf einer Erlaubnis nach § 34d GewO. Unterschieden wird zwischen Versicherungsmaklern (§ 34d Abs. 1 GewO, treuhänderischer Wahrer der Kundeninteressen), Versicherungsvertretern (§ 34d Abs. 1 GewO, gebunden an Versicherer), und Versicherungsberatern (§ 34d Abs. 2 GewO, honorarbasiert). Voraussetzungen: Zuverlässigkeit, geordnete Vermögensverhältnisse, Sachkunde (IHK-Sachkundeprüfung), Berufshaftpflichtversicherung (mind. 1.300.380 € pro Schadenfall). Registrierung im DIHK-Vermittlerregister unter Vermittlerregister.info pflichtweise nach Erlaubniserteilung.",
        authorityType: "Industrie- und Handelskammer (IHK)",
        authorityLevel: "local",
        requiredDocuments: "IHK-Sachkundeprüfungszeugnis (oder Befreiung), Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Schufa-Auskunft, Nachweis der Berufshaftpflichtversicherung, Nachweis geordneter Vermögensverhältnisse",
        costsEur: "200–600 €",
        processingTimeDays: "30–60 Tage",
        legalBasis: "§ 34d GewO; VersVermV (Versicherungsvermittlungsverordnung); IDD-Richtlinie (EU) 2016/97",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    {
        permitKey: "immobilienmakler",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "immobilien",
        permitType: "Maklererlaubnis (§ 34c GewO)",
        labelDe: "Immobilienmakler / Darlehensvermittler / Bauträger",
        descriptionDe: "Wer gewerbsmäßig Grundstücke, Wohnräume, gewerbliche Räume oder grundstücksgleiche Rechte vermittelt (Immobilienmakler) oder als Bauträger, Baubetreuer oder Darlehensvermittler tätig ist, benötigt eine Erlaubnis nach § 34c GewO. Voraussetzungen: Zuverlässigkeit, geordnete Vermögensverhältnisse. Für Darlehensvermittler und Wohnimmobilienkreditvermittler (seit 2016) gelten zusätzlich Sachkundeanforderungen (IHK-Sachkundeprüfung). Pflichtversicherung: Für Wohnimmobilienkreditvermittler ist eine Berufshaftpflichtversicherung (mind. 460.000 € / 750.000 €) vorgeschrieben. Weiterbildungspflicht: 20 Stunden in 3 Jahren (§ 34c Abs. 2a GewO seit MaBV-Novelle 2019).",
        authorityType: "Industrie- und Handelskammer (IHK) / Gewerbeamt",
        authorityLevel: "local",
        requiredDocuments: "Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis geordneter Vermögensverhältnisse (kein Insolvenzverfahren, keine Steuerschulden), Schufa-Auskunft, ggf. IHK-Sachkundenachweis (Wohnimmobilienkreditvermittler), ggf. Nachweis der Berufshaftpflichtversicherung",
        costsEur: "200–600 €",
        processingTimeDays: "30–60 Tage",
        legalBasis: "§ 34c GewO; MaBV (Makler- und Bauträgerverordnung); § 34i GewO (Wohnimmobilienkreditvermittler)",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    {
        permitKey: "finanzanlagenvermittler",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "finanzdienstleistungen",
        permitType: "Gewerbeerlaubnis Finanzanlagenvermittlung",
        labelDe: "Finanzanlagenvermittler",
        descriptionDe: "Wer gewerbsmäßig den Kauf oder Verkauf von Anteilen an Investmentvermögen, geschlossenen Fonds, Vermögensanlagen oder vergleichbaren Produkten vermittelt oder berät, benötigt eine Erlaubnis nach § 34f GewO. Erlaubnisklassen: § 34f Abs. 1 Satz 1 Nr. 1 (offene Investmentvermögen), Nr. 2 (geschlossene AIF), Nr. 3 (sonstige Vermögensanlagen, § 1 Abs. 2 VermAnlG). Voraussetzungen: IHK-Sachkundeprüfung (Finanzanlagenfachmann), Berufshaftpflichtversicherung (mind. 1.276.000 € / 1.919.000 €), Zuverlässigkeit, geordnete Vermögensverhältnisse. Registrierung im DIHK-Vermittlerregister nach Erlaubniserteilung.",
        authorityType: "Industrie- und Handelskammer (IHK)",
        authorityLevel: "local",
        requiredDocuments: "IHK-Sachkundeprüfung Finanzanlagenfachmann, Führungszeugnis, Auszug aus dem Gewerbezentralregister, Nachweis geordneter Vermögensverhältnisse, Nachweis der Berufshaftpflichtversicherung",
        costsEur: "200–600 €",
        processingTimeDays: "30–60 Tage",
        legalBasis: "§ 34f GewO; FinVermV (Finanzanlagenvermittlungsverordnung)",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    {
        permitKey: "reisegewerbe",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "handel",
        permitType: "Reisegewerbekarte",
        labelDe: "Reisegewerbe",
        descriptionDe: "Wer außerhalb einer gewerblichen Niederlassung (ohne festes Ladengeschäft) oder ohne eine solche Waren oder Leistungen anbietet, benötigt eine Reisegewerbekarte (§ 55 GewO). Ausnahmen: Handelsvertreter, Hausierer mit Lebensmitteln des täglichen Bedarfs (unter Voraussetzungen), Personen die nur gelegentlich tätig sind. Die Karte gilt bundesweit. Besondere Erlaubnisse gelten für das Aufstellen von Spielgeräten (§ 33c GewO) und das Betreiben von Spielhallen (§ 33i GewO).",
        authorityType: "Ordnungsamt / Gewerbeamt der zuständigen Gemeinde",
        authorityLevel: "local",
        requiredDocuments: "Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Lichtbild, Nachweis der Zuverlässigkeit",
        costsEur: "30–100 €",
        processingTimeDays: "7–21 Tage",
        legalBasis: "§§ 55–60 GewO",
        sourceUrl: GEWO_URL,
    },
    {
        permitKey: "pfandleihgewerbe",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "finanzdienstleistungen",
        permitType: "Pfandleiherlaubnis",
        labelDe: "Pfandleihgewerbe",
        descriptionDe: "Das gewerbsmäßige Gewähren von Darlehen gegen Faustpfand (Pfandleihe) bedarf einer Erlaubnis nach § 34 GewO. Voraussetzungen: Zuverlässigkeit, geordnete Vermögensverhältnisse. Die Pfandleiherverordnung (PfandlV) regelt Höchstzinssätze, Aufbewahrungspflichten und Versteigerungsmodalitäten. Ein Pfandschein muss ausgehändigt werden. Erlöse aus dem Pfandverkauf über den Darlehensbetrag stehen dem Verpfänder zu.",
        authorityType: "Ordnungsamt / Gewerbeamt der zuständigen Gemeinde",
        authorityLevel: "local",
        requiredDocuments: "Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Nachweis geordneter Vermögensverhältnisse, Nachweis geeigneter Betriebsräume",
        costsEur: "150–500 €",
        processingTimeDays: "30–60 Tage",
        legalBasis: "§ 34 GewO; PfandlV (Pfandleiherverordnung)",
        sourceUrl: GEWO_URL,
    },
    {
        permitKey: "spielhalle",
        permitCategory: "erlaubnispflichtiges_gewerbe",
        tradeCategory: "unterhaltung",
        permitType: "Spielhallenerlaubnis",
        labelDe: "Spielhalle / Geldspielgeräte",
        descriptionDe: "Wer ein Unternehmen betreiben will, das ausschließlich oder überwiegend der gewerbsmäßigen Aufstellung von Spielgeräten mit Gewinnmöglichkeit dient (Spielhalle), bedarf einer Erlaubnis nach § 33i GewO. Das Aufstellen einzelner Geldspielgeräte in Gaststätten oder anderen Betrieben erfordert eine Aufstellgenehmigung nach § 33c GewO. Seit der Änderung des Glücksspielstaatsvertrages (GlüStV 2021) gelten für Spielhallen verschärfte Abstandsregelungen (mind. 500 m zu anderen Spielhallen und zu Schulen), Spielersperren und Sozialkonzept-Pflichten, die durch Landesrecht variieren.",
        authorityType: "Ordnungsamt / Gewerbeamt, ggf. Glücksspielaufsichtsbehörde",
        authorityLevel: "state",
        requiredDocuments: "Führungszeugnis (Belegart O), Auszug aus dem Gewerbezentralregister, Grundrissplan, Nachweis der Einhaltung der Abstandsregelungen, Sozialkonzept, Nachweis der Spielgerätegenehmigungen (PTB-Zulassung)",
        costsEur: "500–2.000 €",
        processingTimeDays: "30–90 Tage",
        legalBasis: "§ 33i GewO (Spielhallen); § 33c GewO (Geldspielgeräte); GlüStV 2021; Landesspielhallengesetze",
        sourceUrl: GEWO_URL,
    },
    {
        permitKey: "fahrschule",
        permitCategory: "konzession",
        tradeCategory: "bildung_transport",
        permitType: "Fahrschulerlaubnis",
        labelDe: "Fahrschule",
        descriptionDe: "Wer eine Fahrschule betreibt, bedarf einer Fahrschulerlaubnis nach § 17 Fahrlehrergesetz (FahrlG). Voraussetzungen: Fahrlehrerlaubnis (alle zu erteilenden Klassen), Eignung als Fahrschulinhaber (Unterweisungslehrgang, Ausbildereignungsprüfung), geeignete Unterrichtsräume und Lehrfahrzeuge, Haftpflichtversicherung. Die Fahrschule muss bei der zuständigen Erlaubnisbehörde (i.d.R. Straßenverkehrsbehörde) registriert sein. Pro Fahrlehrer ist eine gesonderte Fahrlehrerlaubnis je Klasse erforderlich (A, B, BE, C, D, FE, DE).",
        authorityType: "Straßenverkehrsbehörde (Landratsamt / kreisfreie Stadt)",
        authorityLevel: "state",
        requiredDocuments: "Fahrlehrerlaubnis (alle relevanten Klassen), Unterweisungslehrgang für Fahrschulinhaber, Ausbildereignungsnachweis, Führungszeugnis, Nachweis geeigneter Unterrichtsräume (mind. 20 m², Ausstattungsanforderungen), Fahrzeugpapiere der Lehrfahrzeuge, Nachweis der Kfz-Haftpflichtversicherung",
        costsEur: "500–2.000 €",
        processingTimeDays: "30–90 Tage",
        legalBasis: "§§ 17–22 FahrlG (Fahrlehrergesetz); DV FahrlG (Durchführungsverordnung zum Fahrlehrergesetz)",
        sourceUrl: IHK_ERLAUBNISSE_URL,
    },
    // ── Meisterpflicht (Anlage A HwO) ─────────────────────────────────────────
    {
        permitKey: "maurer-betonbauer",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_bau",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Maurer und Betonbauer",
        descriptionDe: "Der Betrieb eines Maurer- und Betonbauerhandwerks in zulassungspflichtigem Handwerk (Anlage A HwO) erfordert die Eintragung in die Handwerksrolle. Voraussetzung ist ein Meisterbrief im Maurer- und Betonbauerhandwerk oder ein gleichwertiger Abschluss. Alternativ: Zulassung mit Ausnahmegenehmigung (§ 8 HwO) bei nachgewiesenen besonderen Kenntnissen oder EU-Anerkennungsrichtlinie (EU-Berufsanerkennungsrichtlinie 2005/36/EG für Inhaber ausländischer Berufsqualifikationen). Der Betrieb ohne Eintragung ist eine Ordnungswidrigkeit (§ 117 HwO). Ausnahmen: Nebenbetriebe gewerblicher Unternehmen (§ 3 HwO), Hilfsbetriebe (§ 5 HwO).",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Maurer und Betonbauer) oder gleichwertige Qualifikation, Personalausweis, Gewerbeanmeldung",
        costsEur: "150–400 € (Eintragungsgebühr HWK)",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 1 HwO; §§ 1, 7, 8 HwO (Handwerksordnung)",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "zimmerer",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_bau",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Zimmerer",
        descriptionDe: "Das Zimmererhandwerk (Holzkonstruktionen, Dachstuhlbau, Fertigung von Holzrahmenbauteilen) ist zulassungspflichtiges Handwerk nach Anlage A der Handwerksordnung. Zur selbstständigen Ausübung ist die Eintragung in die Handwerksrolle mit Meisterbrief (oder gleichwertiger Qualifikation) zwingend erforderlich. EU-Staatsangehörige können eine Anerkennung ausländischer Qualifikationen beantragen.",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Zimmerer) oder anerkannte gleichwertige Qualifikation, Personalausweis, Gewerbeanmeldung",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 2 HwO; §§ 1, 7, 8 HwO",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "dachdecker",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_bau",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Dachdecker",
        descriptionDe: "Das Dachdeckerhandwerk (Eindeckung und Abdichtung von Dächern, Außenwandbekleidungen) ist zulassungspflichtiges Handwerk. Die Eintragung in die Handwerksrolle mit Meisterbrief oder gleichwertiger anerkannter Qualifikation ist Pflicht. Dachdecker müssen zusätzlich Unfallverhütungsvorschriften der BG BAU beachten (DGUV-V 38, PSA gegen Absturz).",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Dachdecker), Personalausweis, Gewerbeanmeldung",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 4 HwO; §§ 1, 7, 8 HwO",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "elektrotechniker",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_elektro",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Elektrotechniker",
        descriptionDe: "Das Elektrotechnikerhandwerk ist zulassungspflichtiges Handwerk (Anlage A Nr. 25 HwO). Alle elektrotechnischen Installationsarbeiten in Gebäuden oder Anlagen, die in der VDE 0100 geregelten Spannungsbereichen ausgeführt werden, dürfen gewerbsmäßig nur von in die Handwerksrolle eingetragenen Betrieben ausgeführt werden. Meister- oder Gesellengeselle mit langjähriger Berufserfahrung und bestandener Unternehmerprüfung können Ausnahmegenehmigung nach § 8 HwO beantragen. Zusätzlich: VDEW/VDE-Konzessionsvertrag mit Netzbetreibern für Anschlussarbeiten erforderlich.",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Elektrotechniker) oder anerkannte Qualifikation, Personalausweis, Gewerbeanmeldung, ggf. Nachweis des Konzessionsvertrags mit dem Netzbetreiber",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 25 HwO; §§ 1, 7, 8 HwO; VDE 0100",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "installateur-heizungsbauer",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_sanitaer_heizung",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Installateur und Heizungsbauer",
        descriptionDe: "Das Handwerk der Installateure und Heizungsbauer (Gas-, Wasser-, Heizungsinstallation, Klimatechnik) ist zulassungspflichtiges Handwerk (Anlage A Nr. 24 HwO). Arbeiten an Gasanlagen erfordern zusätzlich die Konzessionierung durch den Gasnetzbetreiber (DVGW-Zertifizierung). Arbeiten an Heizungsanlagen in Gebäuden ab bestimmter Leistungsgrenze unterliegen zudem der EnEV/GEG (Gebäudeenergiegesetz) und müssen die Energieberatungspflicht beachten.",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Installateur und Heizungsbauer), Personalausweis, Gewerbeanmeldung, ggf. DVGW-Zertifizierung für Gasarbeiten",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 24 HwO; §§ 1, 7, 8 HwO; DVGW-Regelwerk",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "schornsteinfeger",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_bau",
        permitType: "Meisterpflicht (Anlage A HwO) + Bezirksbevollmächtigung",
        labelDe: "Schornsteinfeger",
        descriptionDe: "Das Schornsteinfegerhandwerk ist zulassungspflichtiges Handwerk (Anlage A Nr. 12 HwO). Zusätzlich zur Eintragung in die Handwerksrolle mit Meisterbrief verwaltet das Schornsteinfegerrecht ein duales System: Bevollmächtigte Bezirksschornsteinfeger werden durch die zuständige Behörde für 7 Jahre für einen bestimmten Kehrbezirk bestellt und führen hoheitliche Aufgaben durch (Feuerstättenbeschauen, Feuerstättenbescheid, Überprüfung nach Kehr- und Überprüfungsordnung). Freie Schornsteinfegerbetriebe können ohne Bestellung tätig sein (seit SchfHwG 2013), führen aber keine hoheitlichen Aufgaben durch.",
        authorityType: "Handwerkskammer (HWK); zuständige Behörde (Bestellung)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Schornsteinfeger), Personalausweis, Gewerbeanmeldung, ggf. Bewerbung für Bezirksstelle",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 12 HwO; §§ 1, 7, 8 HwO; SchfHwG (Schornsteinfeger-Handwerksgesetz)",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "friseur",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_koerperpflege",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Friseur",
        descriptionDe: "Das Friseurhandwerk ist seit der Novelle der Handwerksordnung 2004 (Anlage A Nr. 38 HwO) wieder zulassungspflichtiges Handwerk. Vorher war es zulassungsfreies Handwerk (Anlage B1). Die Meisterpflicht gilt für den Betriebsinhaber. Friseure müssen Hygienevorschriften (TRBA 250, Biostoffverordnung) einhalten und Desinfektionsmittel zur Wunddesinfektion bereitstellen. Gesellinnen und Gesellen können als Beschäftigte ohne Meisterpflicht tätig sein.",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Friseur), Personalausweis, Gewerbeanmeldung",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 38 HwO; §§ 1, 7, 8 HwO",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "augenoptiker",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_gesundheit",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Augenoptiker",
        descriptionDe: "Das Augenoptikerhandwerk (Anpassen und Verkauf von Sehhilfen, Refraktionsbestimmung) ist zulassungspflichtiges Handwerk (Anlage A Nr. 34 HwO). Die Eintragung in die Handwerksrolle mit Meisterbrief ist für den Betriebsinhaber verpflichtend. Augenoptiker dürfen Brillen anpassen und Sehstärken bestimmen, jedoch keine ophthalmologischen Diagnosen stellen (Abgrenzung zum Arztberuf). Kontaktlinsenanpassung gilt als Teil des Augenoptikerhandwerks.",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Augenoptiker), Personalausweis, Gewerbeanmeldung",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 34 HwO; §§ 1, 7, 8 HwO",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "zahntechniker",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_gesundheit",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Zahntechniker",
        descriptionDe: "Das Zahntechnikerhandwerk (Herstellung von Zahnersatz, Zahnprothesen, kieferorthopädischen Apparaten) ist zulassungspflichtiges Handwerk (Anlage A Nr. 37 HwO). Zahntechniker arbeiten ausschließlich auf Auftrag von Zahnärzten und haben keinen direkten Patientenkontakt. Die Eintragung in die Handwerksrolle mit Meisterbrief ist für den Betriebsinhaber verpflichtend. Medizinprodukte (Zahnersatz) unterliegen der Medizinprodukteverordnung (EU) 2017/745 (MDR) — eine CE-Zertifizierung als Hersteller ist erforderlich.",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Zahntechniker), Personalausweis, Gewerbeanmeldung, Registrierung als Medizinproduktehersteller (EUDAMED)",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 37 HwO; §§ 1, 7, 8 HwO; EU MDR 2017/745 (Medizinprodukteverordnung)",
        sourceUrl: HWO_URL,
    },
    {
        permitKey: "kfz-techniker",
        permitCategory: "meisterpflicht",
        tradeCategory: "handwerk_kfz",
        permitType: "Meisterpflicht (Anlage A HwO)",
        labelDe: "Kraftfahrzeugtechniker",
        descriptionDe: "Das Kraftfahrzeugtechnikerhandwerk (Diagnose, Reparatur und Wartung von Kraftfahrzeugen und deren Subsystemen) ist zulassungspflichtiges Handwerk (Anlage A Nr. 13 HwO). Die Eintragung in die Handwerksrolle mit Meisterbrief (Kraftfahrzeugtechniker) ist für den Betriebsinhaber verpflichtend. Zusätzliche Qualifikationen: für HU/AU-Berechtigte (§ 29 StVZO) ist die Anerkennung als Kraftfahrzeugsachverständigen-Beauftragter durch TÜV/DEKRA/GTÜ etc. notwendig. Betriebe mit Klimaanlagenwartung benötigen eine Zertifizierung nach EU 307/2008 (F-Gase-Verordnung).",
        authorityType: "Handwerkskammer (HWK)",
        authorityLevel: "state",
        requiredDocuments: "Meisterbrief (Kraftfahrzeugtechniker), Personalausweis, Gewerbeanmeldung, ggf. HU/AU-Berechtigung, ggf. F-Gase-Zertifizierung",
        costsEur: "150–400 €",
        processingTimeDays: "14–30 Tage",
        legalBasis: "Anlage A Nr. 13 HwO; §§ 1, 7, 8 HwO; § 29 StVZO (HU/AU); EU-VO 307/2008 (F-Gase)",
        sourceUrl: HWO_URL,
    },
    // ── Überwachungsbedürftige Anlagen (§§ 37–39 GewO, BetrSichV) ─────────────
    {
        permitKey: "druckgeraete-ueberwachung",
        permitCategory: "ueberwachungsbeduerftige_anlage",
        tradeCategory: "industrie_produktion",
        permitType: "Prüfpflicht überwachungsbedürftige Anlage",
        labelDe: "Druckgeräte und Druckbehälter",
        descriptionDe: "Druckgeräte (Dampfkessel, Druckbehälter, Rohrleitungen unter Druck) ab bestimmten Druckgrenzen und Volumina sind überwachungsbedürftige Anlagen nach § 37 GewO i. V. m. § 2 Nr. 30 ProdSG. Sie unterliegen der Betriebssicherheitsverordnung (BetrSichV). Pflichten: Prüfung vor Inbetriebnahme durch zugelassene Überwachungsstelle (ZÜS, z. B. TÜV, DEKRA, GTÜ) oder befähigte Person; wiederkehrende Prüfungen in festgelegten Intervallen (i.d.R. 2–10 Jahre je nach Anlage und Druck). Betreiber müssen eine Gefährdungsbeurteilung erstellen und ein Prüfbuch führen.",
        authorityType: "Zugelassene Überwachungsstelle (ZÜS): TÜV, DEKRA, GTÜ, SÜD, Rheinland",
        authorityLevel: "federal",
        requiredDocuments: "CE-Konformitätserklärung des Herstellers, Betriebsanleitung, Prüfbuch, Gefährdungsbeurteilung nach BetrSichV, Betreibernachweis",
        costsEur: "Abhängig von Größe und Art der Anlage (500–10.000 € pro Prüfung)",
        processingTimeDays: "Nach Vereinbarung mit ZÜS",
        legalBasis: "§§ 37–39 GewO; BetrSichV § 14–16; ProdSG § 2 Nr. 30; DruckgeräteV (14. ProdSV); EU DGRL 2014/68/EU",
        sourceUrl: GEWO_URL,
    },
    {
        permitKey: "aufzugsanlagen-ueberwachung",
        permitCategory: "ueberwachungsbeduerftige_anlage",
        tradeCategory: "immobilien",
        permitType: "Prüfpflicht überwachungsbedürftige Anlage",
        labelDe: "Aufzugsanlagen",
        descriptionDe: "Aufzugsanlagen (Personen- und Lastenaufzüge, Fahrtreppen, Förderanlagen) sind überwachungsbedürftige Anlagen nach § 37 GewO i. V. m. BetrSichV Anhang 2 Abschnitt 2. Pflichten des Betreibers: Prüfung vor erstmaliger Inbetriebnahme und nach wesentlichen Änderungen durch zugelassene Überwachungsstelle (ZÜS); wiederkehrende Hauptprüfung alle 2 Jahre, Zwischenprüfung alle 2 Jahre (versetzt), durch ZÜS oder befähigte Person. Notrufanlage nach EN 81-28 und Wartungsvertrag mit Aufzugsfirma sind gesetzlich vorgeschrieben. Betreiber haften für Unfälle bei mangelhafter Prüfung.",
        authorityType: "Zugelassene Überwachungsstelle (ZÜS): TÜV, DEKRA, GTÜ; zuständige Landesbehörde",
        authorityLevel: "state",
        requiredDocuments: "CE-Konformitätserklärung, Betriebsanleitung, Prüfbuch, Wartungsvertrag, Nachweis der Notrufanlage, Gefährdungsbeurteilung",
        costsEur: "500–3.000 € pro Prüfung",
        processingTimeDays: "Nach Vereinbarung mit ZÜS",
        legalBasis: "§§ 37–39 GewO; BetrSichV Anhang 2 Abschnitt 2; AufzV (12. ProdSV); EU AufzugsRL 2014/33/EU; EN 81-20, EN 81-50",
        sourceUrl: GEWO_URL,
    },
];
const BASELINE_BGS = [
    {
        bgKey: "bg-bau",
        name: "Berufsgenossenschaft der Bauwirtschaft",
        shortName: "BG BAU",
        sectorDescription: "Zuständige Berufsgenossenschaft für alle Unternehmen der Bauwirtschaft, des Gebäudereinigerhandwerks und weiterer bauverwandter Gewerbe. Alle Unternehmer und deren Beschäftigte im Baugewerbe sind kraft Gesetzes Mitglied der BG BAU (§ 2 SGB VII). Freiwillige Versicherung für Unternehmer ohne Beschäftigte möglich.",
        sectors: "Hochbau, Tiefbau, Ausbaugewerbe, Zimmerer, Dachdecker, Gerüstbau, Estrichleger, Fliesen-/Plattenleger, Maler und Lackierer, Gebäudereinigung, Schornsteinfeger, Stuckateure",
        membershipMandatory: true,
        websiteUrl: "https://www.bgbau.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bg-rci",
        name: "Berufsgenossenschaft Rohstoffe und chemische Industrie",
        shortName: "BG RCI",
        sectorDescription: "Zuständig für Unternehmen der Rohstoffgewinnung, der Chemischen Industrie, der Kautschukherstellung und des Mineralölhandels. Pflichtmitgliedschaft nach § 2 SGB VII für alle Arbeitgeber und deren Beschäftigte in diesen Branchen.",
        sectors: "Chemische Industrie, Kunststoffverarbeitung, Kautschuk, Bergbau, Steinbrüche, Mineralölverarbeitung, Mineralölhandel, Papier und Pappe, Kunststoff",
        membershipMandatory: true,
        websiteUrl: "https://www.bgrci.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bg-holz-metall",
        name: "Berufsgenossenschaft Holz und Metall",
        shortName: "BGHM",
        sectorDescription: "Größte gewerbliche Berufsgenossenschaft Deutschlands. Zuständig für Betriebe der metallverarbeitenden Industrie und des Metallhandwerks sowie der holzbe- und -verarbeitenden Industrie und des Tischlerhandwerks.",
        sectors: "Metallverarbeitung, Stahlbau, Maschinenbau, Elektroinstallation (Betriebe), Tischler, Schreiner, Holzbe- und -verarbeitung, Möbelherstellung, Sägewerke, Glasverarbeitung, Feinmechanik, Uhrmacher",
        membershipMandatory: true,
        websiteUrl: "https://www.bghm.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bgn",
        name: "Berufsgenossenschaft Nahrungsmittel und Gastgewerbe",
        shortName: "BGN",
        sectorDescription: "Zuständig für alle Unternehmen der Nahrungsmittelherstellung und -verarbeitung sowie des Gastgewerbes (Gastronomie, Hotellerie). Pflichtmitgliedschaft auch für Einzelunternehmer ohne Beschäftigte in diesen Branchen.",
        sectors: "Gastronomie, Hotellerie, Catering, Bäcker, Konditoren, Fleischer, Lebensmittelproduktion, Getränkeherstellung, Brauereien, Süßwarenindustrie, Tabak",
        membershipMandatory: true,
        websiteUrl: "https://www.bgn.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bg-verkehr",
        name: "Berufsgenossenschaft Verkehr",
        shortName: "BG Verkehr",
        sectorDescription: "Zuständig für Unternehmen des Straßen-, Schienen- und Luftverkehrs sowie der Binnenschifffahrt, Post, Telekommunikation und Zeitarbeit (teils). Taxiunternehmen und Speditionen sind Pflichtmitglieder.",
        sectors: "Taxiunternehmen, Mietwagenunternehmen, Omnibusunternehmen, Speditionen, Post- und Kurierdienste, Binnenschifffahrt, Luftfahrtunternehmen, Kraftfahrzeughandel, Kraftfahrzeugreparatur (teils), Parkhäuser, Fahrradkuriere",
        membershipMandatory: true,
        websiteUrl: "https://www.bg-verkehr.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "vbg",
        name: "Verwaltungs-Berufsgenossenschaft",
        shortName: "VBG",
        sectorDescription: "Zuständig für Unternehmen aus Verwaltung, Banken, Versicherungen, IT, Medien, freien Berufen und Bildung. Häufig die zuständige BG für Startups, Agenturen, IT-Firmen und Finanzdienstleister.",
        sectors: "Banken, Versicherungen, IT-Unternehmen, Unternehmensberatungen, Agenturen (Werbung, PR, Medien), freie Berufe (Steuerberater, Rechtsanwälte, Architekten), private Schulen, Verlage, Rundfunk, Fitnessstudios, Sicherheitsunternehmen (teils)",
        membershipMandatory: true,
        websiteUrl: "https://www.vbg.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bgw",
        name: "Berufsgenossenschaft für Gesundheitsdienst und Wohlfahrtspflege",
        shortName: "BGW",
        sectorDescription: "Zuständig für nichtstaatliche Einrichtungen des Gesundheitswesens, der Sozialen Arbeit und der Wohlfahrtspflege. Ärzte in Praxen, Physiotherapeuten, Pflegedienste und Krankenhäuser in freier Trägerschaft sind Pflichtmitglieder.",
        sectors: "Arztpraxen (niedergelassene Ärzte), Zahnarztpraxen, Physiotherapiepraxen, Apotheken, ambulante Pflegedienste, Krankenhäuser (freie Träger), Alten- und Pflegeheime (freie Träger), Behinderteneinrichtungen, Kindergärten (freie Träger), Hebammen",
        membershipMandatory: true,
        websiteUrl: "https://www.bgw-online.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bghw",
        name: "Berufsgenossenschaft Handel und Warenlogistik",
        shortName: "BGHW",
        sectorDescription: "Zuständig für Unternehmen des Einzelhandels, Großhandels und der Warenlogistik. Auch Online-Händler und Versandhändler sind Pflichtmitglieder, sofern die Lagerhaltung und Versandabwicklung im eigenen Betrieb erfolgt.",
        sectors: "Einzelhandel, Großhandel, Versandhandel (E-Commerce mit Lager), Warenlogistik, Lagerhaltung, Apotheken (teils, sofern keine BGW), Tankstellen, Kioske, Schreibwarenhandel",
        membershipMandatory: true,
        websiteUrl: "https://www.bghw.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "bg-etem",
        name: "Berufsgenossenschaft Energie Textil Elektro Medienerzeugnisse",
        shortName: "BG ETEM",
        sectorDescription: "Zuständig für Betriebe der Energie- und Wasserwirtschaft, der Elektrotechnik, der Textil- und Bekleidungsbranche sowie der Medienproduktion (Druckerzeugnisse, Verlage — Produktion). Für Elektroinstallationsbetriebe zuständig, für Elektrohandwerksbetriebe teils BGHM.",
        sectors: "Energieversorgungsunternehmen, Elektroanlagenbau, Elektrohandwerk (teils), Textilherstellung, Bekleidungsherstellung, Lederverarbeitung, Schuhe, Druckereien, Verlagswesen (Produktion), Papierverarbeitung",
        membershipMandatory: true,
        websiteUrl: "https://www.bgetem.de",
        sourceUrl: DGUV_BG_URL,
    },
    {
        bgKey: "svlfg",
        name: "Sozialversicherung für Landwirtschaft, Forsten und Gartenbau",
        shortName: "SVLFG",
        sectorDescription: "Träger der landwirtschaftlichen Unfallversicherung, Krankenversicherung, Pflegeversicherung und Alterssicherung. Zuständig für alle land- und forstwirtschaftlichen Unternehmen sowie Gärtnereibetriebe. Gartenbaubetriebe (Zierpflanzen, Baumschulen, Obst- und Gemüsebau) sind Pflichtmitglieder der SVLFG, nicht der BGHW.",
        sectors: "Landwirtschaft, Forstwirtschaft, Gartenbau (Zierpflanzen, Obst, Gemüse, Baumschulen), Weinbau, Imkerei, Fischerei (Binnengewässer), landwirtschaftliche Lohnunternehmen",
        membershipMandatory: true,
        websiteUrl: "https://www.svlfg.de",
        sourceUrl: DGUV_BG_URL,
    },
];
// ─── PermitsScraper ───────────────────────────────────────────────────────────
// Scrapes permit requirements from gesetze-im-internet.de (GewO, HwO) and ihk.de.
//
// Strategy: fragment-keyed URLs encode "permit={permitKey}" per record.
const PERMIT_SOURCE_URLS = Object.fromEntries(BASELINE_PERMITS.map((p) => [
    p.permitKey,
    `${p.sourceUrl}#permit=${encodeURIComponent(p.permitKey)}`,
]));
class PermitsScraper extends BaseScraper {
    constructor() {
        super({
            pipelineName: "scrape-genehmigungen-permits",
            pipelineDescription: "Scrapes German permit requirements (GewO, HwO, PBefG) from gesetze-im-internet.de and ihk.de (Silo 5: Genehmigungen & branchenspezifische Auflagen)",
            pipelineSchedule: "0 6 * * 1", // every Monday at 06:00 UTC
            requestDelayMs: 2000,
        });
    }
    async fetchUrls(_page) {
        return Object.values(PERMIT_SOURCE_URLS);
    }
    parsePage(html, url) {
        // Decode the permitKey from the fragment
        const match = url.match(/permit=([^&]+)/);
        const permitKey = match ? decodeURIComponent(match[1]) : null;
        if (!permitKey)
            return null;
        const baseline = BASELINE_PERMITS.find((p) => p.permitKey === permitKey);
        if (!baseline)
            return null;
        const $ = cheerio.load(html);
        // Attempt to enrich the description from the live page.
        const liveSection = extractSection($, [
            "erlaubnis",
            "genehmigung",
            "meisterpflicht",
            "handwerksrolle",
            "konzession",
            "bewachung",
            "gaststätten",
            "taxi",
        ]) ?? null;
        const descriptionDe = liveSection && liveSection.length > 120
            ? liveSection
            : baseline.descriptionDe;
        const record = {
            permitKey: baseline.permitKey,
            permitCategory: baseline.permitCategory,
            tradeCategory: baseline.tradeCategory,
            permitType: baseline.permitType,
            labelDe: baseline.labelDe,
            descriptionDe,
            authorityType: baseline.authorityType,
            authorityLevel: baseline.authorityLevel,
            requiredDocuments: baseline.requiredDocuments,
            costsEur: baseline.costsEur,
            processingTimeDays: baseline.processingTimeDays,
            legalBasis: baseline.legalBasis,
            sourceUrl: baseline.sourceUrl,
        };
        return { ...record, contentHash: makeHash(record) };
    }
    async diffRecord(record) {
        const existing = await db
            .select({ id: permits.id, contentHash: permits.contentHash })
            .from(permits)
            .where(eq(permits.permitKey, record.permitKey))
            .limit(1);
        if (existing.length === 0)
            return "new";
        if (existing[0].contentHash === record.contentHash)
            return "unchanged";
        return "updated";
    }
    async writeRecord(record) {
        const now = new Date();
        await db
            .insert(permits)
            .values({
            permitKey: record.permitKey,
            permitCategory: record.permitCategory,
            tradeCategory: record.tradeCategory,
            permitType: record.permitType,
            labelDe: record.labelDe,
            descriptionDe: record.descriptionDe,
            authorityType: record.authorityType,
            authorityLevel: record.authorityLevel,
            requiredDocuments: record.requiredDocuments,
            costsEur: record.costsEur,
            processingTimeDays: record.processingTimeDays,
            legalBasis: record.legalBasis,
            sourceUrl: record.sourceUrl,
            contentHash: record.contentHash,
            scrapedAt: now,
        })
            .onConflictDoUpdate({
            target: [permits.permitKey],
            set: {
                permitCategory: record.permitCategory,
                tradeCategory: record.tradeCategory,
                permitType: record.permitType,
                labelDe: record.labelDe,
                descriptionDe: record.descriptionDe,
                authorityType: record.authorityType,
                authorityLevel: record.authorityLevel,
                requiredDocuments: record.requiredDocuments,
                costsEur: record.costsEur,
                processingTimeDays: record.processingTimeDays,
                legalBasis: record.legalBasis,
                sourceUrl: record.sourceUrl,
                contentHash: record.contentHash,
                scrapedAt: now,
                updatedAt: now,
            },
        });
    }
}
// ─── BerufsgenossenschaftenScraper ────────────────────────────────────────────
// Scrapes BG sector assignments and membership obligations from dguv.de.
//
// Strategy: fragment-keyed URLs encode "bg={bgKey}" per record.
const BG_SOURCE_URLS = Object.fromEntries(BASELINE_BGS.map((bg) => [
    bg.bgKey,
    `${DGUV_BG_URL}#bg=${encodeURIComponent(bg.bgKey)}`,
]));
class BerufsgenossenschaftenScraper extends BaseScraper {
    constructor() {
        super({
            pipelineName: "scrape-genehmigungen-bg",
            pipelineDescription: "Scrapes Berufsgenossenschaft sector assignments from dguv.de (Silo 5: Genehmigungen & branchenspezifische Auflagen)",
            pipelineSchedule: "0 6 * * 1", // every Monday at 06:00 UTC
            requestDelayMs: 2000,
        });
    }
    async fetchUrls(_page) {
        return Object.values(BG_SOURCE_URLS);
    }
    parsePage(html, url) {
        // Decode the bgKey from the fragment
        const match = url.match(/bg=([^&]+)/);
        const bgKey = match ? decodeURIComponent(match[1]) : null;
        if (!bgKey)
            return null;
        const baseline = BASELINE_BGS.find((bg) => bg.bgKey === bgKey);
        if (!baseline)
            return null;
        const $ = cheerio.load(html);
        // Attempt to enrich the sector description from the live page.
        const liveSection = extractSection($, [
            "zuständigkeit",
            "zustaendigkeit",
            "branche",
            "berufsgenossenschaft",
            "mitgliedschaft",
            "beitragsberechnung",
        ]) ?? null;
        const sectorDescription = liveSection && liveSection.length > 80
            ? liveSection
            : baseline.sectorDescription;
        const record = {
            bgKey: baseline.bgKey,
            name: baseline.name,
            shortName: baseline.shortName,
            sectorDescription,
            sectors: baseline.sectors,
            membershipMandatory: baseline.membershipMandatory,
            websiteUrl: baseline.websiteUrl,
            sourceUrl: baseline.sourceUrl,
        };
        return { ...record, contentHash: makeHash(record) };
    }
    async diffRecord(record) {
        const existing = await db
            .select({
            id: berufsgenossenschaften.id,
            contentHash: berufsgenossenschaften.contentHash,
        })
            .from(berufsgenossenschaften)
            .where(eq(berufsgenossenschaften.bgKey, record.bgKey))
            .limit(1);
        if (existing.length === 0)
            return "new";
        if (existing[0].contentHash === record.contentHash)
            return "unchanged";
        return "updated";
    }
    async writeRecord(record) {
        const now = new Date();
        await db
            .insert(berufsgenossenschaften)
            .values({
            bgKey: record.bgKey,
            name: record.name,
            shortName: record.shortName,
            sectorDescription: record.sectorDescription,
            sectors: record.sectors,
            membershipMandatory: record.membershipMandatory,
            websiteUrl: record.websiteUrl,
            sourceUrl: record.sourceUrl,
            contentHash: record.contentHash,
            scrapedAt: now,
        })
            .onConflictDoUpdate({
            target: [berufsgenossenschaften.bgKey],
            set: {
                name: record.name,
                shortName: record.shortName,
                sectorDescription: record.sectorDescription,
                sectors: record.sectors,
                membershipMandatory: record.membershipMandatory,
                websiteUrl: record.websiteUrl,
                sourceUrl: record.sourceUrl,
                contentHash: record.contentHash,
                scrapedAt: now,
                updatedAt: now,
            },
        });
    }
}
// ─── Exported entry point ─────────────────────────────────────────────────────
export async function scrapeGenehmigungen() {
    const permitsScraper = new PermitsScraper();
    const bgScraper = new BerufsgenossenschaftenScraper();
    const permitsStats = await permitsScraper.run();
    const bgStats = await bgScraper.run();
    console.log(`[scrape-genehmigungen] Permits — new: ${permitsStats.newCount}, updated: ${permitsStats.updatedCount}, unchanged: ${permitsStats.unchangedCount}`);
    console.log(`[scrape-genehmigungen] BGs — new: ${bgStats.newCount}, updated: ${bgStats.updatedCount}, unchanged: ${bgStats.unchangedCount}`);
}
//# sourceMappingURL=scrape-genehmigungen.js.map