# WordExamRush

英语词汇抽查工具，基于 Vue 3 + TypeScript + Vite 构建，部署在 GitHub Pages。

## 功能

- 从预置单词表中选择，支持按文件夹批量背诵
- 四种测试模式：看中文选英文、看英文选中文、看英文选近义词、看英文解释选英文
- 单词支持多种拼写变体（如英/美拼写）
- 键盘快捷键操作（数字键选选项，其他键跳过）
- 浏览器本地保存进度，关闭页面后可继续
- 进度按单词表独立追踪，支持断点续传
- 单词表内容变更后自动清理过期进度
- 构建时自动验证单词表格式

## 单词表格式

在 `public/word_table/` 下按文件夹组织，每个 JSON 文件是一个单词表：

```
public/word_table/
  ├─ CET4/
  │   ├─ list1.json
  │   └─ list2.json
  └─ IELTS/
      └─ core.json
```

每个 JSON 文件格式：

```json
[
  {
    "word": ["abandon", "abandon<英>"],
    "english_synonyms": ["forsake", "desert"],
    "english_explanations": ["to leave a place forever"],
    "chinese_explanations": ["放弃", "遗弃"],
    "example_sentences": "He abandoned his old car."
  }
]
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `word` | `string[]` | 是 | 单词及拼写变体 |
| `english_synonyms` | `string[]` | 是 | 英文近义词 |
| `english_explanations` | `string[]` | 否 | 英文释义（有则启用"看解释选单词"模式） |
| `chinese_explanations` | `string[]` | 是 | 中文释义 |
| `example_sentences` | `string` | 是 | 例句 |

## 开发

```bash
pnpm install
pnpm dev
```

添加新单词表后需要重启 dev server（manifest 在启动时生成）。

## 构建

```bash
pnpm build
```

构建流程：生成 manifest → 校验单词表 → TypeScript 编译 → Vite 打包。格式不合法的单词表会导致构建失败。

## 技术栈

- Vue 3.5 + Composition API
- TypeScript 6
- Vite 8
