# 测试记录

## 2026-06-29 09:16:52 +0800

- 范围：`per_page` 页内 token 切分及页码隔离。
- 环境：macOS，Conda `ai_env`。
- 命令：`conda run -n ai_env python -m pytest -q test/test_text_splitter.py`
- 结果：通过，`1 passed`；初次 8.14 秒，格式整理后复验 3.74 秒。
- 命令：`conda run -n ai_env python -m py_compile web/backend/text_splitter.py test/test_text_splitter.py`
- 结果：通过。
- 命令：`conda run -n ai_env ruff check web/backend/text_splitter.py test/test_text_splitter.py`
- 结果：未通过；发现原文件已有的旧式 `typing.List`、`typing.Tuple` 和长行问题，以及新增测试的导入顺序问题。为避免扩大本次改动范围，未批量修改原文件，只修复新增测试。
- 命令：`conda run -n ai_env ruff check --select E4,E7,E9,F web/backend/text_splitter.py test/test_text_splitter.py`
- 结果：通过。
- 未覆盖：未调用 MinerU、Embedding 或其他网络服务，未运行完整测试套件，未验证 `full_text` 之外的业务链路。

## 2026-06-29 09:46:45 +0800

- 范围：问答预设与 LLM 重排 Prompt 的 YAML 配置加载、占位符校验和后端接入。
- 环境：macOS，Conda `ai_env`。
- 命令：`conda run -n ai_env python -m pytest -q test/test_prompt_config.py test/test_text_splitter.py`
- 结果：通过；首轮和最终复验均为 `4 passed`，最终耗时 3.66 秒。出现 1 条项目既有 `langchain-community` 弃用警告。
- 命令：`conda run -n ai_env ruff check web/backend/prompt_config.py test/test_prompt_config.py`
- 结果：首轮未通过，原因是新增测试导入顺序；修复后通过。
- 命令：`conda run -n ai_env ruff check --select E4,E7,E9,F web/backend/rag_service.py web/backend/llm_reranker.py`
- 结果：通过。
- 命令：`conda run -n ai_env python -m py_compile web/backend/prompt_config.py web/backend/rag_service.py web/backend/llm_reranker.py test/test_prompt_config.py`
- 结果：通过。
- 命令：`conda run -n ai_env pyright web/backend/prompt_config.py test/test_prompt_config.py`
- 结果：通过，`0 errors`。
- 未覆盖：未调用真实 LLM 或重排服务，未运行完整测试套件，未验证前端交互。

## 2026-06-29 10:00:29 +0800

- 范围：前端项目结构、Prompt 配置和 `per_page` token 切分说明同步。
- 环境：macOS，Conda `ai_env`，Node.js/Next.js 使用项目现有依赖。
- 命令：`npm run typecheck`
- 结果：未执行；`package.json` 未定义 `typecheck` 脚本。
- 命令：`npm test -- --run`
- 结果：未执行；`package.json` 未定义 `test` 脚本。
- 命令：`npx tsc --noEmit`
- 结果：通过，无 TypeScript 错误。
- 命令：`npm run build`
- 结果：通过；Next.js 15.5.18 编译、类型检查及 4 个静态页面生成成功。出现 1 条 Node.js `module.register()` 弃用警告。
- 未覆盖：未修改或复验架构图内容，未执行浏览器交互验收。

## 2026-06-29 10:05:56 +0800

- 范围：将 `chatRAG_update/ChatPDF` 的 Prompt YAML、按页 token 切分、前端说明、README、测试及截图目录改动合并回原始项目。
- 环境：macOS，Conda `ai_env`，Node.js/Next.js 使用原项目现有依赖。
- 文件核对：24 个迁移文件逐一与来源副本比较一致；首次核对因 zsh 保留变量名 `path` 覆盖命令搜索路径而停止，改用 `rel` 后通过；`git diff --check` 通过。
- 命令：`conda run -n ai_env python -m pytest -q test/test_prompt_config.py test/test_text_splitter.py`
- 结果：通过，`4 passed`，耗时 4.54 秒；出现 1 条项目既有 `langchain-community` 弃用警告。
- 命令：`npx tsc --noEmit`
- 结果：通过，无 TypeScript 错误。
- 命令：`npm run build`
- 结果：通过；Next.js 15.5.18 编译、类型检查及 4 个静态页面生成成功。出现 1 条 Node.js `module.register()` 弃用警告。
- 未覆盖：未调用真实 MinerU、Embedding、LLM 或重排服务，未执行浏览器交互验收。
