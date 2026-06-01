/**
 * 播客下载服务
 * 支持 Apple Podcasts、小宇宙、RSS feed、直接音频URL
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { parseRSSFeed, getXiaoyuzhouRSS } = require('./rssParser');

async function downloadPodcastAudio(url) {
    console.log(`开始处理播客链接: ${url}`);
    const podcastInfo = await extractAudioUrl(url);

    if (!podcastInfo || !podcastInfo.audioUrl) {
        throw new Error('无法提取音频链接');
    }

    console.log(`音频URL: ${podcastInfo.audioUrl}`);
    const audioFilePath = await downloadAudioFile(podcastInfo.audioUrl);

    return {
        audioFilePath,
        title: podcastInfo.title || 'Untitled',
        description: podcastInfo.description || ''
    };
}

async function extractAudioUrl(url) {
    // 直接音频链接
    if (/\.(mp3|m4a|wav|aac|ogg)/i.test(url)) {
        return { audioUrl: url, title: path.basename(url), description: '' };
    }

    // Apple Podcasts
    if (url.includes('podcasts.apple.com')) {
        return await extractApplePodcast(url);
    }

    // 小宇宙
    if (url.includes('xiaoyuzhoufm.com')) {
        return await extractXiaoyuzhou(url);
    }

    // 通用 RSS
    return await extractGeneric(url);
}

async function extractApplePodcast(url) {
    console.log('处理 Apple Podcasts...');
    const idMatch = url.match(/id(\d+)/);
    if (!idMatch) throw new Error('无法提取节目ID');

    const podcastId = idMatch[1];
    const episodeId = url.match(/i=(\d+)/)?.[1];

    // 如果有 episode ID，先用 iTunes Episode Lookup API 精确获取
    if (episodeId) {
        console.log(`查找单集 ID: ${episodeId}`);
        try {
            const epLookupUrl = `https://itunes.apple.com/lookup?id=${episodeId}&entity=podcastEpisode`;
            const { data: epData } = await axios.get(epLookupUrl, { timeout: 15000 });
            if (epData.results?.length) {
                const ep = epData.results.find(r => r.wrapperType === 'podcastEpisode' || r.kind === 'podcast-episode');
                if (ep) {
                    console.log(`✅ 精确匹配到: ${ep.trackName || ep.collectionName}`);
                    // podcastEpisode 类型可能直接有 episodeUrl 或 feedUrl
                    if (ep.episodeUrl) {
                        return { audioUrl: ep.episodeUrl, title: ep.trackName || '', description: ep.description || '' };
                    }
                    // 如果有 feedUrl，从 RSS 中按标题匹配
                    if (ep.feedUrl || ep.collectionViewUrl) {
                        // 继续往下走，用 RSS 匹配
                    }
                    // 存储匹配到的集信息，用于后续 RSS 匹配
                    var matchedEpisodeTitle = ep.trackName;
                    var matchedEpisodeGuid = ep.trackId?.toString();
                }
            }
        } catch (e) {
            console.log('Episode lookup 失败，继续用 RSS:', e.message);
        }
    }

    // iTunes API 获取 RSS feed
    const itunesUrl = `https://itunes.apple.com/lookup?id=${podcastId}&entity=podcast`;
    const { data } = await axios.get(itunesUrl, { timeout: 15000 });

    if (!data.results?.length || !data.results[0].feedUrl) {
        // 备用：从网页抓取
        console.log('iTunes API 无结果，尝试网页抓取...');
        return await extractFromApplePage(url);
    }

    const feedUrl = data.results[0].feedUrl;
    console.log(`RSS: ${feedUrl}`);

    const items = await parseRSSFeed(feedUrl);
    if (!items?.length) throw new Error('RSS中无音频');

    // 匹配特定集数
    if (episodeId) {
        // 方法1: 用 episode title 匹配
        if (matchedEpisodeTitle) {
            const byTitle = items.find(item =>
                item.title && matchedEpisodeTitle &&
                (item.title.includes(matchedEpisodeTitle) || matchedEpisodeTitle.includes(item.title))
            );
            if (byTitle) {
                console.log(`✅ 按标题匹配到: ${byTitle.title}`);
                return { audioUrl: byTitle.audioUrl, title: byTitle.title, description: byTitle.description };
            }
        }
        // 方法2: 用 RSS 中的 link/guid 匹配
        const byLink = items.find(item =>
            item.link?.includes(episodeId) || item.audioUrl?.includes(episodeId)
        );
        if (byLink) return { audioUrl: byLink.audioUrl, title: byLink.title, description: byLink.description };

        console.log(`⚠️ 未精确匹配到 episode ${episodeId}，使用第一集`);
    }

    return { audioUrl: items[0].audioUrl, title: items[0].title, description: items[0].description };
}

async function extractFromApplePage(url) {
    console.log('从 Apple Podcasts 网页抓取...');
    const { data: html } = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });

    // 尝试 og:audio
    const ogAudio = html.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/);
    if (ogAudio) return { audioUrl: ogAudio[1], title: '', description: '' };

    // 尝试 JSON-LD
    const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/);
    if (jsonLdMatch) {
        try {
            const jsonLd = JSON.parse(jsonLdMatch[1]);
            if (jsonLd.url) return { audioUrl: jsonLd.url, title: jsonLd.name || '', description: jsonLd.description || '' };
        } catch (e) {}
    }

    // 尝试找音频链接
    const audioMatch = html.match(/https?:\/\/[^"'\s]+\.(?:mp3|m4a)(?:\?[^"'\s]*)?/);
    if (audioMatch) return { audioUrl: audioMatch[0], title: '', description: '' };

    throw new Error('该播客可能需要付费订阅，无法获取音频');
}

async function extractXiaoyuzhou(url) {
    console.log('处理小宇宙...');

    // 从网页 og:audio 提取
    try {
        const { data } = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
        const ogAudio = data.match(/<meta\s+property="og:audio"\s+content="([^"]+)"/);
        if (ogAudio) return { audioUrl: ogAudio[1], title: '', description: '' };

        const jsonLd = data.match(/"contentUrl":"([^"]+\.m4a)"/);
        if (jsonLd) return { audioUrl: jsonLd[1], title: '', description: '' };
    } catch (e) {
        console.log('小宇宙网页抓取失败:', e.message);
    }

    // RSS 备用
    try {
        const rssUrl = await getXiaoyuzhouRSS(url);
        if (rssUrl) {
            const items = await parseRSSFeed(rssUrl);
            if (items?.length) return { audioUrl: items[0].audioUrl, title: items[0].title, description: items[0].description };
        }
    } catch (e) {
        console.log('小宇宙RSS失败:', e.message);
    }

    throw new Error('无法从小宇宙获取音频');
}

async function extractGeneric(url) {
    console.log('处理通用链接...');

    // 如果是 RSS
    if (url.includes('.xml') || url.includes('rss') || url.includes('feed')) {
        const items = await parseRSSFeed(url);
        if (items?.length) return { audioUrl: items[0].audioUrl, title: items[0].title, description: items[0].description };
    }

    // 从网页找音频
    const { data } = await axios.get(url, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });

    const patterns = [
        /(https?:\/\/[^"'\s]+\.(?:mp3|m4a|wav)(?:\?[^"'\s]*)?)/i,
        /<enclosure[^>]+url=["']([^"']+)["']/i
    ];

    for (const p of patterns) {
        const m = data.match(p);
        if (m) return { audioUrl: m[1], title: '', description: '' };
    }

    throw new Error('无法找到音频链接');
}

async function downloadAudioFile(audioUrl) {
    console.log(`下载音频: ${audioUrl}`);

    const tempDir = path.join(__dirname, '../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const fileName = `audio_${Date.now()}`;
    const response = await axios({
        method: 'GET',
        url: audioUrl,
        responseType: 'stream',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 0,
        maxContentLength: Infinity
    });

    const contentType = response.headers['content-type'] || '';
    let ext = '.mp3';
    if (contentType.includes('mp4') || contentType.includes('m4a')) ext = '.m4a';
    else if (contentType.includes('wav')) ext = '.wav';

    const filePath = path.join(tempDir, fileName + ext);
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', () => {
            const stats = fs.statSync(filePath);
            console.log(`下载完成: ${filePath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);
            if (stats.size < 1024) {
                fs.unlinkSync(filePath);
                reject(new Error('文件太小，可能无效'));
                return;
            }
            resolve(filePath);
        });
        writer.on('error', reject);
        setTimeout(() => { writer.destroy(); reject(new Error('下载超时')); }, 180000);
    });
}

module.exports = { downloadPodcastAudio, extractAudioUrl, downloadAudioFile };
