export declare const sourceFingerprints: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "source_fingerprints";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "source_fingerprints";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        url: import("drizzle-orm/pg-core").PgColumn<{
            name: "url";
            tableName: "source_fingerprints";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        etag: import("drizzle-orm/pg-core").PgColumn<{
            name: "etag";
            tableName: "source_fingerprints";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        lastModified: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_modified";
            tableName: "source_fingerprints";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        contentHash: import("drizzle-orm/pg-core").PgColumn<{
            name: "content_hash";
            tableName: "source_fingerprints";
            dataType: "string";
            columnType: "PgVarchar";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        lastCheckedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_checked_at";
            tableName: "source_fingerprints";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        lastChangedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "last_changed_at";
            tableName: "source_fingerprints";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        checkCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "check_count";
            tableName: "source_fingerprints";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        changeCount: import("drizzle-orm/pg-core").PgColumn<{
            name: "change_count";
            tableName: "source_fingerprints";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        avgChangeIntervalHours: import("drizzle-orm/pg-core").PgColumn<{
            name: "avg_change_interval_hours";
            tableName: "source_fingerprints";
            dataType: "number";
            columnType: "PgDoublePrecision";
            data: number;
            driverParam: string | number;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        createdAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "created_at";
            tableName: "source_fingerprints";
            dataType: "date";
            columnType: "PgTimestamp";
            data: Date;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "updated_at";
            tableName: "source_fingerprints";
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
//# sourceMappingURL=source_fingerprints.d.ts.map