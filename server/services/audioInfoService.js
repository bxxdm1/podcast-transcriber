/**
 * 音频信息服务
 */
const fs = require('fs');
const path = require('path');

async function getAudioFiles(audioPath) {
    const stat = fs.statSync(audioPath);
    if (stat.size > 100 * 1024 * 1024) {
        console.log('⚠️ 文件较大，建议分段处理');
    }
    return [audioPath];
}

async function estimateAudioDuration(audioPath) {
    const stat = fs.statSync(audioPath);
    const sizeMB = stat.size / (1024 * 1024);
    return Math.round(sizeMB * 60); // 粗略估算: ~1MB/min for mp3
}

function estimateAudioDurationFromSize(bytes) {
    return Math.round((bytes / (1024 * 1024)) * 60);
}

module.exports = { getAudioFiles, estimateAudioDuration, estimateAudioDurationFromSize };
