/**
 * 文件清理工具
 */
const fs = require('fs');

function cleanupAudioFiles(originalPath, audioFiles) {
    try {
        if (originalPath && fs.existsSync(originalPath)) {
            fs.unlinkSync(originalPath);
            console.log(`🗑️ 清理音频: ${originalPath}`);
        }
    } catch (e) {
        console.warn('清理失败:', e.message);
    }
}

module.exports = { cleanupAudioFiles };
