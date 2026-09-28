import sys
from pathlib import Path
sys.path.insert(0, str(next(p for p in Path(__file__).resolve().parents if (p/"AGENTS.md").is_file() and (p/"package.json").is_file()) / "packages/optics/src"))
from optdsh_optics.capture import main
main()
