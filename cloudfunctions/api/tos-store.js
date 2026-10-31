/* cloudfunctions/api/tos-store.js —— 用抖音云对象存储（TOS）当 JSON 文档库
 *
 * 为什么不用文档型数据库：
 *   文档型数据库需要「体验权限」审批，本项目等了 9 天仍未通过；
 *   对象存储属于抖音云组件中心，点「启用」即可用，不需要审批。
 *
 * 设计：
 *   每个用户 3 个 JSON 对象（而不是 3 张表）：
 *     {prefix}/{openid}/user.json      年龄、创建时间
 *     {prefix}/{openid}/progress.json  关卡进度 + 徽章
 *     {prefix}/{openid}/checkins.json  打卡日期
 *   一次 action 只读写其中 1~3 个对象；V1.0 单用户演示没有并发写压力。
 *   对象同名覆盖写，天然满足「保存」语义。
 *
 * 安全：
 *   - 桶保持「私有读」；AK/SK 只放在云函数环境变量里，绝不下发客户端、不进仓库。
 *   - 对象 key 只由服务端根据 openid 拼出，客户端不能指定路径。
 *
 * 依赖环境变量（在抖音云「服务设置」里配置）：
 *   TOS_BUCKET / TOS_ACCESS_KEY_ID / TOS_ACCESS_KEY_SECRET
 *   TOS_REGION（默认 cn-beijing）
 *   TOS_ENDPOINT（默认 tos-cn-beijing.volces.com；只填主机名，可带协议但会被去掉；
 *                 同地域可换内网 Endpoint，如 tos-cn-beijing.ivolces.com）
 *   TOS_PREFIX（可选，默认 sciencekids）
 */
'use strict';

const TYPES = ['user', 'progress', 'checkins'];

let cachedClient = null;
let clientFactory = createClient;

function env(name) {
  return process.env[name] || '';
}

function readConfig() {
  const bucket = env('TOS_BUCKET');
  const accessKeyId = env('TOS_ACCESS_KEY_ID') || env('TOS_ACCESS_KEY');
  const accessKeySecret = env('TOS_ACCESS_KEY_SECRET') || env('TOS_SECRET_KEY');
  if (!bucket || !accessKeyId || !accessKeySecret) {
    throw new Error('TOS 配置缺失：需要 TOS_BUCKET / TOS_ACCESS_KEY_ID / TOS_ACCESS_KEY_SECRET');
  }

  /* ⚠️ TOS SDK 的 endpoint 只接受主机名，不能带协议：
   *   SDK 内部会拼 https://{bucket}.{endpoint}/...
   *   传 https://tos-cn-beijing.volces.com 会变成 https://bucket.https://... → ENOTFOUND。
   *   这里统一去掉协议和末尾斜杠，并保留是否 https 的信息。 */
  let endpoint = env('TOS_ENDPOINT') || 'tos-cn-beijing.volces.com';
  const secure = !/^http:\/\//i.test(endpoint);
  endpoint = endpoint.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  return {
    bucket: bucket,
    accessKeyId: accessKeyId,
    accessKeySecret: accessKeySecret,
    region: env('TOS_REGION') || 'cn-beijing',
    endpoint: endpoint,
    secure: secure
  };
}

/** 懒加载 SDK：没装依赖时 require 本文件也不会炸（方便测试与本地阅读） */
function createClient(cfg) {
  const sdk = require('@volcengine/tos-sdk');
  const TosClient = sdk.TosClient || sdk.TOS;
  if (typeof TosClient !== 'function') {
    throw new Error('@volcengine/tos-sdk 版本不兼容：找不到 TosClient');
  }
  return new TosClient({
    accessKeyId: cfg.accessKeyId,
    accessKeySecret: cfg.accessKeySecret,
    region: cfg.region,
    endpoint: cfg.endpoint,
    secure: cfg.secure
  });
}

function getClient() {
  if (!cachedClient) cachedClient = clientFactory(readConfig());
  return cachedClient;
}

function bucket() {
  return readConfig().bucket;
}

function prefix() {
  return env('TOS_PREFIX') || 'sciencekids';
}

/** openid 直接进 key 之前做一次收敛，避免路径穿越；抖音 openid 本身是 URL 安全字符 */
function safeOpenid(openid) {
  return String(openid || '').replace(/[^A-Za-z0-9_-]/g, '_');
}

function keyOf(openid, type) {
  if (TYPES.indexOf(type) === -1) throw new Error('未知文档类型：' + type);
  const id = safeOpenid(openid);
  if (!id) throw new Error('openid 为空');
  return prefix() + '/' + id + '/' + type + '.json';
}

/** 把 TOS 返回的 content（流 / Buffer / 字符串）统一读成 Buffer */
async function toBuffer(content) {
  if (!content) return Buffer.from([]);
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === 'string') return Buffer.from(content, 'utf8');

  const chunks = [];
  for await (const chunk of content) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJson(key) {
  const client = getClient();
  let content;

  if (typeof client.getObjectV2 === 'function') {
    const res = await client.getObjectV2({ bucket: bucket(), key: key });
    content = res && res.data && res.data.content;
    /* 兼容部分版本：data 本身就是流/Buffer */
    if (content === undefined && res && res.data) content = res.data;
  } else {
    /* 旧版 SDK 兜底：getObject 的 data 可能是 Buffer，也可能是带 content 的对象 */
    const res = await client.getObject({ bucket: bucket(), key: key });
    const data = res && res.data;
    content = data && data.content !== undefined ? data.content : data;
  }

  const buf = await toBuffer(content);
  if (!buf.length) return null;
  return JSON.parse(buf.toString('utf8'));
}

function isNotFound(e) {
  if (!e) return false;
  if (e.statusCode === 404 || e.status === 404) return true;
  if (e.code === 'NoSuchKey' || e.errorCode === 'NoSuchKey') return true;
  return /NoSuchKey|not found|not exist|不存在/i.test(String(e.message || e));
}

/** 读取一个文档；不存在返回 null */
async function get(openid, type) {
  try {
    return await readJson(keyOf(openid, type));
  } catch (e) {
    if (isNotFound(e)) return null;
    throw e;
  }
}

/** 覆盖写一个文档 */
async function put(openid, type, doc) {
  await getClient().putObject({
    bucket: bucket(),
    key: keyOf(openid, type),
    body: Buffer.from(JSON.stringify(doc), 'utf8')
  });
}

/** 删除该用户全部三个文档；缺失视为已删除 */
async function removeAll(openid) {
  for (const type of TYPES) {
    try {
      await getClient().deleteObject({ bucket: bucket(), key: keyOf(openid, type) });
    } catch (e) {
      if (!isNotFound(e)) throw e;
    }
  }
}

module.exports = {
  get: get,
  put: put,
  removeAll: removeAll,
  /* 测试注入：传入 (cfg) => fakeClient，并把缓存清掉 */
  _setClientFactory: function (fn) {
    clientFactory = fn || createClient;
    cachedClient = null;
  },
  _keyOf: keyOf,
  _readConfig: readConfig,
  _isNotFound: isNotFound
};
