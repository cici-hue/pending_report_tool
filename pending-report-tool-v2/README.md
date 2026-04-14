# AQL 检验报告工具 - 豆包 API 版本

使用豆包 LLM API 智能提取 AQL 检验报告中的信息。

## 功能特点

- 📄 PDF 文本智能提取（使用 pdf.js）
- 🤖 豆包 API 智能识别字段（PO#, Style#, Item#, Inspection Qty 等）
- ✏️ 所有字段可编辑
- 📊 自动计算疪点比例
- 📧 一键生成邮件
- 📜 历史记录保存

## 环境要求

- Node.js >= 18
- npm >= 9

## 安装步骤

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd pending-report-tool-v2
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置豆包 API Key

创建 `.env` 文件：

```bash
# 豆包 API Key
VITE_DOUBAO_API_KEY=your_api_key_here
```

获取 API Key：https://console.volcengine.com/ark/

### 4. 运行开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 5. 构建生产版本

```bash
npm run build
```

构建产物在 `dist/` 目录

## 部署说明

### 方案 A：静态部署（推荐）

构建后直接部署 `dist/` 目录到任意静态服务器：

```bash
# 使用 serve
npm install -g serve
serve -s dist -l 3000

# 或使用 nginx
# 将 dist/ 内容复制到 /usr/share/nginx/html/
```

### 方案 B：Vercel 部署

```bash
npm install -g vercel
vercel --prod
```

### 方案 C：Docker 部署

创建 `Dockerfile`：

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```
