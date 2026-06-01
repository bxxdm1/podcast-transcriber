/**
 * DeepSeek AI 服务
 * 替代 OpenAI，用于文本优化和总结
 * DeepSeek API 兼容 OpenAI 格式
 */
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// 初始化 DeepSeek 客户端（兼容 OpenAI SDK）
const deepseek = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    timeout: 600000,
    maxRetries: 2
});

const DEEPSEEK_MODEL = 'deepseek-chat';

console.log(`🤖 AI服务: DeepSeek (${DEEPSEEK_MODEL})`);

/**
 * 生成标准化的文件名
 */
function generateFilePrefix(type, title) {
    let cleanTitle = title
        .replace(/\s*\|\s*/g, '-')
        .replace(/\s*:\s*/g, '-')
        .replace(/[<>:"/\\|?*]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^\w一-龥\-_.]/g, '');
    if (cleanTitle.length > 30) cleanTitle = cleanTitle.substring(0, 30);
    const uuid = Math.random().toString(36).substr(2, 6).toUpperCase();
    return `${type}_${cleanTitle}_${uuid}`;
}

/**
 * 处理音频文件：转录 + 优化 + 总结
 */
async function processAudio(audioFiles, shouldSummarize = false, tempDir = null, podcastTitle = null, sessionId = null, sendProgress = null) {
    try {
        console.log(`🤖 开始音频处理`);
        const files = Array.isArray(audioFiles) ? audioFiles : [audioFiles];
        console.log(`📄 处理文件数量: ${files.length}`);

        let transcript = '';
        let savedFiles = [];

        if (files.length === 1) {
            // 单文件处理 - 调用 Python Whisper 脚本
            const scriptPath = path.join(__dirname, '..', 'whisper_transcribe.py');
            const filePrefix = generateFilePrefix('raw', podcastTitle || 'Untitled');
            const pythonPath = process.env.PYTHON_PATH || 'python';
            const command = `"${pythonPath}" "${scriptPath}" "${files[0]}" --model ${process.env.WHISPER_MODEL || 'base'} --save-transcript "${tempDir}" --file-prefix "${filePrefix}" --podcast-title "${podcastTitle || 'Untitled'}"`;

            console.log(`🎤 Whisper 转录: ${path.basename(files[0])}`);
            if (sendProgress) sendProgress(30, 'transcription', '语音转录中...');

            const { stdout, stderr } = await execAsync(command, {
                cwd: path.join(__dirname, '..'),
                maxBuffer: 1024 * 1024 * 20,
                timeout: 3600000,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            if (stderr && stderr.trim()) console.log(`🔧 Whisper日志: ${stderr.trim()}`);

            const result = JSON.parse(stdout);
            if (!result.success) throw new Error(result.error || '转录失败');

            transcript = result.text || '';
            savedFiles = result.savedFiles || [];
            console.log(`✅ 转录完成: ${transcript.length} 字符`);

            // DeepSeek 智能优化转录文本
            if (sendProgress) sendProgress(50, 'optimizing', 'AI优化文本中...');
            let optimizedTranscript = transcript;
            try {
                optimizedTranscript = await optimizeTranscript(transcript);
                console.log(`✅ 文本优化完成: ${optimizedTranscript.length} 字符`);

                // 保存优化后的文本
                if (savedFiles.length > 0) {
                    const transcriptFile = savedFiles.find(f => f.type === 'transcript');
                    if (transcriptFile && fs.existsSync(transcriptFile.path)) {
                        // 备份原始转录
                        const backupPath = transcriptFile.path.replace('.md', '_original.md');
                        if (!fs.existsSync(backupPath)) {
                            fs.copyFileSync(transcriptFile.path, backupPath);
                        }
                        fs.writeFileSync(transcriptFile.path, optimizedTranscript, 'utf8');
                    }
                }
                transcript = optimizedTranscript;
            } catch (optErr) {
                console.warn(`⚠️ 文本优化失败，使用原始转录: ${optErr.message}`);
            }

            // 生成总结
            let summary = null;
            if (shouldSummarize) {
                console.log(`📝 生成总结...`);
                if (sendProgress) sendProgress(70, 'summary', 'AI生成总结中...');
                try {
                    summary = await generateSummary(transcript);
                    const summaryPrefix = generateFilePrefix('summary', podcastTitle || 'Untitled');
                    const summaryFileName = `${summaryPrefix}.md`;
                    const summaryPath = path.join(tempDir, summaryFileName);
                    fs.writeFileSync(summaryPath, `# 🎙️ ${podcastTitle || '播客总结'}\n\n${summary}`, 'utf8');
                    savedFiles.push({
                        type: 'summary',
                        filename: summaryFileName,
                        path: summaryPath,
                        size: fs.statSync(summaryPath).size
                    });
                    console.log(`📋 总结已保存: ${summaryFileName}`);
                } catch (sumErr) {
                    console.error(`❌ 总结生成失败: ${sumErr.message}`);
                }
            }

            return {
                transcript: transcript,
                summary: summary,
                language: 'zh',
                audioDuration: result.duration,
                savedFiles: savedFiles
            };
        }

        // 多文件处理
        for (let i = 0; i < files.length; i++) {
            console.log(`🎵 转录片段 ${i + 1}/${files.length}`);
            const result = await transcribeSingleFile(files[i]);
            if (result) transcript += result + '\n\n';
        }

        return { transcript: transcript.trim(), summary: null, savedFiles: [] };

    } catch (error) {
        console.error('❌ 音频处理失败:', error);
        throw error;
    }
}

/**
 * 调用 Whisper 转录单个文件
 */
async function transcribeSingleFile(audioPath) {
    const scriptPath = path.join(__dirname, '..', 'whisper_transcribe.py');
    const pythonPath = process.env.PYTHON_PATH || 'python';
    const command = `"${pythonPath}" "${scriptPath}" "${audioPath}" --model ${process.env.WHISPER_MODEL || 'base'}`;

    const { stdout } = await execAsync(command, {
        cwd: path.join(__dirname, '..'),
        maxBuffer: 1024 * 1024 * 20,
        timeout: 1200000,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    const result = JSON.parse(stdout);
    return result.success ? result.text : null;
}

/**
 * DeepSeek 优化转录文本
 */
async function optimizeTranscript(rawTranscript) {
    const maxChars = 6000;
    if (rawTranscript.length <= maxChars) {
        return await optimizeChunk(rawTranscript);
    }

    // 分块处理长文本
    const chunks = splitText(rawTranscript, maxChars);
    console.log(`📄 长文本分为 ${chunks.length} 块优化`);

    const optimized = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`🔄 优化第 ${i + 1}/${chunks.length} 块`);
        const chunk = await optimizeChunk(chunks[i], i > 0 ? chunks[i - 1].slice(-100) : null);
        optimized.push(chunk);
        if (i < chunks.length - 1) await sleep(1000);
    }
    return optimized.join('\n\n');
}

/**
 * DeepSeek 优化单个文本块
 */
async function optimizeChunk(text, prevContext = null) {
    let contextHint = '';
    if (prevContext) {
        contextHint = `[上文续：${prevContext}]\n\n`;
    }

    const response = await deepseek.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
            {
                role: 'system',
                content: '你是专业的音频转录文本优化助手。修正错别字、同音字错误，改善语法，添加合适标点，但必须保持原意不变。按话题合理分段，使用Markdown格式，段落间用双换行分隔。不要添加分隔线。'
            },
            {
                role: 'user',
                content: `${contextHint}请优化以下转录文本：\n\n${text}`
            }
        ],
        temperature: 0.1,
        max_tokens: 4096
    });

    return response.choices[0].message.content.trim();
}

/**
 * DeepSeek 生成播客总结
 */
async function generateSummary(transcript) {
    const maxChars = 6000;
    if (transcript.length <= maxChars) {
        return await generateSummaryChunk(transcript);
    }

    // 分块总结再整合
    const chunks = splitText(transcript, maxChars);
    console.log(`📄 长文本分为 ${chunks.length} 块总结`);

    const summaries = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`🔄 总结第 ${i + 1}/${chunks.length} 块`);
        const s = await generateSummaryChunk(chunks[i]);
        summaries.push(s);
        if (i < chunks.length - 1) await sleep(1000);
    }

    // 整合所有分块总结
    const combined = summaries.join('\n\n');
    return await mergeSummaries(combined);
}

/**
 * DeepSeek 生成单块总结
 */
async function generateSummaryChunk(text) {
    const response = await deepseek.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
            {
                role: 'system',
                content: `你是一个专业的播客内容分析师。请生成全面、结构化的中文总结：

要求：
1. 提取主要话题和核心观点
2. 保持逻辑结构清晰
3. 包含重要的讨论内容、观点和结论
4. 使用简洁明了的中文

**严格排除以下内容：**
- 赞助商广告和商业推广
- 节目资助方信息
- 播客标准开头结尾语
- 制作团队信息

格式要求：Markdown格式，段落之间用双换行分隔。每个段落专注一个主题。`
            },
            { role: 'user', content: text }
        ],
        temperature: 0.5,
        max_tokens: 3000
    });

    return response.choices[0].message.content.trim();
}

/**
 * 整合分块总结
 */
async function mergeSummaries(combinedSummaries) {
    const response = await deepseek.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: [
            {
                role: 'system',
                content: `请将以下分段总结整合成一个完整、连贯的播客总结：
1. 去除重复内容
2. 按主题重新组织
3. 段落之间必须有空行分隔
4. 使用Markdown格式
5. 使用简洁明了的中文
6. 严格排除广告等无价值内容`
            },
            { role: 'user', content: combinedSummaries }
        ],
        temperature: 0.3,
        max_tokens: 4000
    });

    return response.choices[0].message.content.trim();
}

/**
 * 智能分块（按段落和句子边界）
 */
function splitText(text, maxChars) {
    const chunks = [];
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
    let current = '';

    for (const para of paragraphs) {
        const test = current + (current ? '\n\n' : '') + para;
        if (test.length > maxChars && current) {
            chunks.push(current.trim());
            current = para;
        } else {
            current = test;
        }
    }
    if (current.trim()) chunks.push(current.trim());

    // 对仍然超长的块按句子分割
    const result = [];
    for (const chunk of chunks) {
        if (chunk.length <= maxChars) {
            result.push(chunk);
        } else {
            const sentences = chunk.split(/([。！？.!?]+\s*)/).filter(s => s.trim());
            let sub = '';
            for (let i = 0; i < sentences.length; i += 2) {
                const s = sentences[i] + (sentences[i + 1] || '');
                if ((sub + s).length > maxChars && sub) {
                    result.push(sub.trim());
                    sub = s;
                } else {
                    sub += s;
                }
            }
            if (sub.trim()) result.push(sub.trim());
        }
    }
    return result;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { processAudio, generateSummary, optimizeTranscript };
