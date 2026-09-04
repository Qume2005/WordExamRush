# WordExamRush

英语词汇抽查工具，基于 Vue 3 + TypeScript + Vite 构建，部署在 GitHub Pages。

## 功能

- 从预置单词表中选择，支持按文件夹批量背诵
- 四种测试模式：看中文选英文、看英文选中文、看英文选近义词、看英文解释选英文
- 单词支持多种拼写变体（如英/美拼写）
- 每条释义带词性标签、英英释义与专属例句，答案卡按条目分组展示；相同词性/英英/例句的多条中文释义自动归并为释义组
- 键盘快捷键操作（数字键选选项，其他键跳过）
- 浏览器本地保存进度，关闭页面后可继续
- 进度按单词表独立追踪，支持断点续传
- 单词表内容变更后自动清理过期进度
- 构建时自动验证单词表格式
- 答案卡词根拆解展示（有词根数据的词）
- 答案卡音标展示（有音标数据的词）
- OneDrive 云同步（个人微软账号）：登录后进度自动备份到自己的 OneDrive，换设备登录同一账号可合并进度

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
    "phonetic": "/əˈbændən/",
    "english_synonyms": ["forsake", "desert"],
    "english_explanations": ["to leave a place forever"],
    "chinese_translations": [
      { "pos": "v.", "meaning": "放弃", "english": "to leave sb, especially sb you are responsible for, with no intention of returning", "example": "He abandoned his old car." },
      { "pos": "v.", "meaning": "遗弃", "english": "to leave a thing or place, especially because it is impossible or dangerous to stay", "example": "The crew abandoned the sinking ship." }
    ]
  },
  {
    "word": ["inspect"],
    "english_synonyms": ["examine", "review"],
    "english_explanations": ["To look at something closely or carefully."],
    "chinese_translations": [
      { "pos": "v.", "meaning": "检查", "english": "to look at something closely or carefully", "example": "The manager inspected the report carefully." }
    ],
    "roots": [{"root": "in-", "meaning": "into"}, {"root": "spect", "meaning": "look"}]
  }
]
```

字段说明：

| 字段                     | 类型         | 必填 | 说明                   |
|------------------------|------------|----|----------------------|
| `word`                 | `string[]` | 是  | 单词及拼写变体              |
| `phonetic`             | `string`   | 否  | 音标（如 /əˈbændən/），原样显示在答案卡单词旁 |
| `english_synonyms`     | `string[]` | 是  | 英文近义词                |
| `english_explanations` | `string[]` | 否  | 英文释义（有则启用"看解释选单词"模式） |
| `chinese_translations` | `SenseEntry[]` | 是  | 释义条目数组，每条 {pos, meaning, english, example}（词性、释义、英英释义、该条专属例句，均必填） |
| `roots`                | `RootInfo[]` | 否 | 词根拆解（如 in-+spect），每项 {root, meaning}，meaning 为针对该词的简短英文释义；有则答案卡显示词根区块 |

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

## 云同步（OneDrive）

使用个人微软账号（outlook/hotmail 等）登录，进度自动备份到应用在 OneDrive 中的私有文件夹（approot）。同一账号在其他设备登录时，进度会合并回来。合并采用逐词收敛策略，两台设备的记录都会保留。

### 配置步骤

在 Azure 门户中注册应用：

- 支持账户类型：选"个人 Microsoft 账户"（不支持工作/学校账号）
- 平台：添加"单页应用程序"(SPA)
- 重定向 URI 注册两个：`https://rush.liqianmo.ink/` 与备用 `https://qume2005.github.io/WordExamRush/`
- API 权限：添加委托权限 `Files.ReadWrite.AppFolder` + `User.Read`
- 把 Application (client) ID 填入 `src/business/syncConfig.ts` 的 `MSAL_CLIENT_ID`

### 何时会同步

- 启动时（已登录则静默同步）
- 退出答题或详情屏时
- 切换到后台时（best-effort 兜底上传）
- 手动点击"立即同步"

答题过程中不自动上传。

### 已知上限

1. 本地"重置进度"后，云端旧进度在下次同步时会被合并回来（换设备清理需先登出或清空云端文件）
2. 双设备同一时刻上传时，后写的会覆盖先写的
3. 同一浏览器双标签页同时答题本就互相覆盖（既有行为），云同步会固化这种覆盖
4. 单词表文件内容变更会更换进度 key（hash），旧进度经墓碑机制清除后不可恢复
5. 仅支持个人微软账号（outlook/hotmail 等），不支持工作/学校 OneDrive 账号
6. 单词表内容回滚到旧版本后，需在所有已同步设备上重新打开该表才能恢复进度（墓碑解毒仅本地成立）
