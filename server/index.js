/**
 * 播客转录器 - 主服务器
 * 使用 DeepSeek API 替代 OpenAI
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { processAudio } = require('./services/deepseekService');
const { downloadPodcastAudio } = require('./services/podcastService');
const { getAudioFiles, estimateAudioDuration } = require('./services/audioInfoService');
const { cleanupAudioFiles } = require('./utils/fileSaver');
const { formatSizeMB } = require('./utils/formatUtils');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// 临时文件夹
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// SSE 进度推送
const progressClients = new Map();

app.get('/api/progress/:sessionId', (req, res) => {
    const sessionId = req.params.sessionId;
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
    });
    progressClients.set(sessionId, res);
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);
    req.on('close', () => progressClients.delete(sessionId));
});

function sendProgress(sessionId, progress, stage, stageText) {
    const client = progressClients.get(sessionId);
    if (client) {
        client.write(`data: ${JSON.stringify({ type: 'progress', progress: Math.round(progress), stage, stageText })}\n\n`);
    }
}

// 主处理接口
app.post('/api/process-podcast', async (req, res) => {
    try {
        const { url, operation, sessionId } = req.body;
        console.log('请求:', { url, operation });

        if (!url) return res.status(400).json({ success: false, error: '请提供播客链接' });

        // 1. 下载音频
        if (sessionId) sendProgress(sessionId, 10, 'download', '下载音频...');
        const podcastInfo = await downloadPodcastAudio(url);
        if (!podcastInfo?.audioFilePath) {
            return res.status(400).json({ success: false, error: '无法下载音频' });
        }

        // 2. 估算时长
        const duration = await estimateAudioDuration(podcastInfo.audioFilePath);
        console.log(`预估时长: ${Math.round(duration / 60)} 分钟`);

        // 3. 获取音频文件
        const audioFiles = await getAudioFiles(podcastInfo.audioFilePath);
        const shouldSummarize = operation === 'transcribe_summarize';

        // 4. 转录 + 优化 + 总结
        const result = await processAudio(
            audioFiles, shouldSummarize, tempDir, podcastInfo.title, sessionId,
            sessionId ? (p, s, t) => sendProgress(sessionId, p, s, t) : null
        );

        // 5. 清理音频
        cleanupAudioFiles(podcastInfo.audioFilePath, audioFiles);

        if (sessionId) sendProgress(sessionId, 100, 'complete', '处理完成');

        res.json({
            success: true,
            data: {
                ...result,
                podcastTitle: podcastInfo.title,
                estimatedDuration: duration,
                savedFiles: result.savedFiles || []
            }
        });

    } catch (error) {
        console.error('处理失败:', error);
        res.status(500).json({ success: false, error: error.message || '服务器错误' });
    }
});

// 获取临时文件列表
app.get('/api/temp-files', (req, res) => {
    try {
        const files = fs.readdirSync(tempDir)
            .filter(f => /\.(md|txt|m4a|mp3)$/.test(f))
            .map(f => {
                const stat = fs.statSync(path.join(tempDir, f));
                return { filename: f, size: stat.size, modified: stat.mtime };
            })
            .sort((a, b) => b.modified - a.modified);
        res.json({ success: true, files });
    } catch (e) {
        res.json({ success: true, files: [] });
    }
});

// 下载文件
app.get('/api/download/:filename', (req, res) => {
    const filePath = path.join(tempDir, req.params.filename);
    if (!filePath.startsWith(tempDir) || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, error: '文件未找到' });
    }
    res.download(filePath);
});

// 健康检查
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ai: 'DeepSeek', timestamp: new Date().toISOString() });
});

// 启动
app.listen(PORT, () => {
    console.log(`🎙️ 播客转录器运行在 http://localhost:${PORT}`);
    console.log(`🤖 AI: DeepSeek (${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com'})`);
});
