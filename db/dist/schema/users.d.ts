export declare const userTierEnum: import("drizzle-orm/pg-core").PgEnum<["free", "pro", "enterprise"]>;
export declare const userStatusEnum: import("drizzle-orm/pg-core").PgEnum<["active", "suspended", "deleted"]>;
export declare const users: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "users";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "users";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        email: import("drizzle-orm/pg-core").PgColumn<{
            name: "email";
            tableName: "users";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        passwordHash: import("drizzle-orm/pg-core").PgColumn<{
            name: "password_hash";
            tableName: "users";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        tier: import("drizzle-orm/pg-core").PgColumn<{
            name: "tier";
            tableName: "users";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "free" | "pro" | "enterprise";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["free", "pro", "enterprise"];
            baseColumn: never;
        }, {}, {}>;
        status: import("drizzle-orm/pg-core").PgColumn<{
            name: "status";
            tableName: "users";
            dataType: "string";
            columnType: "PgEnumColumn";
            data: "active" | "suspended" | "deleted";
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: ["active", "suspended", "deleted"];
            baseColumn: never;
        }, {}, {}>;
        stripeCustomerId: import("drizzle-orm/pg-core").PgColumn<{
            name: "stripe_customer_id";
            tableName: "users";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        stripeSubscriptionId: import("drizzle-orm/pg-core").PgColumn<{
            name: "stripe_subscription_id";
            tableName: "users";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        stripeSubscriptionStatus: import("drizzle-orm/pg-core").PgColumn<{
            name: "stripe_subscription_status";
            tableName: "users";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        stripePriceId: import("drizzle-orm/pg-core").PgColumn<{
            name: "stripe_price_id";
            tableName: "users";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        subscriptionCurrentPeriodEnd: import("drizzle-orm/pg-core").PgColumn<{
            name: "subscription_current_period_end";
            tableName: "users";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        isActive: import("drizzle-orm/pg-core").PgColumn<{
            name: "is_active";
            tableName: "users";
            dataType: "boolean";
            columnType: "PgBoolean";
            data: boolean;
            driverParam: boolean;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "users";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
//# sourceMappingURL=users.d.ts.map