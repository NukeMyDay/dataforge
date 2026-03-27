import { BaseScraper, type DiffResult } from "../lib/base-scraper.js";
import type { Page } from "playwright";
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
export declare class HandelsregisterScraper extends BaseScraper<ParsedHrObligation | ParsedNotaryCost> {
    constructor();
    protected fetchUrls(_page: Page): Promise<string[]>;
    protected parsePage(html: string, url: string): ParsedHrObligation | ParsedNotaryCost | null;
    private parseObligationPage;
    private parseNotaryCostPage;
    protected diffRecord(record: ParsedHrObligation | ParsedNotaryCost): Promise<DiffResult>;
    private diffObligation;
    private diffNotaryCost;
    protected writeRecord(record: ParsedHrObligation | ParsedNotaryCost): Promise<void>;
    private writeObligation;
    private writeNotaryCost;
}
export {};
//# sourceMappingURL=scrape-handelsregister.d.ts.map