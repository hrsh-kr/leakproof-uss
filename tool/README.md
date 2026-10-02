# leakproof (tool)

Working code for the UsS course project. Plan: `../04_tool_spec_and_test_plan.md`.

    make setup   # create .venv and install dev tools
    make test    # run all tests
    make cov     # tests with coverage
    make lint    # ruff and bandit
    make matrix  # regenerate the permission matrix JSON from the spec

Rules: write the test first; do not weaken a test to make it pass; log any real bug in `../logs/vulnerabilities.csv`.
