VENV ?= .venv
PY := $(VENV)/bin/python

.PHONY: setup test cov lint matrix trace

setup:
	python3 -m venv $(VENV)
	$(PY) -m pip install -q --upgrade pip
	$(PY) -m pip install -q -e ".[dev]"

test:
	$(PY) -m pytest

cov:
	$(PY) -m pytest --cov=leakproof --cov-report=term-missing

lint:
	$(VENV)/bin/ruff check src tests scripts
	$(VENV)/bin/bandit -q -r src

matrix:
	$(PY) scripts/gen_matrix.py

trace:
	$(PY) scripts/trace_requirements.py
