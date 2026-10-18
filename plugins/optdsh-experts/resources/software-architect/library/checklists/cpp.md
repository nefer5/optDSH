# C++ 架构清单

按档位取用：一次性工具只看“配置与硬编码”；小工具看前四组；长期项目及以上全看。每项不满足时写明位置与理由。

## 布局与入口

- [ ] 每个库目标有 `include/<lib>/`（公开头）与 `src/`（实现与私有头）；应用入口在 `apps/<name>/main.cpp` 或项目约定位置。
- [ ] **头文件与实现分离**：公开头只放声明、必要的内联/模板；非模板函数定义放 `.cpp`；头文件有 include guard 或 `#pragma once`（按项目约定）。
- [ ] `main()` 只解析参数、构造对象、调用库函数、映射退出码。
- [ ] 单文件 >400 行已评估拆分；一个头文件不承载多个无关类。

## 依赖与边界

- [ ] **CMake 目标边界**：每个模块一个目标；`target_link_libraries` 正确区分 `PUBLIC`（公开头需要）/`PRIVATE`（仅实现需要）/`INTERFACE`（纯头）；不用全局 `include_directories()`、`link_libraries()`。
- [ ] 依赖方向由目标图强制：下层目标不链接上层目标；目标图无环。
- [ ] **include 方向**：公开头只 include 本库公开头、标准库和 `PUBLIC` 依赖的头；不 include `src/`、`detail/` 或其他目标的私有头；不用 `../` 跨目录 include（`ARCH-LAYER`、`ARCH-CYCLE`、clang-tidy `misc-header-include-cycle`）。
- [ ] include what you use：每个文件直接 include 它用到的符号所在头，不依赖传递包含（IWYU、clang-tidy `misc-include-cleaner`）。
- [ ] 公开头能用前置声明的不 include 完整定义。
- [ ] **pimpl 适用性**：用于稳定 ABI/公开接口、隐藏重依赖（第三方头、平台头）、降低重编范围；不用于小值类型、性能热点或仅内部使用的类（后者直接把头移到 `src/`）。使用时析构函数在 `.cpp` 中定义。

## 配置与硬编码

- [ ] 无本机绝对路径和硬编码主机端口（`ARCH-HARDCODE`）；路径来自参数、配置文件或安装前缀。
- [ ] 魔法数字命名为 `constexpr` 常量并集中（clang-tidy `readability-magic-numbers`）。
- [ ] 编译期开关用 CMake `option()` + `target_compile_definitions`，不在源码中散布未文档化的宏。
- [ ] 凭据不进源码与 CMake 缓存（`ARCH-SECRET`）。

## IO 与测试

- [ ] 文件、网络、设备访问在边界目标；核心目标可链接进测试而不需要真实资源。
- [ ] 测试目标链接被测库目标，不重新编译其源文件；`enable_testing()` + `add_test()` 接入 CTest。
- [ ] `CMAKE_EXPORT_COMPILE_COMMANDS=ON`（Ninja/Makefile 生成器），编译数据库在 `build/`，不入库。
- [ ] clang-tidy / IWYU 有一条可选构建或脚本入口，并写入 ARCHITECTURE.md 检查命令。
- [ ] 生成代码（protobuf、配置头）由 CMake 规则生成到构建目录，不手改。

## 常见陷阱

- [ ] **ODR**：头文件中非 `inline` 的函数/变量定义（clang-tidy `misc-definitions-in-headers`）；同名类型在不同翻译单元定义不同；头文件中的匿名命名空间。
- [ ] **静态初始化顺序**：跨翻译单元的全局对象互相依赖；靠静态对象构造做自动注册（静态库中未引用的目标文件会被丢弃）——改为显式注册或函数内静态（clang-tidy `bugprone-dynamic-static-initializers`、`cppcoreguidelines-avoid-non-const-global-variables`）。
- [ ] 头文件中 `using namespace`（clang-tidy `google-build-using-namespace`）。
- [ ] 公开头暴露第三方类型，导致下游被迫依赖该库（考虑 pimpl 或包装类型）。
- [ ] 单例/全局可变状态替代参数传递，测试无法隔离。
- [ ] 为单一实现建纯虚接口 + 工厂（见 AP-08）；模板泛化没有第二个实例化者。
