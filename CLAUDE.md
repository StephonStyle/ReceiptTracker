# 账单管家 Receipt Tracker

**路径**: `D:\ReceiptTracker`
**部署**: GitHub Pages → https://stephonstyle.github.io/ReceiptTracker/
**Repo**: https://github.com/StephonStyle/ReceiptTracker
**技术栈**: 纯 HTML/CSS/JS SPA + Supabase 数据库 + Chart.js
**后端代理**: Vercel (receipt-tracker-api)

## 核心文件
- `index.html` — 页面结构
- `css/style.css` — 样式
- `js/app.js` — 全部逻辑 (~2060行)
- `supabase.sql` — 数据库建表 SQL

## 修改后推送
改完代码直接 `git add` → `git commit` → `git push`，GitHub Pages 自动部署。不要问用户。

## 部署地址
用户实际用的是 GitHub Pages: https://stephonstyle.github.io/ReceiptTracker/
不是 Vercel 的那个地址。

## 全部已完成改动 (截至2026-05-27)

1. **OCR进度条** — 单图/多图都有进度条+步骤说明（compress→api→parse→done）
2. **第二次识别修复** — 过滤无名称/无价格的无效商品
3. **价格逻辑** — subtotal - discount + tax = total_amount（tax 应该加而不是减）
4. **商品折扣显示** — 详情页折扣单独一行在商品下面淡红显示(含折扣原因)
5. **品牌/中英文分离** — 分别录入和展示（brand_name, name_en, name_cn）
6. **返回按钮** — 简化逻辑+错误捕获
7. **货币选择** — 分析页可切换 CNY/EUR/USD/GBP
8. **每日趋势时间范围** — 7天/30天/90天/1年/全部
9. **移除笔均** — 统计分析页去掉笔均
10. **折扣数字淡红** — 录入页和详情页所有折扣数字淡红
11. **多图识别不覆盖** — 商品累加，一次性展示合并结果
12. **首页删除分类占比** — 与分析页重复已删除(保留分析页)
13. **英名去重品牌** — 品牌单独展示时英文名不再重复品牌
14. **超市子分类** — 超市购物下分坚果/蔬菜/宠物食品/糕点等12个细类
15. **商品折扣保存** — discount_amount + discount_reason 存入数据库
16. **自有品牌简化** — OCR 提示超市自有品牌直接填超市名
17. **折扣理由展示** — 付款明细折扣行显示折扣原因

## 工作流程规则
1. **必须测试** — 改完代码后先在本地用 Live Server 或直接打开 HTML 测试，确认无误后再提交推送
2. **长任务通知** — 执行超过30秒的任务完成后必须发桌面通知（PushNotification工具）

## 注意事项
- OCR 支持 5 个提供商：Claude/Gemini/DeepSeek/OpenAI/本地Tesseract
- 所有 API Key 存在 localStorage
- Supabase 使用匿名 key（公开只读），RLS 策略为公开访问
- 分析页货币换算尚未完全集成到 refreshAnalysis()
