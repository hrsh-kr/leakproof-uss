import random

import pytest

SEED = 20261002


@pytest.fixture
def rng():
    """Deterministic RNG. The seed is in the failure report so any failure can be reproduced."""
    return random.Random(SEED)
