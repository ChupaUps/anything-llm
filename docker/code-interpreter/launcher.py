#!/usr/bin/env python3
"""Apply per-cell resource limits, then exec the user's cell.

Kept as a separate process image so the parent never needs `preexec_fn`
(unsafe in a threaded server); limits survive `execv`, so the cell runs with
them and no extra stack frames pollute tracebacks.
"""

import os
import resource
import sys

MEMORY_MB = int(sys.argv[1])
CPU_SECONDS = int(sys.argv[2])
MAX_FILE_SIZE = int(sys.argv[3])
SCRIPT_PATH = sys.argv[4]

LIMITS = (
    (resource.RLIMIT_AS, MEMORY_MB * 1024 * 1024),
    (resource.RLIMIT_CPU, CPU_SECONDS),
    (resource.RLIMIT_FSIZE, MAX_FILE_SIZE),
    (resource.RLIMIT_NOFILE, 512),
    (resource.RLIMIT_NPROC, 128),
    (resource.RLIMIT_CORE, 0),
)

for name, value in LIMITS:
    try:
        resource.setrlimit(name, (value, value))
    except (ValueError, OSError):
        pass

os.execv(
    sys.executable,
    [sys.executable, "-I", "-B", SCRIPT_PATH],
)
