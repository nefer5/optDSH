"""ZOS-API 连接封装。

支持两种连接模式：

- ``standalone``：照搬官方示例 ``PythonStandalone_01``，后台创建独立 OpticStudio
  应用实例。
- ``extension``：连接到 GUI 中已打开的 Interactive Extension 实例，适合用户手动
  打开/检查 Zemax 文件，脚本只做读取或局部修改的工作流。

standalone 初始化流程：
1. 从注册表 ``HKCU\\Software\\Zemax`` 读 ``ZemaxRoot``，定位 ``ZOSAPI_NetHelper.dll``；
2. 用 NetHelper 的 ``ZOSAPI_Initializer`` 找到 OpticStudio 安装目录；
3. 引用 ``ZOSAPI.dll`` / ``ZOSAPI_Interfaces.dll``，建立独立应用实例。

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
from typing import Literal
import winreg


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


def _zemax_root() -> str:
    """从注册表读取 ZemaxRoot（用户数据目录，含 ZOS-API\\Libraries）。"""
    try:
        key = winreg.OpenKey(
            winreg.ConnectRegistry(None, winreg.HKEY_CURRENT_USER),
            r"Software\Zemax",
            0,
            winreg.KEY_READ,
        )
        value, _ = winreg.QueryValueEx(key, "ZemaxRoot")
        winreg.CloseKey(key)
        return value
    except OSError as exc:
        raise ZOSAPIError(
            "读不到注册表 HKCU\\Software\\Zemax\\ZemaxRoot；"
            "请先正常启动一次 OpticStudio 以写入该键。"
        ) from exc


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
    ) -> None:
        if mode not in {"standalone", "extension"}:
            raise ZOSAPIError(f"未知 ZOS-API 连接模式：{mode!r}")
        if instance < 0:
            raise ZOSAPIError("Interactive Extension instance 必须是非负整数。")

        self.mode = mode
        self.instance = instance
        self.application = None
        self._connection = None

        _select_runtime()

        import clr  # 延迟到运行时已选择后再 import

        root = _zemax_root()
        nethelper = os.path.join(root, "ZOS-API", "Libraries", "ZOSAPI_NetHelper.dll")
        if not os.path.isfile(nethelper):
            raise ZOSAPIError(f"找不到 ZOSAPI_NetHelper.dll：{nethelper}")
        clr.AddReference(nethelper)
        import ZOSAPI_NetHelper  # noqa: E402  (.NET 程序集，加引用后才可导入)

        if opticstudio_dir is None:
            initialized = ZOSAPI_NetHelper.ZOSAPI_Initializer.Initialize()
        else:
            initialized = ZOSAPI_NetHelper.ZOSAPI_Initializer.Initialize(opticstudio_dir)
        if not initialized:
            raise ZOSAPIError("定位 OpticStudio 安装目录失败；可显式传入 opticstudio_dir。")

        install_dir = ZOSAPI_NetHelper.ZOSAPI_Initializer.GetZemaxDirectory()
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

    def __enter__(self) -> "OpticStudio":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    def __del__(self) -> None:
        try:
            self.close()
        except Exception:
            pass
