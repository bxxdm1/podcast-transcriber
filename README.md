# 🎙️ 播客转录器 (DeepSeek版)

基于 [podcast-transcriber](https://github.com/wendy7756/podcast-transcriber) 改造的播客语音转文字 + AI总结工具。

将 OpenAI 替换为 **DeepSeek**，转录部分保持使用本地 **Faster-Whisper** 模型。

## ✨ 功能特性

- **🔗 多平台支持**：Apple Podcasts、小宇宙、RSS订阅源、直接音频URL
- **🚀 本地转录**：使用 Faster-Whisper 模型，无需联网即可转录
- **🤖 AI总结**：DeepSeek 智能生成播客内容总结
- **📝 文本优化**：AI自动修正错别字、优化排版
- **📱 响应式UI**：深色主题，支持电脑和手机

## 🏗️ 技术栈

| 组件 | 技术 | 说明 |
|------|------|------|
| 前端 | HTML + CSS + 原生JS | 深色主题响应式UI |
| 后端 | Node.js + Express | API服务 |
| 转录 | Faster-Whisper (Python) | 本地语音转文字 |
| AI | DeepSeek API | 文本优化 + 总结 |

## 📦 安装

### 环境要求

- Node.js 16+
- Python 3.8+ (推荐 Anaconda)
- ffmpeg

### 步骤

```bash
# 1. 克隆仓库
git clone <your-repo-url>
cd podcast-transcriber

# 2. 安装 Node.js 依赖
npm install

# 3. 安装 Python 依赖
pip install faster-whisper

# 4. 安装 ffmpeg
# Anaconda:
conda install ffmpeg
# 或 Ubuntu:
# sudo apt install ffmpeg
# 或 macOS:
# brew install ffmpeg

# 5. 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 DeepSeek API Key

# 6. 启动
npm start
```

## ⚙️ 配置

编辑 `.env` 文件：

```env
# DeepSeek API (必填)
DEEPSEEK_API_KEY=sk-your-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Whisper 模型 (tiny/base/small/medium/large-v3)
WHISPER_MODEL=base

# 服务器端口
PORT=3000

# Python 路径 (如果不在PATH中)
PYTHON_PATH=D:/Study_tools/Anaconda/python.exe
```

### Whisper 模型选择

| 模型 | 大小 | 速度 | 精度 | 推荐场景 |
|------|------|------|------|----------|
| tiny | ~75MB | 最快 | 一般 | 快速测试 |
| base | ~150MB | 快 | 较好 | **日常使用（默认）** |
| small | ~500MB | 中等 | 好 | 追求质量 |
| medium | ~1.5GB | 慢 | 很好 | 高质量需求 |
| large-v3 | ~3GB | 最慢 | 最佳 | 专业转录 |

## 🚀 使用

1. 启动后访问 `http://localhost:3000`
2. 粘贴播客链接（支持以下格式）：
   - Apple Podcasts: `https://podcasts.apple.com/cn/podcast/...`
   - 小宇宙: `https://www.xiaoyuzhoufm.com/episode/...`
   - RSS: `https://feed.xxx.com/rss`
   - 直接音频: `https://xxx.com/audio.mp3`
3. 选择操作：
   - **仅转录**：语音→文字
   - **转录+总结**：语音→文字→AI总结

## 📁 项目结构

```
podcast-transcriber/
├── public/
│   └── index.html              # 前端界面
├── server/
│   ├── index.js                # Express 主服务
│   ├── whisper_transcribe.py   # Faster-Whisper 转录脚本
│   ├── services/
│   │   ├── deepseekService.js  # DeepSeek AI 服务
│   │   ├── podcastService.js   # 播客下载服务
│   │   └── rssParser.js        # RSS 解析
│   └── utils/
│       ├── fileSaver.js        # 文件清理
│       └── formatUtils.js      # 格式化工具
├── .env                        # 环境配置（需自行创建）
├── .env.example                # 配置模板
├── package.json
└── README.md
```

## 🔄 与原项目的区别

| | 原项目 | 本项目 |
|---|--------|--------|
| AI服务 | OpenAI GPT-4 | **DeepSeek** |
| 转录 | Faster-Whisper | Faster-Whisper（不变） |
| 翻译 | GPT-4o | 暂未实现 |
| 成本 | 较高 | **更低** |

## 📄 许可证

Apache 2.0

## 🙏 致谢

- [podcast-transcriber](https://github.com/wendy7756/podcast-transcriber) - 原始项目
- [Faster-Whisper](https://github.com/SYSTRAN/faster-whisper) - 语音转录引擎
- [DeepSeek](https://platform.deepseek.com/) - AI API
