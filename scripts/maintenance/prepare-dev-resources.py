"""Prepare ignored developer reference assets using the authority's allowlist.

This does not distribute host roles/hooks, change the authority or publish assets.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--agent-home', type=Path, default=Path.home()/'.agents')
    args = parser.parse_args()
    source = args.agent_home.resolve()
    script = source/'skills/expert-distribute/scripts/distribute.py'
    sys.path.insert(0, str(script.parent))
    spec = importlib.util.spec_from_file_location('authority_export', script)
    authority = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(authority)
    root = Path(__file__).resolve().parents[2]
    expert = 'visual-designer'
    pack = authority.load_resources(source, expert)
    target = root/'.agents/resources'/expert
    evidence = []
    for relative, data in pack['resources']:
        if relative.endswith('.md'):
            data = authority.substitute(data.decode('utf8'), pack, expert, relative).encode('utf8')
        path = authority.contained(root, str((target/relative).relative_to(root)))
        if path.exists() and path.read_bytes() != data:
            raise ValueError(f'Existing generated resource differs; preserve and reconcile: {relative}')
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        evidence.append({'path': relative, 'sha256': hashlib.sha256(data).hexdigest()})
    (target/'dev-receipt.json').write_text(json.dumps({'authority': str(source), 'files': evidence,
        'purpose': 'local developer references only; not a released product resource pack'}, indent=2)+'\n', encoding='utf8')
    print(f'Prepared {len(evidence)} allowlisted developer resources; no host hooks or authority files changed.')


if __name__ == '__main__':
    main()
