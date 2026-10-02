import leakproof


def test_package_imports_and_has_version():
    assert leakproof.__version__
