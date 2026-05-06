# 部署到 Vercel · 一次性 5-10 分钟

## 推荐路径：GitHub + Vercel（方便后续每月更新）

为什么推荐这条：以后改了 `index.html` 只要 `git push`，Vercel 自动重部署，不用手动操作。

### Step 1: 把这个文件夹推到 GitHub

1. 在 [github.com/new](https://github.com/new) 创建新 repo，名字建议 `umaru-30day-progress`（或你想要的名字），**Public**
2. 终端 cd 到本文件夹（`umaru-30day-public/`），跑：

```bash
git init
git add .
git commit -m "Day 0: launch the 30-day LLM sprint dashboard"
git branch -M main
git remote add origin git@github.com:<你的用户名>/<repo 名>.git
git push -u origin main
```

### Step 2: Vercel 部署

1. 去 [vercel.com](https://vercel.com)，**用 GitHub 登录**（如果还没登录）
2. Dashboard 右上角 → **Add New** → **Project**
3. 找到刚推的 repo，点 **Import**
4. 全部默认值，直接点 **Deploy**
5. 等约 30 秒，拿到 URL，例：`umaru-30day-progress.vercel.app`

### Step 3（可选）：自定义域名

如果你有自己的域（如 `umaru.dev`）：

1. Vercel 项目页 → **Settings** → **Domains**
2. 加 `30days.umaru.dev`（或你想要的子域）
3. 跟着提示去你的 DNS 服务商加 CNAME 记录
4. 等 DNS 生效（几分钟到几小时）

### 后续怎么更新

每月底重新生成 schedule 后，让 Claude 把新内容写进 `index.html`，然后：

```bash
git add index.html
git commit -m "Month 2: switch to June schedule"
git push
```

Vercel 自动重新部署，URL 不变。

---

## 备选：CLI 直接部署（不走 GitHub）

适合你只想立刻看到效果，不打算做 build-in-public 的情况。

```bash
# 在本文件夹下
npx vercel
```

跟着提示走（首次会让你登录），结束时给你一个 URL。但这条路不能 build-in-public，因为 repo 不公开。

---

## 选哪个？

**强烈推荐 GitHub 路径**。理由：

1. 你的 4 个月主线里有「自媒体 build in public」一项，**公开 repo 本身是内容**——README 里写"我是谁、为什么做、4 月底要去哪"，每个 commit 是进度签
2. 后续每月更新只要 `git push`，30 秒搞定
3. Vercel 部署、自定义域、回滚版本都通过 Git 历史完成，比手动管理简单

---

## 常见坑

- **`index.html` 必须叫这个名**——Vercel 看根目录的 `index.html` 服务为 `/`
- **localStorage 是按域名存的**——换 URL（比如从 `*.vercel.app` 切到自定义域）会丢勾选状态。建议一开始就定好域
- **部署失败**：99% 是 `package.json` 不存在导致 Vercel 当成 Node 项目报错。本仓库没有 `package.json` 是正确的，Vercel 会识别为静态站点。如果它没识别，去 **Project Settings → Build & Development Settings**，**Framework Preset** 改成 **Other**

---

## Build-in-public 启动文案（可选）

部署完后发推 / 即刻 / 小红书：

```
我开始了我的 4 个月 AI/Agent 学习冲刺，第一个月主题是 LLM 内功 + Agent 工程。

每天进度公开：
- Dashboard：[你的 Vercel URL]
- 长帖每周末更
- 月底会发完整复盘

第 1 天：Day 1 — 项目方向决策日。
```
