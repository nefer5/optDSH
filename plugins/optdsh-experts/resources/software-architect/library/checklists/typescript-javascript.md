# TypeScript / JavaScript 架构清单

按档位取用：一次性脚本只看“配置与硬编码”前两项；小工具看前四组；长期项目及以上全看。每项不满足时写明位置与理由。

## 布局与入口

- [ ] 模块系统明确：`package.json` 的 `"type"`（`module`/`commonjs`）与 `tsconfig` 的 `module`/`moduleResolution`（Node 项目用 `NodeNext`，打包项目用 `Bundler`）一致。
- [ ] 入口可列举：`bin`、`main`/`exports`、服务启动文件、前端根组件；入口只做参数/环境读取与装配。
- [ ] 包对外边界用 `exports` 字段声明，下游不能深路径导入内部文件。
- [ ] 根目录不平铺临时脚本；一次性脚本在项目约定的 scratch 目录（`ARCH-ROOT-SCRIPT`）。
- [ ] 单文件 >400 行已评估拆分；组件文件不同时承载数据获取、业务规则和渲染。

## 依赖与边界

- [ ] 无循环依赖（`ARCH-CYCLE`、dependency-cruiser `no-circular`，`tsPreCompilationDeps: true` 时含类型导入）。
- [ ] 分层或特性边界由工具强制（dependency-cruiser `forbidden` 或 eslint-plugin-boundaries `boundaries/dependencies`）。
- [ ] 特性目录之间只经各自 `index.ts` 的公开导出访问，不深路径导入（`features-not-to-features`）。
- [ ] **barrel 文件**：`index.ts` 只显式导出公开 API，不 `export *` 整个目录；barrel 不被同目录内部文件反向导入（易形成循环）；不在大型 barrel 后面藏副作用模块（影响 tree-shaking 和启动时间）。
- [ ] **路径别名**：`tsconfig` 的 `paths` 与打包器、测试运行器、lint resolver、dependency-cruiser `tsConfig` 同源；别名不用于绕过边界（`@/` 指向 `src/` 根时仍按目录规则检查）。
- [ ] **前后端共享代码**：共享包只含运行环境无关的代码（类型、schema、纯函数）；不 import `node:*`、数据库驱动、`window`/DOM；服务端专用代码在独立包或目录并被规则禁止从前端导入。
- [ ] 依赖在正确的 `dependencies`/`devDependencies`；生产代码不依赖 devDependencies。

## 配置与硬编码

- [ ] 无本机绝对路径、硬编码主机端口（`ARCH-HARDCODE`）；URL 从配置或环境注入。
- [ ] 密钥只在服务端读取；前端只接收构建期注入的公开变量（如 `VITE_*`、`NEXT_PUBLIC_*`），且不含凭据（`ARCH-SECRET`）。
- [ ] `process.env` 只在一个配置模块读取并校验（`no-restricted-syntax` / `no-restricted-imports` 可强制），其他模块接收类型化配置对象。
- [ ] 魔法字符串（路由、事件名、存储键）集中为常量或联合类型。

## IO 与测试

- [ ] `fetch`、`fs`、数据库调用集中在 `infra`/`api` 层；业务函数可用普通对象测试。
- [ ] UI 组件与业务规则分离：规则函数有独立单测，组件测试不重复验证规则。
- [ ] `tsc --noEmit` 与 lint、测试一起接入 `npm test` 或 CI。
- [ ] 生成代码（API 客户端、`*.generated.ts`、`dist/`）不手改、不入源码目录，生成命令写在 ARCHITECTURE.md。

## 常见陷阱

- [ ] ESM/CJS 混用：ESM 中用 `require`、`__dirname`（应改用 `import.meta.url` / `import.meta.dirname`）；CJS 包被 ESM 默认导入时的 `default` 包装差异。
- [ ] Node ESM 相对导入缺扩展名（`NodeNext` 下需写 `./x.js`）。
- [ ] 同一个包同时打出 ESM 和 CJS 两份时出现“双包实例”（单例、`instanceof` 失效）。
- [ ] 模块顶层副作用（注册、读环境、发请求）导致导入顺序敏感。
- [ ] `any`/类型断言绕过边界类型；`import type` 掩盖了错误方向的依赖。
- [ ] 为单一实现建 `interface + factory + DI`（见 few-shot 示例 7）。
