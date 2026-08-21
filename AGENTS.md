# AGENTS.md

Vue 3 + TypeScript + Vite 单页应用：英语词汇抽查工具，部署在 GitHub Pages。

## 命令

```bash
pnpm install
pnpm dev        # 先跑 generate-manifest 再启动 vite
pnpm build      # generate-manifest → vue-tsc -b → vite build
pnpm manifest   # 只重新生成 manifest
```

- 没有测试、没有 ESLint。验证改动 = `pnpm build`（`vue-tsc -b` 就是 typecheck）。
- `tsconfig.app.json` 开了 `erasableSyntaxOnly`（禁用 enum / namespace / 参数属性）、`noUnusedLocals`、`noUnusedParameters`。
- 包管理器固定 pnpm（`packageManager: pnpm@10.30.3`），CI 用 Node 22。

## 单词表（public/word_table/）— 最高风险区

- 每个文件夹 = 一组，每个 JSON 文件 = 一张表。**manifest.json 是构建产物，不要手改**（`pnpm manifest` 重新生成）。
- schema 校验在 `scripts/generate-manifest.js`，非法文件会让 `pnpm build` 直接失败。真实字段名以该校验和 `src/types/index.ts` 的 `RawWord` 为准：`chinese_translations`（README 示例 JSON 里写的 `chinese_explanations` 是错的）。
- **用户进度按文件原始 JSON 文本的 hash 键存 localStorage**（cyrb53，见 `src/business/progressStorage.ts`）。改动单词表文件——哪怕只是重新格式化空白字符——会改变 hash 并清空该表所有用户进度。改表前先确认可以接受这一点。
- 新增/修改单词表后必须重启 dev server：manifest 只在启动时生成，vite 不 watch 它。
- 文件夹和文件名会原样拼进运行时 fetch 的 URL（`/word_table/${folder}/${fileName}.json`），名字里可以有空格和中文。

## 架构

- `src/App.vue` 是壳，屏幕组件在 `src/components/`（InputScreen → QuizScreen → SummaryScreen 等）。
- `src/business/` 是纯逻辑：`quizEngine`（出题/判分）、`cardGenerator`（四种模式出卡）、`wordProcessor`（JSON → ProcessedWord）、`progressStorage`（localStorage 进度）。
- 单词数据不打进 bundle：运行时从 `public/` 用绝对路径 fetch（3 处，都在 `InputScreen.vue`）。若改为非根路径部署，需同步改这些 fetch（vite.config 未设 `base`）。

## 部署与风格

- push 到 `main` 即触发 GitHub Actions 构建并发布到 GitHub Pages（`.github/workflows/build_vue.yml`）——push main 等于上线。
- 代码风格按 `.prettierrc.json`：无分号、单引号、100 列、2 空格缩进。
- UI 文案、注释、单词表内容均为中文，保持一致。
