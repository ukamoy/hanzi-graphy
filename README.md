# hanzi-graphy

汉字书写练习应用。学生选择课程练习书写汉字，系统记录笔顺正确率和评分。

## 技术栈

- 前端：React 19 + Vite + TypeScript
- 后端服务：**Supabase**（Postgres + Auth + RLS），无自建服务器

## 功能

- **角色**: 管理员、学生
- **认证**: 邮箱 + 密码（Supabase Auth），学生自助注册
- **年级预设**: 管理员配置年级汉字库
- **用户管理**: 管理员查看学生列表与课程数据
- **自动生成课程**: 从选定的年级字库随机取 20 字生成课程
- **自定义课程**: 学生手动输入汉字生成课程
- **书写练习**: 逐字描红，系统打分
- **课程列表**: 按创建时间正序排列，自动定位到第一个未完成课程

## 首次部署（Supabase）

### 1. 创建 Supabase 项目

在 [supabase.com](https://supabase.com) 新建项目。

### 2. 执行数据库迁移

打开控制台 **SQL Editor**，把 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 的完整内容粘贴执行（一次即可）。它会创建表、RLS 策略、注册触发器、年级字库种子数据。

### 3. 创建管理员账号

1. 控制台 **Authentication → Users → Add user**，用邮箱（如 `admin@hanzi.local`）和密码创建管理员；
2. 注册触发器会自动生成一条 `role=student` 的 profile；
3. 在 SQL Editor 执行把它提升为管理员：

```sql
update public.profiles
set name = '管理员', role = 'admin'
where id = (select id from auth.users where email = 'admin@hanzi.local');
```

### 4.（可选）关闭邮箱确认

若希望学生注册后直接可用（无需点邮箱确认链接）：控制台 **Authentication → Providers → Email**，关闭 **Confirm email**。

### 5. 配置本地环境变量

复制 `.env.example` 为 `.env`，填入项目信息（**Project Settings → API Keys** 获取，前端用 **Publishable key**，`sb_publishable_...` 开头）：

```
VITE_SUPABASE_URL=https://YOUR-PROJECT-REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

> 注意：publishable key 对应旧版 anon key（低权限、受 RLS 约束，可安全放在前端）；不要使用 secret key / service_role key（会绕过 RLS）。

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署到 Vercel

1. 把代码推送到 GitHub；
2. 在 Vercel 导入仓库，框架选择 **Vite**，构建设置 `npm run build`；
3. 在 Vercel 项目 **Settings → Environment Variables** 添加 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_PUBLISHABLE_KEY`（也可以安装 Vercel 的 Supabase 集成自动注入）；
4. 部署即可，无需服务器。

## 自建服务器部署（Docker 构建产物）

服务器无需安装 Node/npm，用 Docker 构建出静态 `dist`，交给任意静态服务器/静态托管。

先放好 `.env`（`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`），然后：

```bash
./run.sh
```

`./run.sh` 读取 `.env`，把环境变量作为 `--build-arg` 传入构建（Vite 构建时内联），缺失会直接报错；构建后用 volume 挂载把 dist 从容器拷到宿主机 `./dist`，无需 BuildKit、无需 docker cp（对任何 Docker 版本都可用）。

等价的手工命令：

```bash
docker build --target builder -t hanzigraphy-builder \
  --build-arg VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
  --build-arg VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
  .
rm -rf dist && mkdir -p dist
docker run --rm -v "$PWD/dist:/out" hanzigraphy-builder sh -c "cp -r /app/dist/. /out/"
```

把 `./dist` 复制/挂载到你的静态服务器即可（本项目是纯 SPA，需把未知路径回退到 `index.html`）。

- `Dockerfile`：Node 构建阶段（legacy builder 可构建）；`export` 导出阶段为 BuildKit 用户可选