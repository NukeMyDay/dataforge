export declare const settings: import("drizzle-orm/pg-core").PgTableWithColumns<{
    name: "settings";
    schema: undefined;
    columns: {
        key: import("drizzle-orm/pg-core").PgColumn<{
            name: "key";
            tableName: "settings";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: true;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        value: import("drizzle-orm/pg-core").PgColumn<{
            name: "value";
            tableName: "settings";
            dataType: "string";
            columnType: "PgText";
            data: string;
            driverParam: string;
            notNull: false;
            hasDefault: false;
            enumValues: [string, ...string[]];
            baseColumn: never;
        }, {}, {}>;
        updatedAt: import("drizzle-orm/pg-core").PgColumn<{
            name: any;
            tableName: "settings";
            dataType: any;
            columnType: any;
            data: any;
            driverParam: any;
            notNull: any;
            hasDefault: any;
            enumValues: any;
            baseColumn: any;
        }, {}, {}>;
    };
    dialect: "pg";
}>;
//# sourceMappingURL=settings.d.ts.map