const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { body, validationResult } = require('express-validator');
const svgCaptcha = require('svg-captcha');
const pool = require('./config/db');
const crypto = require('crypto');

const app = express();
const PORT = 3001;

// 中间件
app.use(cors()); // 解决跨域
app.use(bodyParser.json()); // 解析JSON请求体
app.use(bodyParser.urlencoded({ extended: true })); // 解析表单请求体

// 存储验证码（生产环境建议用Redis，这里临时用内存）
const captchaStore = new Map();
// 存储管理员 token（生产环境建议用 Redis，这里用内存 Map）
const adminTokenStore = new Map();

// 验证管理员 token 的中间件
function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.send({ code: 401, message: '未提供管理员凭证' });
  }
  const token = authHeader.split(' ')[1];
  const tokenInfo = adminTokenStore.get(token);
  if (!tokenInfo || tokenInfo.expire < Date.now()) {
    adminTokenStore.delete(token); // 删除过期 token
    return res.send({ code: 401, message: '登录已过期，请重新登录' });
  }
  // token 有效，继续执行后续路由
  next();
}

// 1. 生成验证码接口
app.get('/api/captcha', (req, res) => {
  // 生成验证码
  const captcha = svgCaptcha.create({
    size: 4, // 验证码长度
    ignoreChars: '0o1il', // 忽略易混淆字符
    noise: 2, // 干扰线数量
    color: true, // 彩色验证码
    width: 100,
    height: 45
  });

  // 管理员登录接口
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  // 这里写死管理员账号，你可以根据需要修改（例如从数据库读取）
  if (username === 'admin' && password === 'admin123') {
    // 生成随机 token（16字节的十六进制字符串）
    const token = crypto.randomBytes(16).toString('hex');
    // 存储 token，有效期 1 小时
    adminTokenStore.set(token, {
      admin: true,
      expire: Date.now() + 60 * 60 * 1000 // 1小时后过期
    });
    // 清理过期 token（可选）
    for (const [key, value] of adminTokenStore.entries()) {
      if (value.expire < Date.now()) adminTokenStore.delete(key);
    }
    return res.send({ code: 200, message: '登录成功', data: { token } });
  }
  res.send({ code: 400, message: '用户名或密码错误' });
});



  // 生成唯一ID（前端用这个ID验证）
  const captchaId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  // 存储验证码（有效期5分钟）
  captchaStore.set(captchaId, {
    text: captcha.text.toLowerCase(),
    expire: Date.now() + 5 * 60 * 1000
  });

  // 返回验证码图片和ID
  res.send({
    code: 200,
    data: {
      captchaId,
      captchaSvg: captcha.data // SVG格式的验证码图片
    },
    message: '验证码生成成功'
  });

  // 清理过期验证码
  for (const [key, value] of captchaStore.entries()) {
    if (value.expire < Date.now()) {
      captchaStore.delete(key);
    }
  }
});

// 2. 提交留言接口
app.post('/api/message', [
  // 参数校验
  body('username').notEmpty().withMessage('昵称不能为空'),
  body('email').isEmail().withMessage('邮箱格式不正确'),
  body('subject').notEmpty().withMessage('留言主题不能为空'),
  body('content').notEmpty().withMessage('留言内容不能为空'),
  body('captchaId').notEmpty().withMessage('验证码ID不能为空'),
  body('captchaCode').notEmpty().withMessage('验证码不能为空')
], async (req, res) => {
  // 校验参数
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.send({
      code: 400,
      message: '参数错误',
      errors: errors.array()
    });
  }

  const { username, email, subject, content, captchaId, captchaCode } = req.body;

  // 验证验证码
  const captchaInfo = captchaStore.get(captchaId);
  if (!captchaInfo) {
    return res.send({
      code: 400,
      message: '验证码已过期，请刷新重试'
    });
  }

  if (captchaCode.toLowerCase() !== captchaInfo.text) {
    return res.send({
      code: 400,
      message: '验证码错误'
    });
  }

  try {
    // 插入留言到数据库
    const [result] = await pool.execute(
      'INSERT INTO messages (username, email, subject, content) VALUES (?, ?, ?, ?)',
      [username, email, subject, content]
    );

    // 删除已使用的验证码
    captchaStore.delete(captchaId);

    res.send({
      code: 200,
      message: '留言提交成功',
      data: {
        messageId: result.insertId
      }
    });
  } catch (err) {
    console.error('提交留言失败', err);
    res.send({
      code: 500,
      message: '服务器内部错误'
    });
  }
});

// 3. 获取留言列表接口
app.get('/api/messages', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT id, username, email, subject, content, create_time, reply_content, reply_time FROM messages ORDER BY create_time DESC'
    );

    res.send({
      code: 200,
      data: rows,
      message: '获取留言列表成功'
    });
  } catch (err) {
    console.error('获取留言列表失败', err);
    res.send({
      code: 500,
      message: '服务器内部错误'
    });
  }
});

// 管理员退出接口（需要 token）
app.post('/api/admin/logout', verifyAdminToken, (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.send({ code: 401, message: '未提供管理员凭证' });
  }
  const token = authHeader.split(' ')[1];
  adminTokenStore.delete(token); // 从存储中删除 token
  res.send({ code: 200, message: '退出成功' });
});

// 4. 回复留言接口（管理员用，优化版）
app.post('/api/message/reply',verifyAdminToken, async (req, res) => {
  const { messageId, replyContent } = req.body;

  // 1. 基础参数校验
  if (!messageId || !replyContent) {
    return res.send({
      code: 400,
      message: '留言ID和回复内容不能为空'
    });
  }

  try {
    // 2. 先查询留言是否存在
    const [rows] = await pool.execute(
      'SELECT id FROM messages WHERE id = ?',
      [messageId]
    );

    if (rows.length === 0) {
      return res.send({
        code: 400,
        message: '留言ID不存在，请检查ID是否正确'
      });
    }

    // 3. 存在则更新回复内容
    await pool.execute(
      'UPDATE messages SET reply_content = ?, reply_time = CURRENT_TIMESTAMP WHERE id = ?',
      [replyContent, messageId]
    );

    res.send({
      code: 200,
      message: '回复成功'
    });
  } catch (err) {
    console.error('回复留言失败', err);
    res.send({
      code: 500,
      message: '服务器内部错误'
    });
  }
});

// 启动服务
app.listen(PORT, () => {
  console.log(`后端服务运行在：http://localhost:${PORT}`);
});