---
name: useful-skill
description: 描述这个 Skill 完成什么任务，以及用户何时应该使用它。
license: MIT
compatibility: Node.js 22+
metadata:
  author: your-name
  version: "1.0.0"
---

# Useful Skill

## 适用场景
当用户需要……时使用。

## 输入与输出
输入任务描述，输出 Markdown 报告。

## 工作流程
1. 读取输入并确认范围。
2. 分析内容并生成结果。
3. 验证结果符合输入要求。

## 示例
输入：整理变更记录。
输出：按新增、修复、改进分组的发布说明。

## 边界与安全
不读取密钥，不上传用户数据。覆盖已有文件前请求确认。

## 异常处理
输入为空时提示补充信息。网络超时只重试一次。
