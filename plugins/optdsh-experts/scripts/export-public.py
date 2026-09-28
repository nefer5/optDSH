"""Export a new text-only expert source kit; never publishes or copies preferences."""
from pathlib import Path
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / ".agents/experts/visual-designer"

def export_public(output, source=SOURCE):
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError("Public export requires a new directory")
    source = Path(source).resolve()
    names = ["agent.json", "instructions.md", "README.md", "PUBLICATION.md", "preferences.example.md"]
    resource_manifest = json.loads((source / "resources.json").read_text(encoding="utf-8"))
    names += [n for n in resource_manifest["files"] if n.startswith("library/") and n.endswith(".md")]
    content = {}
    for name in names:
        path = (source / name).resolve()
        if not path.is_relative_to(source):
            raise ValueError("Public source escapes expert directory")
        text = path.read_text(encoding="utf-8")
        # Keep observations and source URLs; omit local screenshot links rather than
        # claiming those files or their redistribution rights travel with the kit.
        text = re.sub(r"!?\[([^\]]*)\]\(([^)]+\.png)\)", r"\1（原图未随公共包提供；请查看本节来源链接）", text)
        text = text.replace("index.html", "index.md")
        if name == "instructions.md":
            text = text.replace("{{RESOURCE_ROOT}}", "library")
        content[name] = text.encode("utf-8")
    catalog = json.loads((source / "library/catalog.json").read_text(encoding="utf-8"))
    items = [{k:v for k,v in item.items() if k in {"id","title","style","source_url","discovery_url","captured_on","tags","notes","state"}} for item in catalog["items"]]
    content["library/catalog.json"] = (json.dumps({"schema_version":1,"imagesIncluded":False,"items":items},ensure_ascii=False,indent=2)+"\n").encode()
    content["library/index.md"] = "# 文字参考索引\n\n公共包不含第三方截图。入口：[使用方式](START.md) · [分类](taxonomy.md) · [来源](sources.md) · [产品界面](collections/product-ui/README.md)。\n".encode()
    files = sorted(n for n in content if n.startswith("library/"))
    content["resources.json"] = (json.dumps({"schema_version":1,"files":files},indent=2)+"\n").encode()
    content["PACKAGE.md"] = "# 公共专家源码包\n\n包含通用角色规范、文字参考/原站链接及空偏好模板，不含个人偏好、截图、宿主运行时、凭据和本机链接。instructions.md中的参考根已设为本目录library。将这些资源交给支持自定义专家的宿主，按其格式封装；DSH完整适配随optDSH仓库提供。此包只生成本地文件，不执行安装或发布。\n".encode()
    # Validate every local Markdown link before creating the output tree.
    for name,data in content.items():
        if not name.endswith(".md"):
            continue
        for ref in re.findall(r"\]\(([^)]+)\)",data.decode()):
            if "://" in ref or ref.startswith("#"):
                continue
            target=(output / name).parent / ref.split("#")[0]
            try:
                key=target.resolve().relative_to(output).as_posix()
            except ValueError:
                raise ValueError(f"Link escapes public package: {name}: {ref}")
            if key not in content:
                raise ValueError(f"Missing public link: {name}: {ref}")
    output.mkdir(parents=True,exist_ok=False)
    for name,data in content.items():
        target=output/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
    manifest={"expertVersion":json.loads(content["agent.json"])["version"],"privatePreferencesIncluded":False,"screenshotsIncluded":False,"files":{n:{"sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)} for n,data in content.items()}}
    (output/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return manifest

if __name__ == "__main__":
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args();manifest=export_public(args.output)
    print(f"Exported expert {manifest['expertVersion']}: {len(manifest['files'])} public files; preferences and screenshots excluded")
