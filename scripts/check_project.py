"""Check initialization documents and synthetic references; no external services."""
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def check():
    errors = []
    required = ["README.md", "AGENTS.md", "docs/README.md", "planning/STATUS.md", "planning/ROADMAP.md"]
    for name in required:
        if not (ROOT / name).is_file():
            errors.append(f"Missing required file: {name}")
    files = [ROOT / "README.md", ROOT / "AGENTS.md"]
    files += list((ROOT / "docs").rglob("*.md"))
    files += list((ROOT / "planning").rglob("*.md"))
    files += list((ROOT / ".agents/skills").rglob("SKILL.md"))
    for path in files:
        if not path.is_file():
            continue
        for target in re.findall(r"\[[^\]]*\]\(([^)]+)\)", path.read_text(encoding="utf-8")):
            if re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", target) or target.startswith("#"):
                continue
            target = target.split("#", 1)[0]
            if target and not (path.parent / target).exists():
                errors.append(f"Broken link in {path.relative_to(ROOT)}: {target}")
    for folder in ("config", "examples"):
        for path in (ROOT / folder).glob("*.json"):
            if path.name == "local.json" or ".local." in path.name:
                continue  # Never print or inspect private configuration here.
            try:
                json.loads(path.read_text(encoding="utf-8"))
            except (ValueError, OSError):
                errors.append(f"Invalid JSON: {path.relative_to(ROOT)}")
    sys.path.insert(0,str(ROOT/'src'))
    from optdsh_optics.config_io import load_config
    for path in (ROOT/'.agents/skills').glob('*/config/*.example.yaml'):
        try:load_config(path)
        except Exception:errors.append(f'Invalid YAML example: {path.relative_to(ROOT)}')
    try:
        scene = json.loads((ROOT / "examples/scene.snapshot.json").read_text(encoding="utf-8"))
        intent = json.loads((ROOT / "examples/expert-intent.json").read_text(encoding="utf-8"))
        ids = [obj["objectId"] for obj in scene["objects"]]
        if len(ids) != len(set(ids)):
            errors.append("Duplicate object identity in synthetic scene")
        if scene["provenance"] != "synthetic":
            errors.append("Initialization scene must be synthetic")
        if (intent["modelId"], intent["revision"]) != (scene["modelId"], scene["revision"]):
            errors.append("Intent references another model or revision")
        if not intent["selectedObjectIds"] or not set(intent["selectedObjectIds"]).issubset(ids):
            errors.append("Intent has no selection or references unknown objects")
        for obj in scene["objects"]:
            matrix = obj["worldTransform"]
            if len(matrix) != 16 or matrix[-4:] != [0, 0, 0, 1]:
                errors.append(f"Invalid affine transform: {obj['objectId']}")
            if obj["referenceObjectId"] is not None and obj["referenceObjectId"] not in ids:
                errors.append(f"Unknown reference object: {obj['objectId']}")
    except (OSError, ValueError, KeyError, TypeError):
        errors.append("Missing or malformed synthetic contract examples")
    return errors


if __name__ == "__main__":
    problems = check()
    for problem in problems:
        print(f"ERROR: {problem}")
    if not problems:
        print("PASS: project documents, JSON and synthetic references; no runtime integration tested.")
    sys.exit(1 if problems else 0)
