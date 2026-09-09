.PHONY: up down logs migrate seed test lint nginx-reload

up:
	docker compose up -d --build

down:
	docker compose down

logs:
	docker compose logs -f

# No-op until a service defines its own "migrate"/"seed" script
# (pnpm's --if-present skips anything that doesn't have one) — the CLI
# itself is tms-core/db's (stage 4), invoked per service as each one
# gets its schema.
migrate:
	pnpm -r --if-present run migrate

seed:
	pnpm -r --if-present run seed

test:
	pnpm test

lint:
	pnpm lint

nginx-reload:
	docker compose exec nginx nginx -s reload
