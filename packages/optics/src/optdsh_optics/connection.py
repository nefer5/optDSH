"""ZOS-API 连接封装。

支持两种连接模式：

- ``standalone``：照搬官方示例 ``PythonStandalone_01``，后台创建独立 OpticStudio
  应用实例。
- ``extension``：连接到 GUI 中已打开的 Interactive Extension 实例，适合用户手动
  打开/检查 Zemax 文件，脚本只做读取或局部修改的工作流。

安装与宿主必须由显式 target.installDir、target.family 和可选 target.year 选择。
不从注册表、当前工作目录或其他安装版本猜测。2023+先核验实际宿主版本；
Zemax18保留目标名称，但专用旧版桥尚未实现，连接前明确拒绝。

与示例不同的两点：
- 封装成 **context manager**：``standalone`` 退出时自动 ``CloseApplication``，
  避免后台 OpticStudio 进程残留；``extension`` 退出时只释放本地 API
  引用，不关闭用户的 GUI 或当前模型。
- 默认强制 pythonnet 使用 **.NET Framework** 运行时（netfx）。ZOS-API 的程序集是
  .NET Framework 4.x，而 pythonnet 3.x 默认可能选用 .NET Core(coreclr)，导致加载/类型
  解析异常。可用环境变量 ``OPTDSH_DOTNET`` 覆盖（``netfx`` / ``core`` / ``default``）。
"""

from __future__ import annotations

import os
import json
from .runtime import instance_lock, validate_target, validate_host_version
from typing import Literal


class ZOSAPIError(RuntimeError):
    """ZOS-API 连接或初始化失败。"""


def _select_runtime() -> None:
    """在 ``import clr`` 之前选择 .NET 运行时。必须最先调用。"""
    choice = os.environ.get("OPTDSH_DOTNET", "netfx").lower()
    if choice == "default":
        return
    try:
        from pythonnet import set_runtime

        if choice == "core":
            from clr_loader import get_coreclr

            set_runtime(get_coreclr())
        else:  # netfx —— ZOS-API 的默认/推荐运行时
            from clr_loader import get_netfx

            set_runtime(get_netfx())
    except Exception:
        # 运行时已被加载（例如先前已 import clr），set_runtime 会抛错；忽略并沿用现状。
        pass


ConnectionMode = Literal["standalone", "extension"]


class OpticStudio:
    """一个 ZOS-API 应用连接（context manager）。

    用法::

        from optdsh_optics.connection import OpticStudio

        # 后台 standalone 实例
        with OpticStudio(mode="standalone") as zos:
            zos.system.New(False)
            ...

        # 连接 GUI 中 Interactive Extension 的 instance 1
        with OpticStudio(mode="extension", instance=1) as zos:
            print(zos.system.SystemFile)

    属性：
        ZOSAPI       : ZOSAPI 命名空间（用于访问枚举 / 类型）
        application  : IZOSAPI_Application
        system       : 主光学系统 IOpticSystem（= application.PrimarySystem）
    """

    def __init__(
        self,
        opticstudio_dir: str | None = None,
        *,
        mode: ConnectionMode = "extension",
        instance: int = 1,
        target: dict | None = None,
    ) -> None:
        if mode not in {"standalone", "extension"}:
            raise ZOSAPIError(f"未知 ZOS-API 连接模式：{mode!r}")
        if instance < 0:
            raise ZOSAPIError("Interactive Extension instance 必须是非负整数。")

        target = validate_target(target or json.loads(os.environ.get("OPTDSH_ZEMAX_TARGET", "null")))
        self._lease = instance_lock(instance)
        self._lease.__enter__()
        self.mode = mode
        self.instance = instance
        self.application = None
        self._connection = None

        _select_runtime()

        import clr  # 延迟到运行时已选择后再 import

        install_dir = str(target['installDir'])
        if opticstudio_dir is not None and os.path.normcase(os.path.abspath(opticstudio_dir)) != os.path.normcase(os.path.abspath(install_dir)):
            raise ZOSAPIError('opticstudio_dir differs from selected target.installDir')
        clr.AddReference(os.path.join(install_dir, "ZOSAPI.dll"))
        clr.AddReference(os.path.join(install_dir, "ZOSAPI_Interfaces.dll"))
        import ZOSAPI  # noqa: E402

        self.ZOSAPI = ZOSAPI
        self._connection = ZOSAPI.ZOSAPI_Connection()
        if self._connection is None:
            raise ZOSAPIError("无法初始化到 ZOS-API 的 .NET 连接。")

        if self.mode == "extension":
            self.application = self._connection.ConnectAsExtension(self.instance)
        else:
            self.application = self._connection.CreateNewApplication()
        if self.application is None:
            if self.mode == "extension":
                raise ZOSAPIError(
                    f"无法连接到 Interactive Extension instance {self.instance}；"
                    "请在 OpticStudio GUI 中打开 Programming > Interactive Extension。"
                )
            raise ZOSAPIError("无法创建 ZOS-API standalone 应用实例。")
        if not self.application.IsValidLicenseForAPI:
            license_status = getattr(self.application, "LicenseStatus", "unknown")
            self.close()
            raise ZOSAPIError(
                "当前许可证不支持 ZOS-API；"
                f"mode={self.mode}, LicenseStatus={license_status}"
            )

        try:
            validate_host_version(self.application.OpticStudioVersion, target)
        except Exception:
            self.close()
            raise
        self.system = self.application.PrimarySystem
        if self.system is None:
            self.close()
            raise ZOSAPIError("无法获取主光学系统。")

    @property
    def license_edition(self) -> str:
        s = self.application.LicenseStatus
        t = self.ZOSAPI.LicenseStatusType
        return {
            t.PremiumEdition: "Premium",
            t.ProfessionalEdition: "Professional",
            t.StandardEdition: "Standard",
            getattr(t, "EnterpriseEdition", object()): "Enterprise",
        }.get(s, str(s))

    def close(self) -> None:
        app = getattr(self, "application", None)
        if app is not None and self.mode == "standalone":
            try:
                app.CloseApplication()
            except Exception:
                pass
        self.system = None
        self.application = None
        self._connection = None
        lease = getattr(self, "_lease", None)
        if lease is not None:
            self._lease = None
            lease.__exit__(None, None, None)

    def __enter__(self) -> "OpticStudio":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass
