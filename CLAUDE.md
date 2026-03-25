# DataForge – Structured Data Platform

## Project Overview
Build a self-hosted, API-first data platform with two verticals:
1. Education – All accredited study programs internationally
2. Regulatory – German regulatory and approval requirements (starting with event permits)

The platform runs largely automated. All data is exposed via REST API and MCP endpoint.

## Tech Stack
- Runtime: Node.js + TypeScript
- API Framework: Hono
- Database: PostgreSQL 16
- ORM: Drizzle ORM
- Job Scheduler: pg-boss
- Scraping: Playwright + Cheerio
- Deployment: Docker Compose with Nginx reverse proxy

## Project Structure
/opt/dataforge/
  api/          - REST API + MCP endpoint
  pipelines/    - Data collection and processing jobs
  db/           - Drizzle migrations and schema
  shared/       - Shared types, utilities
  infra/        - Docker Compose, Nginx config

## Constraints
- No over-engineering
- Every database change via migration files
- All configuration via environment variables
- Pipelines must be idempotent
- API responses follow: { data, meta, error }
- Code comments in English
