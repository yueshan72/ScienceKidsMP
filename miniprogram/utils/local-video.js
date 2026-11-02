/* utils/local-video.js —— 把代码包内的视频转换成 video 组件可播放的地址
 *
 * 背景（2026-11-02 实测）：
 *   1. 抖音 video 组件的 src 只接受 https:// / ttfile:// / file:// 开头；
 *      代码包路径（/assets/videos/x.mp4）会报「视频加载失败」。
 *   2. 不能用 FileSystemManager.copyFileSync 复制视频：
 *      抖音开发者工具会把二进制按 UTF-8 文本复制，mp4 尾部被替换成
 *      EF BF BD（替换字符），文件变大且 moov 损坏，播放器报
 *      DEMUXER_ERROR_COULD_NOT_OPEN。
 *      → 改用 readFileSync(base64) + writeFileSync(base64) 中转，字节不变。
 *
 * 做法：
 *   1. 首次播放某个视频时，把它从代码包复制到用户目录（ttfile://user，上限 10MB）；
 *   2. 复制后用文件大小校验，大小不一致就视为失败；
 *   3. 之后直接用用户目录里的 ttfile:// 路径播放；
 *   4. 复制失败时退回原路径（至少不白屏，真机上可能仍可播）。
 *
 * 注意：替换视频内容后，把 VIDEO_VERSION 加 1，避免继续用到旧缓存文件。
 */
'use strict';

const VIDEO_VERSION = '2';

function fileSize(fs, filePath) {
  try {
    const st = fs.statSync(filePath);
    return (st && typeof st.size === 'number') ? st.size : -1;
  } catch (e) {
    return -1;
  }
}

/** base64 解码后的字节数（不依赖 stat，包内路径也能算） */
function base64ByteLength(b64) {
  if (!b64 || !b64.length) return 0;
  let padding = 0;
  if (b64.charAt(b64.length - 1) === '=') padding++;
  if (b64.charAt(b64.length - 2) === '=') padding++;
  return Math.floor(b64.length * 3 / 4) - padding;
}

function toPlayableUrl(packagePath) {
  if (!packagePath || packagePath.indexOf('/assets/') !== 0) return packagePath;

  if (typeof tt === 'undefined'
      || typeof tt.getFileSystemManager !== 'function'
      || !tt.env || !tt.env.USER_DATA_PATH) {
    return packagePath;
  }

  const fs = tt.getFileSystemManager();
  const fileName = packagePath.split('/').pop(); // rocket.mp4
  const srcPath = packagePath.replace(/^\//, ''); // assets/videos/rocket.mp4
  const destPath = tt.env.USER_DATA_PATH + '/video-v' + VIDEO_VERSION + '-' + fileName;

  const srcSize = fileSize(fs, srcPath);
  const destSize = fileSize(fs, destPath);

  /* 已经复制过，且大小与包内文件一致 → 直接用 */
  if (destSize > 0 && (srcSize < 0 || destSize === srcSize)) {
    return destPath;
  }

  try {
    /* 用 base64 中转，绕开 copyFileSync 的二进制损坏问题 */
    const base64 = fs.readFileSync(srcPath, 'base64');
    fs.writeFileSync(destPath, base64, 'base64');

    const expectedSize = base64ByteLength(base64);
    const newSize = fileSize(fs, destPath);
    if (newSize >= 0 && newSize !== expectedSize) {
      throw new Error('复制后大小不一致：' + newSize + ' != ' + expectedSize);
    }
    return destPath;
  } catch (e) {
    console.warn('[local-video] 视频复制到用户目录失败，退回代码包路径', e);
    return packagePath;
  }
}

module.exports = {
  toPlayableUrl: toPlayableUrl
};
