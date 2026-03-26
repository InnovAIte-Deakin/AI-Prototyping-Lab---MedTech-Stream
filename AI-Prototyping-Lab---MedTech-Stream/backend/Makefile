.PHONY: run test lint format migrate

run:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	pytest -q

migrate:
	PYTHONPATH=. alembic upgrade head

lint:
	ruff check .

format:
	black .
