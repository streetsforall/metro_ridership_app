"""Put `scripts/` on `sys.path` so these tests can import the modules under test by name.

The tests say `import process_ridership`, not `import scripts.process_ridership`, because
`scripts/` is a flat directory of standalone entry points, not a package.  When the tests
lived beside those modules, pytest's own rootdir insertion put `scripts/` on the path for
free; from `scripts/tests/` it inserts this directory instead, so the imports need the
parent added explicitly.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
