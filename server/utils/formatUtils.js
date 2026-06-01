/**
 * 格式化工具
 */
function formatSizeKB(bytes) { return (bytes / 1024).toFixed(1) + 'KB'; }
function formatSizeMB(bytes) { return (bytes / 1024 / 1024).toFixed(2) + 'MB'; }

module.exports = { formatSizeKB, formatSizeMB };
