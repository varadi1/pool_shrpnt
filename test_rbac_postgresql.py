#!/usr/bin/env python3
import os
import sys
import subprocess

os.environ["DATABASE_URL"] = "postgresql://pooldev:devpass123@localhost:5432/pooldb_test"

result = subprocess.run([
    sys.executable, "-m", "pytest",
    "api/tests/test_rbac_engine.py",
    "api/tests/test_rbac_inheritance.py", 
    "api/tests/test_rbac_reconciliation.py",
    "-v", "--tb=short"
], capture_output=False, text=True)

sys.exit(result.returncode)