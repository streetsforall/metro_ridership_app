"""
Regenerates the Linux visual-regression baselines (*-linux.png) inside the official
Playwright Docker image.

Playwright derives a snapshot's platform suffix from the OS it runs on, so a run on
Windows writes -win32.png while CI (Linux) looks for -linux.png. Both sets are
committed; this script produces the Linux half without needing a Linux machine.

The image tag is read from package-lock.json — the same source .github/workflows/ci.yml
uses for its container.image — so the browser build that generates a baseline here is
identical to the one CI compares against. Bumping @playwright/test moves both at once.

Run with: npm run test:e2e:update:linux
      or: python scripts/update_linux_snapshots.py [-- playwright args]

Extra arguments are forwarded to `playwright test --update-snapshots`, e.g.
    npm run test:e2e:update:linux -- --project=desktop -g "expanded"
"""

import json
import shlex
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
LOCKFILE_PATH = REPO_ROOT / "package-lock.json"


def fail(message: str) -> "NoReturn":  # noqa: F821
    print(f"\n[x] {message}\n", file=sys.stderr)
    sys.exit(1)


def playwright_version() -> str:
    """Reads the pinned @playwright/test version so the image can never drift from the client."""
    try:
        lock = json.loads(LOCKFILE_PATH.read_text(encoding="utf-8"))
    except OSError as err:
        fail(f"Could not read {LOCKFILE_PATH}: {err}")
    except json.JSONDecodeError as err:
        fail(f"{LOCKFILE_PATH} is not valid JSON: {err}")

    version = lock.get("packages", {}).get("node_modules/@playwright/test", {}).get("version")
    if not version:
        fail(
            'No "node_modules/@playwright/test" entry in package-lock.json. '
            "Run `npm install` first."
        )
    return version


def require_docker() -> None:
    try:
        probe = subprocess.run(
            ["docker", "version", "--format", "{{.Server.Version}}"],
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        fail("`docker` was not found on PATH. Install Docker Desktop to regenerate Linux baselines.")

    if probe.returncode != 0:
        fail("Docker is installed but the daemon is not responding. Start Docker Desktop and retry.")


def main() -> int:
    version = playwright_version()
    image = f"mcr.microsoft.com/playwright:v{version}-noble"
    passthrough = sys.argv[1:]

    require_docker()

    update_cmd = "npm run test:e2e:update"
    if passthrough:
        update_cmd += " -- " + " ".join(shlex.quote(arg) for arg in passthrough)
    inner = f"npm ci && {update_cmd}"

    # `npm ci` inside the container installs Linux binaries. The bare `-v /work/node_modules`
    # is an anonymous volume masking that path, which keeps them off the host — without it the
    # Linux esbuild/@swc/rollup binaries overwrite the host's and break local `npm run dev`
    # until you re-run `npm ci`.
    #
    # CI is deliberately left unset in the container so playwright.config.ts's webServer still
    # runs `npm run build && npm run preview`, making the regeneration self-contained.
    #
    # --shm-size=1gb stands in for CI's --ipc=host (which is meaningless through Docker
    # Desktop's VM): the default 64MB /dev/shm makes Chromium crash on full-page screenshots.
    args = [
        "docker",
        "run",
        "--rm",
        "--shm-size=1gb",
        "-v",
        f"{REPO_ROOT.resolve()}:/work",
        "-v",
        "/work/node_modules",
        "-w",
        "/work",
        image,
        "bash",
        "-lc",
        inner,
    ]

    print(f"\nRegenerating *-linux.png baselines in {image}\n")

    # No shell=True: the inner command contains `&&`, which cmd.exe would otherwise split on.
    result = subprocess.run(args)

    if result.returncode == 0:
        print(
            "\n[ok] Linux baselines updated. Review the diff, then remember the Windows set:\n"
            "       npm run test:e2e:update\n"
        )

    return result.returncode


if __name__ == "__main__":
    sys.exit(main())
