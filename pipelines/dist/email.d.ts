export interface EmailOptions {
    to: string;
    subject: string;
    text: string;
    html?: string;
}
export declare function sendEmail(opts: EmailOptions): Promise<boolean>;
export declare function sendWelcomeEmail(email: string): Promise<void>;
export declare function sendApiKeyQuotaWarningEmail(email: string, usedPercent: number): Promise<void>;
export declare function sendApiKeyExpiryWarningEmail(email: string, keyName: string, daysLeft: number): Promise<void>;
//# sourceMappingURL=email.d.ts.map