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
  },
} as const;
