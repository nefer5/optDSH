"""Source-checkout compatibility launcher; install the wheel for deployment."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"src"))
from optdsh_optics.server import main
if __name__ == "__main__":
    main()
