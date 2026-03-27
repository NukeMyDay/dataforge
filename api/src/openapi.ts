// OpenAPI 3.0 spec for the DataForge API — manually maintained, no codegen

export const openApiSpec = {
  openapi: "3.0.0",
  info: {
    title: "DataForge API",
    version: "1.0.0",
    description:
      "Self-hosted API-first structured data platform. Provides access to education (study programs, institutions) and regulatory data.",
  },
  servers: [{ url: "/v1", description: "DataForge v1" }],
  components: {
    securitySchemes: {
      ApiKey: {
        type: "apiKey",
        in: "header",
        name: "X-API-Key",
        description: "API key for data endpoints",
      },
      BearerJWT: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "JWT token from /v1/auth/login or /v1/auth/register",
      },
    },
    schemas: {
      Rechtsform: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string", example: "GmbH" },
          slug: { type: "string", example: "gmbh" },
          fullName: { type: "string", nullable: true, example: "Gesellschaft mit beschränkter Haftung" },
          minCapitalEur: { type: "integer", nullable: true },
          liabilityType: { type: "string", nullable: true },
          notaryRequired: { type: "boolean" },
          tradeRegisterRequired: { type: "boolean" },
          founderCount: { type: "string", nullable: true },
          descriptionDe: { type: "string", nullable: true },
          descriptionEn: { type: "string", nullable: true },
          taxNotesDe: { type: "string", nullable: true },
          foundingCostsDe: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          scrapedAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      GewerbeanmeldungInfo: {
        type: "object",
        properties: {
          id: { type: "integer" },
          bundesland: { type: "string", example: "Bayern" },
          authorityName: { type: "string", nullable: true },
          authorityUrl: { type: "string", format: "uri", nullable: true },
          processingTimeDays: { type: "string", nullable: true },
          feeEur: { type: "string", nullable: true },
          onlineAvailable: { type: "boolean", nullable: true },
          documentsRequired: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          scrapedAt: { type: "string", format: "date-time", nullable: true },
          updatedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      SvContributionRate: {
        type: "object",
        properties: {
          id: { type: "integer" },
          insuranceType: { type: "string", example: "krankenversicherung" },
          labelDe: { type: "string" },
          rateTotal: { type: "string", example: "14.6%" },
          rateEmployer: { type: "string", nullable: true },
          rateEmployee: { type: "string", nullable: true },
          notesDe: { type: "string", nullable: true },
          validFrom: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          scrapedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      TaxObligation: {
        type: "object",
        properties: {
          id: { type: "integer" },
          rechtsformSlug: { type: "string", example: "gmbh" },
          taxType: { type: "string", example: "koerperschaftsteuer" },
          labelDe: { type: "string" },
          descriptionDe: { type: "string", nullable: true },
          rateInfo: { type: "string", nullable: true },
          filingFrequency: { type: "string", nullable: true },
          legalBasis: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          scrapedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Permit: {
        type: "object",
        properties: {
          id: { type: "integer" },
          permitKey: { type: "string", example: "gaststättengewerbe" },
          permitCategory: { type: "string", example: "erlaubnispflichtiges_gewerbe" },
          tradeCategory: { type: "string", example: "gastronomie_tourismus" },
          labelDe: { type: "string" },
          descriptionDe: { type: "string", nullable: true },
          authorityType: { type: "string", nullable: true },
          authorityLevel: { type: "string", enum: ["federal", "state", "local"], nullable: true },
          requiredDocuments: { type: "string", nullable: true },
          costsEur: { type: "string", nullable: true },
          processingTimeDays: { type: "string", nullable: true },
          legalBasis: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          scrapedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      HrObligation: {
        type: "object",
        properties: {
          id: { type: "integer" },
          rechtsformSlug: { type: "string" },
          obligationType: { type: "string" },
          labelDe: { type: "string" },
          descriptionDe: { type: "string", nullable: true },
          legalBasis: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          scrapedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      Webhook: {
        type: "object",
        properties: {
          id: { type: "integer" },
          url: { type: "string", format: "uri" },
          events: { type: "array", items: { type: "string" } },
          isActive: { type: "boolean" },
          description: { type: "string", nullable: true },
          failureCount: { type: "integer" },
          lastTriggeredAt: { type: "string", format: "date-time", nullable: true },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Error: {
        type: "object",
        properties: {
          data: { nullable: true, example: null },
          meta: { nullable: true, example: null },
          error: { type: "string" },
        },
      },
      Pagination: {
        type: "object",
        properties: {
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          totalPages: { type: "integer" },
        },
      },
      Program: {
        type: "object",
        properties: {
          id: { type: "integer" },
          slug: { type: "string" },
          titleEn: { type: "string", nullable: true },
          titleDe: { type: "string", nullable: true },
          titleNl: { type: "string", nullable: true },
          degreeType: { type: "string", nullable: true },
          fieldOfStudy: { type: "string", nullable: true },
          language: { type: "string", nullable: true },
          country: { type: "string", nullable: true },
          durationMonths: { type: "integer", nullable: true },
          isActive: { type: "boolean" },
          institutionId: { type: "integer", nullable: true },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Institution: {
        type: "object",
        properties: {
          id: { type: "integer" },
          slug: { type: "string" },
          nameEn: { type: "string", nullable: true },
          nameDe: { type: "string", nullable: true },
          country: { type: "string", nullable: true },
          city: { type: "string", nullable: true },
          websiteUrl: { type: "string", nullable: true },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Regulation: {
        type: "object",
        properties: {
          id: { type: "integer" },
          slug: { type: "string" },
          titleDe: { type: "string", nullable: true },
          titleEn: { type: "string", nullable: true },
          category: { type: "string", nullable: true },
          jurisdiction: { type: "string", nullable: true },
          isActive: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "integer" },
          email: { type: "string", format: "email" },
          tier: { type: "string", example: "free" },
          status: { type: "string", example: "active" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      ApiKey: {
        type: "object",
        properties: {
          id: { type: "integer" },
          name: { type: "string", nullable: true },
          tier: { type: "string" },
          isActive: { type: "boolean" },
          lastUsedAt: { type: "string", format: "date-time", nullable: true },
          requestCount: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      FundingProgram: {
        type: "object",
        properties: {
          id: { type: "integer" },
          slug: { type: "string" },
          titleDe: { type: "string" },
          titleEn: { type: "string", nullable: true },
          fundingType: { type: "string", nullable: true, description: "Förderart: Zuschuss, Darlehen, Garantie, etc." },
          fundingArea: { type: "string", nullable: true, description: "Förderbereich: Existenzgründung, Forschung, etc." },
          fundingRegion: { type: "string", nullable: true, description: "Fördergebiet" },
          eligibleApplicants: { type: "string", nullable: true, description: "Förderberechtigte" },
          fundingAmountInfo: { type: "string", nullable: true },
          level: { type: "string", nullable: true, enum: ["bund", "land", "eu"] },
          state: { type: "string", nullable: true, description: "Bundesland if level=land" },
          category: { type: "string", nullable: true },
          sourceUrl: { type: "string", format: "uri" },
          isActive: { type: "boolean" },
          version: { type: "integer" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
  paths: {
    "/programs": {
      get: {
        summary: "List study programs",
        description: "Returns a paginated list of study programs with optional filters.",
        security: [{ ApiKey: [] }],
        tags: ["Programs"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "degreeType", in: "query", schema: { type: "string" } },
          { name: "fieldOfStudy", in: "query", schema: { type: "string" } },
          { name: "language", in: "query", schema: { type: "string" } },
          { name: "institutionId", in: "query", schema: { type: "integer" } },
          { name: "isActive", in: "query", schema: { type: "string", enum: ["true", "false"] } },
          { name: "q", in: "query", description: "Full-text search", schema: { type: "string" } },
          {
            name: "sort",
            in: "query",
            schema: { type: "string", default: "updatedAt:desc", example: "titleEn:asc" },
          },
        ],
        responses: {
          "200": {
            description: "Paginated list of programs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Program" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/programs/{id}": {
      get: {
        summary: "Get a study program",
        description: "Returns a single program by numeric id or slug, including its institution.",
        security: [{ ApiKey: [] }],
        tags: ["Programs"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Numeric id or slug",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Program with institution",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/Program" },
                        {
                          type: "object",
                          properties: {
                            institution: { $ref: "#/components/schemas/Institution" },
                          },
                        },
                      ],
                    },
                  },
                },
              },
            },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/institutions": {
      get: {
        summary: "List institutions",
        description: "Returns a paginated list of higher-education institutions.",
        security: [{ ApiKey: [] }],
        tags: ["Institutions"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", description: "Full-text search", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Paginated list of institutions",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Institution" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/institutions/{id}": {
      get: {
        summary: "Get an institution",
        description: "Returns a single institution by numeric id or slug.",
        security: [{ ApiKey: [] }],
        tags: ["Institutions"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Numeric id or slug",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Institution",
            content: {
              "application/json": {
                schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Institution" } } },
              },
            },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/regulations": {
      get: {
        summary: "List regulations",
        description: "Returns a paginated list of German regulatory data.",
        security: [{ ApiKey: [] }],
        tags: ["Regulations"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "jurisdiction", in: "query", schema: { type: "string" } },
          { name: "category", in: "query", schema: { type: "string" } },
          { name: "q", in: "query", description: "Full-text search", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Paginated list of regulations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Regulation" } },
                    pagination: { $ref: "#/components/schemas/Pagination" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/regulations/{id}": {
      get: {
        summary: "Get a regulation",
        description: "Returns a single regulation by numeric id or slug.",
        security: [{ ApiKey: [] }],
        tags: ["Regulations"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Numeric id or slug",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Regulation",
            content: {
              "application/json": {
                schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Regulation" } } },
              },
            },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/funding": {
      get: {
        summary: "List funding programs",
        description: "Returns a paginated list of German federal funding programs scraped from foerderdatenbank.de (BMWK). Supports full-text search in German.",
        security: [{ ApiKey: [] }],
        tags: ["Funding"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
          { name: "region", in: "query", description: "Filter by Fördergebiet (partial match)", schema: { type: "string" } },
          { name: "type", in: "query", description: "Filter by Förderart (partial match)", schema: { type: "string" } },
          { name: "target_group", in: "query", description: "Filter by Förderberechtigte (partial match)", schema: { type: "string" } },
          { name: "level", in: "query", description: "Filter by level: bund, land, eu", schema: { type: "string", enum: ["bund", "land", "eu"] } },
          { name: "state", in: "query", description: "Filter by Bundesland (partial match)", schema: { type: "string" } },
          { name: "q", in: "query", description: "Full-text search (German)", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Paginated list of funding programs",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/FundingProgram" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/funding/{id}": {
      get: {
        summary: "Get a funding program",
        description: "Returns a single funding program by numeric id or slug, including full content fields.",
        security: [{ ApiKey: [] }],
        tags: ["Funding"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Numeric id or slug",
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Funding program detail",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/FundingProgram" },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/register": {
      post: {
        summary: "Register a new user",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "User registered, JWT returned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        token: { type: "string" },
                        user: { $ref: "#/components/schemas/User" },
                      },
                    },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "400": { description: "Validation error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "409": { description: "Email already registered", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/login": {
      post: {
        summary: "Log in and get a JWT",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Login successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        token: { type: "string" },
                        user: { $ref: "#/components/schemas/User" },
                      },
                    },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "401": { description: "Invalid credentials", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/auth/me": {
      get: {
        summary: "Get current user",
        description: "Returns the authenticated user's profile. Requires Bearer JWT.",
        security: [{ BearerJWT: [] }],
        tags: ["Auth"],
        responses: {
          "200": {
            description: "Current user",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { $ref: "#/components/schemas/User" },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
          "404": { description: "User not found" },
        },
      },
    },
    "/auth/api-keys": {
      post: {
        summary: "Generate a new API key",
        description: "Creates a new API key for the authenticated user. The raw key is returned once only.",
        security: [{ BearerJWT: [] }],
        tags: ["Auth"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", maxLength: 128, description: "Optional label for the key" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "API key created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/ApiKey" },
                        {
                          type: "object",
                          properties: { key: { type: "string", description: "Raw key — shown once only" } },
                        },
                      ],
                    },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
      get: {
        summary: "List API keys",
        description: "Returns all active API keys for the authenticated user.",
        security: [{ BearerJWT: [] }],
        tags: ["Auth"],
        responses: {
          "200": {
            description: "List of API keys",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/ApiKey" } },
                    meta: {
                      type: "object",
                      properties: { total: { type: "integer" } },
                    },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/stats": {
      get: {
        summary: "Platform statistics",
        description: "Returns aggregate counts: programs, institutions, regulations, countries, and last-updated timestamp.",
        tags: ["Misc"],
        responses: {
          "200": {
            description: "Stats",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        programCount: { type: "integer" },
                        institutionCount: { type: "integer" },
                        regulationCount: { type: "integer" },
                        countryCount: { type: "integer" },
                        lastUpdated: { type: "string", format: "date-time", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/programs/export": {
      get: {
        summary: "Export programs",
        description: "Bulk export of programs as CSV or NDJSON. No API key required. Max 10 000 rows.",
        tags: ["Programs"],
        parameters: [
          { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json"], default: "json" } },
          { name: "country", in: "query", schema: { type: "string" } },
          { name: "degreeType", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "CSV or NDJSON file download",
            content: {
              "text/csv": { schema: { type: "string" } },
              "application/x-ndjson": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/regulations/export": {
      get: {
        summary: "Export regulations",
        description: "Bulk export of regulations as CSV or NDJSON. No API key required. Max 10 000 rows.",
        tags: ["Regulations"],
        parameters: [
          { name: "format", in: "query", schema: { type: "string", enum: ["csv", "json"], default: "json" } },
          { name: "jurisdiction", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "CSV or NDJSON file download",
            content: {
              "text/csv": { schema: { type: "string" } },
              "application/x-ndjson": { schema: { type: "string" } },
            },
          },
        },
      },
    },
    "/rechtsformen": {
      get: {
        summary: "List German legal entity types",
        description: "Returns a paginated list of Rechtsformen (GmbH, UG, AG, etc.) with comparison fields.",
        security: [{ ApiKey: [] }],
        tags: ["Gründung"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: {
          "200": {
            description: "Paginated list of Rechtsformen",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Rechtsform" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/rechtsformen/{slug}": {
      get: {
        summary: "Get a Rechtsform by slug",
        description: "Returns full detail for a single Rechtsform, including descriptions and tax notes.",
        security: [{ ApiKey: [] }],
        tags: ["Gründung"],
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string", example: "gmbh" } }],
        responses: {
          "200": {
            description: "Rechtsform detail",
            content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/Rechtsform" } } } } },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/gewerbeanmeldung": {
      get: {
        summary: "List Gewerbeanmeldung info by Bundesland",
        description: "Returns business registration requirements per German state.",
        security: [{ ApiKey: [] }],
        tags: ["Gründung"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: {
          "200": {
            description: "Paginated list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/GewerbeanmeldungInfo" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/gewerbeanmeldung/{bundesland}": {
      get: {
        summary: "Get Gewerbeanmeldung info for a Bundesland",
        security: [{ ApiKey: [] }],
        tags: ["Gründung"],
        parameters: [{ name: "bundesland", in: "path", required: true, schema: { type: "string", example: "Bayern" } }],
        responses: {
          "200": {
            description: "Gewerbeanmeldung detail",
            content: { "application/json": { schema: { type: "object", properties: { data: { $ref: "#/components/schemas/GewerbeanmeldungInfo" } } } } },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/sozialversicherung/beitraege": {
      get: {
        summary: "List social insurance contribution rates",
        description: "Returns current Sozialversicherung Beitragssätze (Kranken-, Renten-, Pflege-, Arbeitslosenversicherung).",
        security: [{ ApiKey: [] }],
        tags: ["Sozialversicherung"],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: {
          "200": {
            description: "List of contribution rates",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/SvContributionRate" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/steuern": {
      get: {
        summary: "List tax obligations",
        description: "Returns tax obligations filtered by Rechtsform and/or tax type.",
        security: [{ ApiKey: [] }],
        tags: ["Steuern"],
        parameters: [
          { name: "rechtsform", in: "query", description: "Filter by Rechtsform slug (e.g. gmbh, ug, einzelunternehmen)", schema: { type: "string" } },
          { name: "taxType", in: "query", description: "Exact match on tax type (e.g. koerperschaftsteuer)", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: {
          "200": {
            description: "List of tax obligations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/TaxObligation" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/genehmigungen": {
      get: {
        summary: "List trade permits and approvals",
        description: "Returns permits (Erlaubnisse, Meisterpflichten, Konzessionen) filterable by trade category.",
        security: [{ ApiKey: [] }],
        tags: ["Genehmigungen"],
        parameters: [
          { name: "tradeCategory", in: "query", description: "Filter by trade category (e.g. gastronomie_tourismus, handwerk_bau)", schema: { type: "string" } },
          { name: "permitCategory", in: "query", description: "Filter by permit type (e.g. erlaubnispflichtiges_gewerbe, meisterpflicht, konzession)", schema: { type: "string" } },
          { name: "q", in: "query", description: "Partial text search on label", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: {
          "200": {
            description: "List of permits",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Permit" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/handelsregister/pflichten": {
      get: {
        summary: "List trade register obligations",
        description: "Returns Handelsregister registration obligations by Rechtsform.",
        security: [{ ApiKey: [] }],
        tags: ["Handelsregister"],
        parameters: [
          { name: "rechtsform", in: "query", description: "Filter by Rechtsform slug (e.g. gmbh, ag, ohg)", schema: { type: "string" } },
          { name: "obligationType", in: "query", description: "Filter by type (e.g. eintragungspflicht, notarpflicht)", schema: { type: "string" } },
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "pageSize", in: "query", schema: { type: "integer", default: 50, maximum: 200 } },
        ],
        responses: {
          "200": {
            description: "List of obligations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/HrObligation" } },
                    meta: { $ref: "#/components/schemas/Pagination" },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/search": {
      get: {
        summary: "Unified cross-silo search",
        description: "Full-text search across all data silos. Currently searches funding programs via German pg full-text search.",
        security: [{ ApiKey: [] }],
        tags: ["Misc"],
        parameters: [
          { name: "q", in: "query", required: true, description: "Search query (German full-text)", schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 10, maximum: 50 } },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { type: "object" } },
                    meta: { type: "object", properties: { total: { type: "integer" }, q: { type: "string" } } },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "400": { description: "Missing query parameter q", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/webhooks": {
      get: {
        summary: "List webhooks",
        description: "Returns all webhook subscriptions for the authenticated user.",
        security: [{ BearerJWT: [] }],
        tags: ["Webhooks"],
        responses: {
          "200": {
            description: "List of webhooks",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "array", items: { $ref: "#/components/schemas/Webhook" } },
                    meta: { type: "object", properties: { total: { type: "integer" } } },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "401": { description: "Unauthorized" },
        },
      },
      post: {
        summary: "Register a webhook",
        description: "Creates a new webhook subscription. The signing secret is returned once on creation.",
        security: [{ BearerJWT: [] }],
        tags: ["Webhooks"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url"],
                properties: {
                  url: { type: "string", format: "uri" },
                  events: {
                    type: "array",
                    items: { type: "string", enum: ["program.created", "program.updated", "institution.created", "institution.updated", "regulation.created", "regulation.updated", "pipeline.completed"] },
                    description: "Defaults to all events",
                  },
                  description: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Webhook created (secret shown once)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      allOf: [
                        { $ref: "#/components/schemas/Webhook" },
                        { type: "object", properties: { secret: { type: "string", description: "HMAC-SHA256 signing secret (whsec_ prefix) — shown once only" } } },
                      ],
                    },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid URL or events", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/webhooks/{id}": {
      delete: {
        summary: "Delete a webhook",
        description: "Permanently removes a webhook subscription belonging to the authenticated user.",
        security: [{ BearerJWT: [] }],
        tags: ["Webhooks"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "Webhook deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "object", properties: { id: { type: "integer" }, deleted: { type: "boolean" } } },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "401": { description: "Unauthorized" },
        },
      },
    },
    "/auth/api-keys/{id}": {
      delete: {
        summary: "Revoke an API key",
        description: "Deactivates an API key belonging to the authenticated user.",
        security: [{ BearerJWT: [] }],
        tags: ["Auth"],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "integer" } }],
        responses: {
          "200": {
            description: "Key revoked",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "object", properties: { id: { type: "integer" }, revoked: { type: "boolean" } } },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid key id" },
          "401": { description: "Unauthorized" },
          "404": { description: "Key not found or not owned by you", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        },
      },
    },
    "/chat": {
      post: {
        summary: "AI chat",
        description: "Send a message to the DataForge AI assistant. Rate-limited by IP.",
        tags: ["Chat"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["message"],
                properties: {
                  message: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "AI response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: { type: "object", properties: { reply: { type: "string" } } },
                    meta: { nullable: true, example: null },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "429": { description: "Rate limit exceeded" },
        },
      },
    },
    "/assistant": {
      post: {
        summary: "Sophex Startup Assistant",
        description:
          "Agentic AI assistant for German founders. Anonymous — no API key required. Rate-limited to 10 requests/minute per IP. Client sends the full messages array for stateless multi-turn conversations. The assistant queries the Sophex DB via 8 built-in tools and returns grounded answers in German with source citations.",
        tags: ["Assistant"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["messages"],
                properties: {
                  messages: {
                    type: "array",
                    description: "Full conversation history (stateless multi-turn).",
                    items: {
                      type: "object",
                      required: ["role", "content"],
                      properties: {
                        role: { type: "string", enum: ["user", "assistant"] },
                        content: { type: "string", minLength: 1 },
                      },
                    },
                  },
                  context: {
                    type: "object",
                    description: "Optional founder context injected into the system prompt.",
                    properties: {
                      bundesland: { type: "string", example: "Bayern" },
                      rechtsform: { type: "string", example: "gmbh" },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Grounded answer with source citations",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "object",
                      properties: {
                        reply: { type: "string", description: "AI-generated answer in German (or English if user wrote in English)." },
                        sources: {
                          type: "array",
                          description: "Source citations extracted from DB tool results.",
                          items: {
                            type: "object",
                            properties: {
                              label: { type: "string" },
                              url: { type: "string", format: "uri" },
                            },
                          },
                        },
                        tools_called: {
                          type: "array",
                          description: "Names of DB tools invoked during this request.",
                          items: { type: "string" },
                        },
                      },
                    },
                    meta: {
                      type: "object",
                      properties: {
                        tokens: {
                          type: "object",
                          properties: {
                            input_tokens: { type: "integer" },
                            output_tokens: { type: "integer" },
                          },
                        },
                        model: { type: "string", example: "claude-sonnet-4-6" },
                      },
                    },
                    error: { nullable: true, example: null },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid request or message too large", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          "429": { description: "Rate limit exceeded: max 10 requests per minute per IP" },
          "503": { description: "AI service not configured" },
        },
      },
    },
  },
} as const;
