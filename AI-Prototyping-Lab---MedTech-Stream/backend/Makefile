.PHONY: run test lint format

run:
	uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

test:
	PYTHONPATH=. pytest -q

lint:
	ruff check .

format:
	black .
