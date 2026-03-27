# DataForge — Makefile
# Usage: make <target>

.PHONY: help dev build start stop logs migrate seed db-shell api-shell test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ─── Development ───────────────────────────────────────────────────────────────

dev: ## Start all services in dev mode (requires Node + pnpm installed locally)
	pnpm -r --parallel dev

install: ## Install all dependencies
	pnpm install

typecheck: ## Run TypeScript checks across all packages
	pnpm -r typecheck

# ─── Docker ────────────────────────────────────────────────────────────────────

build: ## Build all Docker images
	cd infra && docker compose build

start: ## Start all Docker services (detached)
	cd infra && docker compose up -d

stop: ## Stop all Docker services
	cd infra && docker compose down

restart: ## Restart all Docker services
	cd infra && docker compose restart

logs: ## Tail logs from all services
	cd infra && docker compose logs -f

logs-api: ## Tail API logs
	cd infra && docker compose logs -f api

logs-worker: ## Tail worker/pipeline logs
	cd infra && docker compose logs -f worker

# ─── Database ──────────────────────────────────────────────────────────────────

migrate: ## Run database migrations
	pnpm --filter @dataforge/db migrate

seed: ## Seed pipelines table with default pipeline definitions
	node scripts/seed-pipelines.mjs

db-shell: ## Open a psql shell to the database
	cd infra && docker compose exec postgres psql -U dataforge -d dataforge

# ─── Setup ─────────────────────────────────────────────────────────────────────

setup: ## First-time setup: install deps, run migrations, seed pipelines
	@echo "→ Installing dependencies..."
	pnpm install
	@echo "→ Running migrations..."
	pnpm --filter @dataforge/db migrate
	@echo "→ Seeding pipelines..."
	node scripts/seed-pipelines.mjs
	@echo "✓ Setup complete. Copy .env.example to .env and fill in secrets, then: make start"

api-shell: ## Open a shell in the running API container
	cd infra && docker compose exec api sh

test: ## Run API integration tests (requires running API server)
	cd tests && pnpm test
