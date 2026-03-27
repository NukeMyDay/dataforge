export declare const recordQualityScores: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "record_quality_scores";
    schema: undefined;
    columns: {
        id: import("drizzle-orm/pg-core").PgColumn<{
            name: "id";
            tableName: "record_quality_scores";
            dataType: "number";
            columnType: "PgSerial";
            data: number;
            driverParam: number;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        silo: import("drizzle-orm/pg-core").PgColumn<{
            name: "silo";
            tableName: "record_quality_scores";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        recordId: import("drizzle-orm/pg-core").PgColumn<{
            name: "record_id";
            tableName: "record_quality_scores";
            dataType: "number";
            columnType: "PgInteger";
            data: number;
            driverParam: string | number;
            notNull: true;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        completenessScore: import("drizzle-orm/pg-core").PgColumn<{
            name: "completeness_score";
            tableName: "record_quality_scores";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        freshnessScore: import("drizzle-orm/pg-core").PgColumn<{
            name: "freshness_score";
            tableName: "record_quality_scores";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        sourceAuthorityScore: import("drizzle-orm/pg-core").PgColumn<{
            name: "source_authority_score";
            tableName: "record_quality_scores";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        qualityScore: import("drizzle-orm/pg-core").PgColumn<{
            name: "quality_score";
            tableName: "record_quality_scores";
            dataType: "string";
            columnType: "PgNumeric";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: true;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        metadata: import("drizzle-orm/pg-core").PgColumn<{
            name: "metadata";
            tableName: "record_quality_scores";
            dataType: "json";
            columnType: "PgJsonb";
            data: Record<string, unknown>;
            driverParam: unknown;
            notNull: false;
            hasDefault: false;
            enumValues: undefined;
            baseColumn: never;
        }, {}, {}>;
        computedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: "computed_at";
            tableName: "record_quality_scores";
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
//# sourceMappingURL=data_quality.d.ts.map