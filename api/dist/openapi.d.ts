export declare const openApiSpec: {
    readonly openapi: "3.0.0";
    readonly info: {
        readonly title: "DataForge API";
        readonly version: "1.0.0";
        readonly description: "Self-hosted API-first structured data platform. Provides access to education (study programs, institutions) and regulatory data.";
    };
    readonly servers: readonly [{
        readonly url: "/v1";
        readonly description: "DataForge v1";
    }];
    readonly components: {
        readonly securitySchemes: {
            readonly ApiKey: {
                readonly type: "apiKey";
                readonly in: "header";
                readonly name: "X-API-Key";
                readonly description: "API key for data endpoints";
            };
            readonly BearerJWT: {
                readonly type: "http";
                readonly scheme: "bearer";
                readonly bearerFormat: "JWT";
                readonly description: "JWT token from /v1/auth/login or /v1/auth/register";
            };
        };
        readonly schemas: {
            readonly Error: {
                readonly type: "object";
                readonly properties: {
                    readonly data: {
                        readonly nullable: true;
                        readonly example: null;
                    };
                    readonly meta: {
                        readonly nullable: true;
                        readonly example: null;
                    };
                    readonly error: {
                        readonly type: "string";
                    };
                };
            };
            readonly Pagination: {
                readonly type: "object";
                readonly properties: {
                    readonly page: {
                        readonly type: "integer";
                    };
                    readonly pageSize: {
                        readonly type: "integer";
                    };
                    readonly total: {
                        readonly type: "integer";
                    };
                    readonly totalPages: {
                        readonly type: "integer";
                    };
                };
            };
            readonly Program: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "integer";
                    };
                    readonly slug: {
                        readonly type: "string";
                    };
                    readonly titleEn: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly titleDe: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly titleNl: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly degreeType: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly fieldOfStudy: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly language: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly country: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly durationMonths: {
                        readonly type: "integer";
                        readonly nullable: true;
                    };
                    readonly isActive: {
                        readonly type: "boolean";
                    };
                    readonly institutionId: {
                        readonly type: "integer";
                        readonly nullable: true;
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                    readonly updatedAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
            };
            readonly Institution: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "integer";
                    };
                    readonly slug: {
                        readonly type: "string";
                    };
                    readonly nameEn: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly nameDe: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly country: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly city: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly websiteUrl: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly isActive: {
                        readonly type: "boolean";
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                    readonly updatedAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
            };
            readonly Regulation: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "integer";
                    };
                    readonly slug: {
                        readonly type: "string";
                    };
                    readonly titleDe: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly titleEn: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly category: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly jurisdiction: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly isActive: {
                        readonly type: "boolean";
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                    readonly updatedAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
            };
            readonly User: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "integer";
                    };
                    readonly email: {
                        readonly type: "string";
                        readonly format: "email";
                    };
                    readonly tier: {
                        readonly type: "string";
                        readonly example: "free";
                    };
                    readonly status: {
                        readonly type: "string";
                        readonly example: "active";
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
            };
            readonly ApiKey: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "integer";
                    };
                    readonly name: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly tier: {
                        readonly type: "string";
                    };
                    readonly isActive: {
                        readonly type: "boolean";
                    };
                    readonly lastUsedAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                        readonly nullable: true;
                    };
                    readonly requestCount: {
                        readonly type: "integer";
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
            };
            readonly FundingProgram: {
                readonly type: "object";
                readonly properties: {
                    readonly id: {
                        readonly type: "integer";
                    };
                    readonly slug: {
                        readonly type: "string";
                    };
                    readonly titleDe: {
                        readonly type: "string";
                    };
                    readonly titleEn: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly fundingType: {
                        readonly type: "string";
                        readonly nullable: true;
                        readonly description: "Förderart: Zuschuss, Darlehen, Garantie, etc.";
                    };
                    readonly fundingArea: {
                        readonly type: "string";
                        readonly nullable: true;
                        readonly description: "Förderbereich: Existenzgründung, Forschung, etc.";
                    };
                    readonly fundingRegion: {
                        readonly type: "string";
                        readonly nullable: true;
                        readonly description: "Fördergebiet";
                    };
                    readonly eligibleApplicants: {
                        readonly type: "string";
                        readonly nullable: true;
                        readonly description: "Förderberechtigte";
                    };
                    readonly fundingAmountInfo: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly level: {
                        readonly type: "string";
                        readonly nullable: true;
                        readonly enum: readonly ["bund", "land", "eu"];
                    };
                    readonly state: {
                        readonly type: "string";
                        readonly nullable: true;
                        readonly description: "Bundesland if level=land";
                    };
                    readonly category: {
                        readonly type: "string";
                        readonly nullable: true;
                    };
                    readonly sourceUrl: {
                        readonly type: "string";
                        readonly format: "uri";
                    };
                    readonly isActive: {
                        readonly type: "boolean";
                    };
                    readonly version: {
                        readonly type: "integer";
                    };
                    readonly createdAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                    readonly updatedAt: {
                        readonly type: "string";
                        readonly format: "date-time";
                    };
                };
            };
        };
    };
    readonly paths: {
        readonly "/programs": {
            readonly get: {
                readonly summary: "List study programs";
                readonly description: "Returns a paginated list of study programs with optional filters.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Programs"];
                readonly parameters: readonly [{
                    readonly name: "page";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 1;
                    };
                }, {
                    readonly name: "pageSize";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 50;
                        readonly maximum: 200;
                    };
                }, {
                    readonly name: "country";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "degreeType";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "fieldOfStudy";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "language";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "institutionId";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                    };
                }, {
                    readonly name: "isActive";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                        readonly enum: readonly ["true", "false"];
                    };
                }, {
                    readonly name: "q";
                    readonly in: "query";
                    readonly description: "Full-text search";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "sort";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                        readonly default: "updatedAt:desc";
                        readonly example: "titleEn:asc";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Paginated list of programs";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly $ref: "#/components/schemas/Program";
                                            };
                                        };
                                        readonly pagination: {
                                            readonly $ref: "#/components/schemas/Pagination";
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/programs/{id}": {
            readonly get: {
                readonly summary: "Get a study program";
                readonly description: "Returns a single program by numeric id or slug, including its institution.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Programs"];
                readonly parameters: readonly [{
                    readonly name: "id";
                    readonly in: "path";
                    readonly required: true;
                    readonly description: "Numeric id or slug";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Program with institution";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly allOf: readonly [{
                                                readonly $ref: "#/components/schemas/Program";
                                            }, {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly institution: {
                                                        readonly $ref: "#/components/schemas/Institution";
                                                    };
                                                };
                                            }];
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "404": {
                        readonly description: "Not found";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/institutions": {
            readonly get: {
                readonly summary: "List institutions";
                readonly description: "Returns a paginated list of higher-education institutions.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Institutions"];
                readonly parameters: readonly [{
                    readonly name: "page";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 1;
                    };
                }, {
                    readonly name: "pageSize";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 50;
                        readonly maximum: 200;
                    };
                }, {
                    readonly name: "country";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "q";
                    readonly in: "query";
                    readonly description: "Full-text search";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Paginated list of institutions";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly $ref: "#/components/schemas/Institution";
                                            };
                                        };
                                        readonly pagination: {
                                            readonly $ref: "#/components/schemas/Pagination";
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/institutions/{id}": {
            readonly get: {
                readonly summary: "Get an institution";
                readonly description: "Returns a single institution by numeric id or slug.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Institutions"];
                readonly parameters: readonly [{
                    readonly name: "id";
                    readonly in: "path";
                    readonly required: true;
                    readonly description: "Numeric id or slug";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Institution";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly $ref: "#/components/schemas/Institution";
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "404": {
                        readonly description: "Not found";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/regulations": {
            readonly get: {
                readonly summary: "List regulations";
                readonly description: "Returns a paginated list of German regulatory data.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Regulations"];
                readonly parameters: readonly [{
                    readonly name: "page";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 1;
                    };
                }, {
                    readonly name: "pageSize";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 50;
                        readonly maximum: 200;
                    };
                }, {
                    readonly name: "jurisdiction";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "category";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "q";
                    readonly in: "query";
                    readonly description: "Full-text search";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Paginated list of regulations";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly $ref: "#/components/schemas/Regulation";
                                            };
                                        };
                                        readonly pagination: {
                                            readonly $ref: "#/components/schemas/Pagination";
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/regulations/{id}": {
            readonly get: {
                readonly summary: "Get a regulation";
                readonly description: "Returns a single regulation by numeric id or slug.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Regulations"];
                readonly parameters: readonly [{
                    readonly name: "id";
                    readonly in: "path";
                    readonly required: true;
                    readonly description: "Numeric id or slug";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Regulation";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly $ref: "#/components/schemas/Regulation";
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "404": {
                        readonly description: "Not found";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/funding": {
            readonly get: {
                readonly summary: "List funding programs";
                readonly description: "Returns a paginated list of German federal funding programs scraped from foerderdatenbank.de (BMWK). Supports full-text search in German.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Funding"];
                readonly parameters: readonly [{
                    readonly name: "page";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 1;
                    };
                }, {
                    readonly name: "pageSize";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "integer";
                        readonly default: 50;
                        readonly maximum: 200;
                    };
                }, {
                    readonly name: "region";
                    readonly in: "query";
                    readonly description: "Filter by Fördergebiet (partial match)";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "type";
                    readonly in: "query";
                    readonly description: "Filter by Förderart (partial match)";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "target_group";
                    readonly in: "query";
                    readonly description: "Filter by Förderberechtigte (partial match)";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "level";
                    readonly in: "query";
                    readonly description: "Filter by level: bund, land, eu";
                    readonly schema: {
                        readonly type: "string";
                        readonly enum: readonly ["bund", "land", "eu"];
                    };
                }, {
                    readonly name: "state";
                    readonly in: "query";
                    readonly description: "Filter by Bundesland (partial match)";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "q";
                    readonly in: "query";
                    readonly description: "Full-text search (German)";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Paginated list of funding programs";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly $ref: "#/components/schemas/FundingProgram";
                                            };
                                        };
                                        readonly meta: {
                                            readonly $ref: "#/components/schemas/Pagination";
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/funding/{id}": {
            readonly get: {
                readonly summary: "Get a funding program";
                readonly description: "Returns a single funding program by numeric id or slug, including full content fields.";
                readonly security: readonly [{
                    readonly ApiKey: readonly [];
                }];
                readonly tags: readonly ["Funding"];
                readonly parameters: readonly [{
                    readonly name: "id";
                    readonly in: "path";
                    readonly required: true;
                    readonly description: "Numeric id or slug";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Funding program detail";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly $ref: "#/components/schemas/FundingProgram";
                                        };
                                        readonly meta: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "404": {
                        readonly description: "Not found";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/auth/register": {
            readonly post: {
                readonly summary: "Register a new user";
                readonly tags: readonly ["Auth"];
                readonly requestBody: {
                    readonly required: true;
                    readonly content: {
                        readonly "application/json": {
                            readonly schema: {
                                readonly type: "object";
                                readonly required: readonly ["email", "password"];
                                readonly properties: {
                                    readonly email: {
                                        readonly type: "string";
                                        readonly format: "email";
                                    };
                                    readonly password: {
                                        readonly type: "string";
                                        readonly minLength: 8;
                                    };
                                };
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly "201": {
                        readonly description: "User registered, JWT returned";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly token: {
                                                    readonly type: "string";
                                                };
                                                readonly user: {
                                                    readonly $ref: "#/components/schemas/User";
                                                };
                                            };
                                        };
                                        readonly meta: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "400": {
                        readonly description: "Validation error";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                    readonly "409": {
                        readonly description: "Email already registered";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/auth/login": {
            readonly post: {
                readonly summary: "Log in and get a JWT";
                readonly tags: readonly ["Auth"];
                readonly requestBody: {
                    readonly required: true;
                    readonly content: {
                        readonly "application/json": {
                            readonly schema: {
                                readonly type: "object";
                                readonly required: readonly ["email", "password"];
                                readonly properties: {
                                    readonly email: {
                                        readonly type: "string";
                                        readonly format: "email";
                                    };
                                    readonly password: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly "200": {
                        readonly description: "Login successful";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly token: {
                                                    readonly type: "string";
                                                };
                                                readonly user: {
                                                    readonly $ref: "#/components/schemas/User";
                                                };
                                            };
                                        };
                                        readonly meta: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "401": {
                        readonly description: "Invalid credentials";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/auth/me": {
            readonly get: {
                readonly summary: "Get current user";
                readonly description: "Returns the authenticated user's profile. Requires Bearer JWT.";
                readonly security: readonly [{
                    readonly BearerJWT: readonly [];
                }];
                readonly tags: readonly ["Auth"];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Current user";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly $ref: "#/components/schemas/User";
                                        };
                                        readonly meta: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "401": {
                        readonly description: "Unauthorized";
                    };
                    readonly "404": {
                        readonly description: "User not found";
                    };
                };
            };
        };
        readonly "/auth/api-keys": {
            readonly post: {
                readonly summary: "Generate a new API key";
                readonly description: "Creates a new API key for the authenticated user. The raw key is returned once only.";
                readonly security: readonly [{
                    readonly BearerJWT: readonly [];
                }];
                readonly tags: readonly ["Auth"];
                readonly requestBody: {
                    readonly content: {
                        readonly "application/json": {
                            readonly schema: {
                                readonly type: "object";
                                readonly properties: {
                                    readonly name: {
                                        readonly type: "string";
                                        readonly maxLength: 128;
                                        readonly description: "Optional label for the key";
                                    };
                                };
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly "201": {
                        readonly description: "API key created";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly allOf: readonly [{
                                                readonly $ref: "#/components/schemas/ApiKey";
                                            }, {
                                                readonly type: "object";
                                                readonly properties: {
                                                    readonly key: {
                                                        readonly type: "string";
                                                        readonly description: "Raw key — shown once only";
                                                    };
                                                };
                                            }];
                                        };
                                        readonly meta: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "401": {
                        readonly description: "Unauthorized";
                    };
                };
            };
            readonly get: {
                readonly summary: "List API keys";
                readonly description: "Returns all active API keys for the authenticated user.";
                readonly security: readonly [{
                    readonly BearerJWT: readonly [];
                }];
                readonly tags: readonly ["Auth"];
                readonly responses: {
                    readonly "200": {
                        readonly description: "List of API keys";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "array";
                                            readonly items: {
                                                readonly $ref: "#/components/schemas/ApiKey";
                                            };
                                        };
                                        readonly meta: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly total: {
                                                    readonly type: "integer";
                                                };
                                            };
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "401": {
                        readonly description: "Unauthorized";
                    };
                };
            };
        };
        readonly "/stats": {
            readonly get: {
                readonly summary: "Platform statistics";
                readonly description: "Returns aggregate counts: programs, institutions, regulations, countries, and last-updated timestamp.";
                readonly tags: readonly ["Misc"];
                readonly responses: {
                    readonly "200": {
                        readonly description: "Stats";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly programCount: {
                                                    readonly type: "integer";
                                                };
                                                readonly institutionCount: {
                                                    readonly type: "integer";
                                                };
                                                readonly regulationCount: {
                                                    readonly type: "integer";
                                                };
                                                readonly countryCount: {
                                                    readonly type: "integer";
                                                };
                                                readonly lastUpdated: {
                                                    readonly type: "string";
                                                    readonly format: "date-time";
                                                    readonly nullable: true;
                                                };
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/programs/export": {
            readonly get: {
                readonly summary: "Export programs";
                readonly description: "Bulk export of programs as CSV or NDJSON. No API key required. Max 10 000 rows.";
                readonly tags: readonly ["Programs"];
                readonly parameters: readonly [{
                    readonly name: "format";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                        readonly enum: readonly ["csv", "json"];
                        readonly default: "json";
                    };
                }, {
                    readonly name: "country";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }, {
                    readonly name: "degreeType";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "CSV or NDJSON file download";
                        readonly content: {
                            readonly "text/csv": {
                                readonly schema: {
                                    readonly type: "string";
                                };
                            };
                            readonly "application/x-ndjson": {
                                readonly schema: {
                                    readonly type: "string";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/regulations/export": {
            readonly get: {
                readonly summary: "Export regulations";
                readonly description: "Bulk export of regulations as CSV or NDJSON. No API key required. Max 10 000 rows.";
                readonly tags: readonly ["Regulations"];
                readonly parameters: readonly [{
                    readonly name: "format";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                        readonly enum: readonly ["csv", "json"];
                        readonly default: "json";
                    };
                }, {
                    readonly name: "jurisdiction";
                    readonly in: "query";
                    readonly schema: {
                        readonly type: "string";
                    };
                }];
                readonly responses: {
                    readonly "200": {
                        readonly description: "CSV or NDJSON file download";
                        readonly content: {
                            readonly "text/csv": {
                                readonly schema: {
                                    readonly type: "string";
                                };
                            };
                            readonly "application/x-ndjson": {
                                readonly schema: {
                                    readonly type: "string";
                                };
                            };
                        };
                    };
                };
            };
        };
        readonly "/chat": {
            readonly post: {
                readonly summary: "AI chat";
                readonly description: "Send a message to the DataForge AI assistant. Rate-limited by IP.";
                readonly tags: readonly ["Chat"];
                readonly requestBody: {
                    readonly required: true;
                    readonly content: {
                        readonly "application/json": {
                            readonly schema: {
                                readonly type: "object";
                                readonly required: readonly ["message"];
                                readonly properties: {
                                    readonly message: {
                                        readonly type: "string";
                                    };
                                };
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly "200": {
                        readonly description: "AI response";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly reply: {
                                                    readonly type: "string";
                                                };
                                            };
                                        };
                                        readonly meta: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "429": {
                        readonly description: "Rate limit exceeded";
                    };
                };
            };
        };
        readonly "/assistant": {
            readonly post: {
                readonly summary: "Sophex Startup Assistant";
                readonly description: "Agentic AI assistant for German founders. Anonymous — no API key required. Rate-limited to 10 requests/minute per IP. Client sends the full messages array for stateless multi-turn conversations. The assistant queries the Sophex DB via 8 built-in tools and returns grounded answers in German with source citations.";
                readonly tags: readonly ["Assistant"];
                readonly requestBody: {
                    readonly required: true;
                    readonly content: {
                        readonly "application/json": {
                            readonly schema: {
                                readonly type: "object";
                                readonly required: readonly ["messages"];
                                readonly properties: {
                                    readonly messages: {
                                        readonly type: "array";
                                        readonly description: "Full conversation history (stateless multi-turn).";
                                        readonly items: {
                                            readonly type: "object";
                                            readonly required: readonly ["role", "content"];
                                            readonly properties: {
                                                readonly role: {
                                                    readonly type: "string";
                                                    readonly enum: readonly ["user", "assistant"];
                                                };
                                                readonly content: {
                                                    readonly type: "string";
                                                    readonly minLength: 1;
                                                };
                                            };
                                        };
                                    };
                                    readonly context: {
                                        readonly type: "object";
                                        readonly description: "Optional founder context injected into the system prompt.";
                                        readonly properties: {
                                            readonly bundesland: {
                                                readonly type: "string";
                                                readonly example: "Bayern";
                                            };
                                            readonly rechtsform: {
                                                readonly type: "string";
                                                readonly example: "gmbh";
                                            };
                                        };
                                    };
                                };
                            };
                        };
                    };
                };
                readonly responses: {
                    readonly "200": {
                        readonly description: "Grounded answer with source citations";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly type: "object";
                                    readonly properties: {
                                        readonly data: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly reply: {
                                                    readonly type: "string";
                                                    readonly description: "AI-generated answer in German (or English if user wrote in English).";
                                                };
                                                readonly sources: {
                                                    readonly type: "array";
                                                    readonly description: "Source citations extracted from DB tool results.";
                                                    readonly items: {
                                                        readonly type: "object";
                                                        readonly properties: {
                                                            readonly label: {
                                                                readonly type: "string";
                                                            };
                                                            readonly url: {
                                                                readonly type: "string";
                                                                readonly format: "uri";
                                                            };
                                                        };
                                                    };
                                                };
                                                readonly tools_called: {
                                                    readonly type: "array";
                                                    readonly description: "Names of DB tools invoked during this request.";
                                                    readonly items: {
                                                        readonly type: "string";
                                                    };
                                                };
                                            };
                                        };
                                        readonly meta: {
                                            readonly type: "object";
                                            readonly properties: {
                                                readonly tokens: {
                                                    readonly type: "object";
                                                    readonly properties: {
                                                        readonly input_tokens: {
                                                            readonly type: "integer";
                                                        };
                                                        readonly output_tokens: {
                                                            readonly type: "integer";
                                                        };
                                                    };
                                                };
                                                readonly model: {
                                                    readonly type: "string";
                                                    readonly example: "claude-sonnet-4-6";
                                                };
                                            };
                                        };
                                        readonly error: {
                                            readonly nullable: true;
                                            readonly example: null;
                                        };
                                    };
                                };
                            };
                        };
                    };
                    readonly "400": {
                        readonly description: "Invalid request or message too large";
                        readonly content: {
                            readonly "application/json": {
                                readonly schema: {
                                    readonly $ref: "#/components/schemas/Error";
                                };
                            };
                        };
                    };
                    readonly "429": {
                        readonly description: "Rate limit exceeded: max 10 requests per minute per IP";
                    };
                    readonly "503": {
                        readonly description: "AI service not configured";
                    };
                };
            };
        };
    };
};
//# sourceMappingURL=openapi.d.ts.map