// 事务包装
import { pool } from './pool.js';

export async function withTx(fn) {
  const con = await pool.getConnection();
  try {
    await con.beginTransaction();
    const result = await fn(con);
    await con.commit();
    return result;
  } catch (e) {
    try { await con.rollback(); } catch {}
    throw e;
  } finally {
    con.release();
  }
}
