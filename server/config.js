// 配置：从环境变量读取，缺关键项直接退出
const req = (k) => {
  const v = process.env[k];
  if (v === undefined || v === '') {
    console.error(`[config] 缺少必需环境变量 ${k}`);
    process.exit(1);
  }
  return v;
};

export const config = {
  port: Number(process.env.PORT || 8091),
  staticDir: process.env.STATIC_DIR || '/app/public',
  imgDir: process.env.IMG_DIR || '/app/data/img',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: req('DB_USER'),
    password: req('DB_PASSWORD'),
    database: process.env.DB_NAME || 'moti',
    charset: 'utf8mb4',
    connectionLimit: Number(process.env.DB_POOL || 10),
  },
  deepseek: {
    key: process.env.DEEPSEEK_API_KEY || '',
    base: (process.env.DEEPSEEK_BASE || 'https://api.deepseek.com/v1').replace(/\/+$/, ''),
    model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
    modelId: process.env.DEEPSEEK_MODEL_ID || 'deepseek-flash',
  },
  zai: {
    key: process.env.ZAI_API_KEY || '',
    base: (process.env.GLM_BASE || 'https://api.z.ai/api/paas/v4').replace(/\/+$/, ''),
    model: process.env.GLM_MODEL || 'glm-4-flash-250414',
    modelId: 'glm-flash',
  },
  tokenDays: 30,
  maxHistory: 8,
};
