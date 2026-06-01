/**
 * RSS 解析服务
 */
const axios = require('axios');
const xml2js = require('xml2js');

async function parseRSSFeed(rssUrl) {
    console.log(`解析RSS: ${rssUrl}`);
    const { data } = await axios.get(rssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 0, maxContentLength: Infinity, maxBodyLength: Infinity
    });

    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(data);
    const channel = result.rss?.channel?.[0] || result.feed;
    if (!channel) throw new Error('无效RSS格式');

    const items = channel.item || channel.entry || [];
    const audioItems = [];

    for (const item of items) {
        const title = extractText(item.title);
        const description = extractText(item.description) || extractText(item.summary) || '';

        let audioUrl = null;
        if (item.enclosure?.[0]?.$?.url) audioUrl = item.enclosure[0].$.url;
        if (!audioUrl && item['media:content']?.[0]?.$?.url) audioUrl = item['media:content'][0].$.url;

        if (audioUrl) {
            audioItems.push({
                title: title || 'Untitled',
                description: description,
                audioUrl: audioUrl,
                pubDate: extractText(item.pubDate) || extractText(item.published)
            });
        }
    }

    console.log(`提取到 ${audioItems.length} 个音频`);
    return audioItems;
}

function extractText(node) {
    if (!node) return null;
    if (typeof node === 'string') return node.trim();
    if (Array.isArray(node) && node.length > 0) return extractText(node[0]);
    if (typeof node === 'object' && node._) return node._.trim();
    return null;
}

async function getXiaoyuzhouRSS(episodeUrl) {
    const podcastIdMatch = episodeUrl.match(/podcast\/([^\/]+)/);
    if (podcastIdMatch) {
        return `https://www.xiaoyuzhoufm.com/podcast/${podcastIdMatch[1]}/rss`;
    }
    return null;
}

module.exports = { parseRSSFeed, getXiaoyuzhouRSS };
