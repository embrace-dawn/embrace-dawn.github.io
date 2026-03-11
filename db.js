const mysql = require('mysql2/promise');

// 数据库配置（根据自己的MySQL信息修改）
const dbConfig = {
  host: 'localhost',
  user: 'root', // 你的MySQL用户名
  password: '113ljh2383639136', // 你的MySQL密码
  database: 'shiyu_db',
  charset: 'utf8mb4'
};

// 创建数据库连接池
const pool = mysql.createPool(dbConfig);

// 测试连接
async function testDbConnection() {
  try {
    const connection = await pool.getConnection();
    console.log('数据库连接成功 ✅');
    connection.release();
  } catch (err) {
    console.error('数据库连接失败 ❌', err.message);
    process.exit(1); // 连接失败退出进程
  }
}

testDbConnection();

module.exports = pool;