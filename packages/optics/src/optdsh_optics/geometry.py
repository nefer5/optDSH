"""Display-only dimensions and classification. Never an optical solver."""
import math

FIELDS = {
    "Standard Lens": ("Clear1", "Edge1", "Clear2", "Edge2", "Thickness", "Radius1", "Radius2", "Conic1", "Conic2"),
    "Even Asphere Lens": ("Clear1", "Edge1", "Clear2", "Edge2", "Thickness", "Radius1", "Radius2", "Conic1", "Conic2"),
    "Compound Lens": ("IsRectangle", "Thickness", "HalfWidthX", "HalfWidthY", "FrontEdgeRadius", "RearEdgeRadius"),
    "Rectangle": ("XHalfWidth", "YHalfWidth"),
    "Ellipse": ("XHalfWidth", "YHalfWidth"),
    "Detector Rectangle": ("XHalfWidth", "YHalfWidth"),
    "Source Rectangle": ("XHalfWidth", "YHalfWidth"),
    "Rectangular Volume": ("X1HalfWidth", "Y1HalfWidth", "X2HalfWidth", "Y2HalfWidth", "ZLength", "FrontXAngle", "FrontYAngle", "RearXAngle", "RearYAngle"),
    "Rectangular Pipe": ("X1HalfWidth", "Y1HalfWidth", "X2HalfWidth", "Y2HalfWidth", "ZLength", "FrontXAngle", "FrontYAngle", "RearXAngle", "RearYAngle"),
    "Standard Surface": ("Radius", "Conic", "MaxAperture", "MinAperture"),
    "Boolean Native": ("ObjectA", "ObjectB", "ObjectC", "ObjectD"),
}


def read_dimensions(obj):
    """Read only whitelisted typed interface getters; unsupported fields stay absent."""
    names = FIELDS.get(str(obj.TypeName), ())
    values, errors = {}, []
    if names:
        data = obj.ObjectData
        props = {}
        for interface in data.GetType().GetInterfaces():
            if str(interface.Name) in ("IObject", "IObjectSources"):
                continue
            props.update({str(p.Name): p for p in interface.GetProperties() if str(p.Name) in names})
        for name in names:
            if str(obj.TypeName) == "Compound Lens":
                if values.get("IsRectangle") == 1 and name in ("FrontEdgeRadius", "RearEdgeRadius"):
                    continue
                if values.get("IsRectangle") == 0 and name in ("HalfWidthX", "HalfWidthY"):
                    continue
            try:
                value = float(props[name].GetValue(data))
                if not math.isfinite(value):
                    raise ValueError("Non-finite")
                values[name] = value
            except Exception:
                errors.append(name)
    hidden = None
    try:
        hidden = bool(obj.DrawData.DoNotDrawObject)
    except Exception:
        pass
    return {"shapeParameters": values, "dimensionReadErrors": errors, "zemaxHidden": hidden}


def classify(row):
    name = row["type"].casefold()
    material = row.get("material", "").casefold()
    if "source" in name: return "source"
    if "detector" in name: return "detector"
    if "null" in name: return "reference"
    if material == "mirror": return "mirror"
    if "lens" in name or name == "standard surface": return "lens"
    if name in ("rectangle", "ellipse"): return "plate"
    if name == "rectangular volume" and material not in ("", "absorb", "air"):
        return "plate"
    if name in ("rectangular pipe", "rectangular volume"): return "structure"
    return "unknown"


def display_geometry(row):
    p = row.get("shapeParameters", {})
    name = row["type"]
    base = {"kind": "marker", "fidelity": "schematic-not-to-scale", "dimensionSource": "not available",
            "note": "仅定位标记；没有推测实体尺寸", "origin": "object-origin", "units": "mm"}
    if name == "Null Object":
        return {**base, "kind": "reference", "note": "参考坐标系，无实体"}

    def number(key, positive=False):
        v = p[key]
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or (positive and v <= 0):
            raise ValueError(key)
        return v

    try:
        common = {**base, "dimensionSource": f"ZOS-API {name} typed getters", "fidelity": "parameterized-approximation"}
        if name in ("Standard Lens", "Even Asphere Lens"):
            radius = max(number("Edge1", True), number("Edge2", True), abs(number("Clear1")), abs(number("Clear2")))
            if number("Clear1") < 0 or number("Clear2") < 0:
                return {**base, "note": "双曲半球口径暂不支持，保留原点"}
            return {**common, "kind": "lens", "radiusMM": radius, "thicknessMM": number("Thickness", True),
                    "frontClearMM": number("Clear1", True), "backClearMM": number("Clear2", True),
                    "frontEdgeMM": number("Edge1", True), "backEdgeMM": number("Edge2", True),
                    "frontRadiusMM": number("Radius1"), "backRadiusMM": number("Radius2"),
                    "frontConic": number("Conic1"), "backConic": number("Conic2"), "origin": "front-vertex",
                    "note": "尺寸来自API；圆锥基底与Clear外平边，忽略高阶非球面与倒角；异常曲面退为圆柱代理"}
        if name == "Compound Lens":
            thick = number("Thickness", True)
            if number("IsRectangle") == 1:
                return {**common, "kind": "box", "halfWidth1MM": number("HalfWidthX", True),
                        "halfHeight1MM": number("HalfWidthY", True), "halfWidth2MM": number("HalfWidthX", True),
                        "halfHeight2MM": number("HalfWidthY", True), "lengthMM": thick, "origin": "front-vertex",
                        "fidelity": "nominal-proxy", "note": "复合镜片名义尺寸代理；未重建前后曲面，不是真实包围盒"}
            return {**common, "kind": "cylinder", "radiusMM": max(number("FrontEdgeRadius", True), number("RearEdgeRadius", True)),
                    "thicknessMM": thick, "origin": "front-vertex", "fidelity": "nominal-proxy", "note": "复合镜片名义圆柱代理，非精确外形"}
        if name in ("Rectangle", "Ellipse", "Detector Rectangle", "Source Rectangle"):
            return {**common, "kind": "ellipse" if name == "Ellipse" else "plate", "halfWidthMM": number("XHalfWidth", True),
                    "halfHeightMM": number("YHalfWidth", True), "origin": "plane-center", "note": "API半宽对应平面轮廓；未假设厚度"}
        if name in ("Rectangular Volume", "Rectangular Pipe"):
            return {**common, "kind": "pipe" if name == "Rectangular Pipe" else "box",
                    "halfWidth1MM": number("X1HalfWidth", True), "halfHeight1MM": number("Y1HalfWidth", True),
                    "halfWidth2MM": number("X2HalfWidth", True), "halfHeight2MM": number("Y2HalfWidth", True),
                    "lengthMM": number("ZLength", True), "origin": "front-center",
                    "note": "前面Z=0，后面Z=ZLength；显示锥台代理，忽略端面倾斜，管道未假设壁厚"}
        if name == "Standard Surface":
            return {**common, "kind": "surface", "radiusMM": number("MaxAperture", True), "origin": "surface-vertex",
                    "note": "仅显示MaxAperture圆形轮廓；曲率与内遮挡未重建"}
        if name == "Boolean Native":
            return {**base, "note": "布尔结果暂不生成实体；不把操作数当作最终裁切形状"}
    except (KeyError, ValueError, TypeError):
        return {**base, "note": "尺寸字段缺失/无效，已退为非比例标记"}
    return base
