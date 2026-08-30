import { Router } from 'express';
import { sendSuccess } from '../../utils/response';
import { store, genId, nowIso } from '../../utils/store';
import { getPool } from '../../config/supabase';

const router = Router();

// GET /search?q=سباكة&entityType=technician&governorate=القاهرة&limit=20
router.get('/', async (req, res) => {
  const q = (req.query.q as string) || '';
  const entityType = req.query.entityType as string | undefined;
  const governorate = req.query.governorate as string | undefined;
  const limit = parseInt((req.query.limit as string) || '20', 10);

  if (!q) return sendSuccess(res, []);

  // Try real pg search if available
  const pool = getPool();
  if (pool) {
    try {
      const result = await pool.query(
        `SELECT entity_type, entity_id, title, description, governorate, specialty,
                ts_rank(search_vector, plainto_tsquery('simple', $1)) AS rank
         FROM search_index
         WHERE search_vector @@ plainto_tsquery('simple', $1)
           AND ($2::text IS NULL OR entity_type = $2)
           AND ($3::text IS NULL OR governorate = $3)
         ORDER BY rank DESC
         LIMIT $4`,
        [q, entityType || null, governorate || null, limit]
      );
      return sendSuccess(res, result.rows);
    } catch (e: any) {
      console.warn('[search] pg failed, fallback to memory', e.message);
    }
  }

  // In-memory fallback: simple substring rank
  let results = Array.from(store.searchIndex.values());
  if (entityType) results = results.filter((r) => r.entity_type === entityType);
  if (governorate) results = results.filter((r) => r.governorate === governorate);

  const qLower = q.toLowerCase();
  results = results
    .map((r) => {
      const title = (r.title || '').toLowerCase();
      const desc = (r.description || '').toLowerCase();
      const specialty = (r.specialty || '').toLowerCase();
      let rank = 0;
      if (title.includes(qLower)) rank += 2;
      if (desc.includes(qLower)) rank += 1;
      if (specialty.includes(qLower)) rank += 1.5;
      // Simple token overlap
      const qTokens = qLower.split(/\s+/);
      for (const tok of qTokens) {
        if (title.includes(tok)) rank += 0.5;
        if (desc.includes(tok)) rank += 0.3;
      }
      return { ...r, rank };
    })
    .filter((r) => r.rank > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit);

  // Also search technicians directly if entityType is technician and not in search_index
  if (!entityType || entityType === 'technician') {
    const techResults = Array.from(store.technicians.values())
      .filter((t) => {
        if (governorate && t.governorate !== governorate) return false;
        const haystack = `${t.fullName} ${t.specialty} ${t.governorate} ${t.area}`.toLowerCase();
        return haystack.includes(qLower);
      })
      .map((t) => ({
        entity_type: 'technician',
        entity_id: t.phone,
        title: t.fullName,
        description: t.specialty,
        governorate: t.governorate,
        specialty: t.specialty,
        rank: 1,
      }));
    // Merge and dedupe
    const seen = new Set(results.map((r) => `${r.entity_type}:${r.entity_id}`));
    for (const tr of techResults) {
      if (!seen.has(`${tr.entity_type}:${tr.entity_id}`)) results.push(tr);
    }
    results.sort((a, b) => b.rank - a.rank);
    results = results.slice(0, limit);
  }

  return sendSuccess(res, results);
});

// POST /search/index upsert
router.post('/index', async (req, res) => {
  const { entityType, entityId, title, description, governorate, specialty } = req.body;
  if (!entityType || !entityId || !title) {
    return res.status(400).json({ success: false, message: 'entityType, entityId, title required' });
  }
  const key = `${entityType}:${entityId}`;
  const now = nowIso();
  const doc = {
    id: genId(),
    entity_type: entityType,
    entity_id: entityId,
    title,
    description: description || '',
    governorate: governorate || '',
    specialty: specialty || '',
    created_at: now,
  };
  store.searchIndex.set(key, doc);

  const pool = getPool();
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO search_index (entity_type, entity_id, title, description, governorate, specialty)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (entity_type, entity_id) DO UPDATE SET title=$3, description=$4, governorate=$5, specialty=$6`,
        [entityType, entityId, title, description || '', governorate || '', specialty || '']
      );
    } catch {}
  }

  return res.status(201).json({ success: true, data: doc });
});

// DELETE /search/index/:entityType/:entityId
router.delete('/index/:entityType/:entityId', async (req, res) => {
  const key = `${req.params.entityType}:${req.params.entityId}`;
  store.searchIndex.delete(key);
  const pool = getPool();
  if (pool) {
    try {
      await pool.query(`DELETE FROM search_index WHERE entity_type=$1 AND entity_id=$2`, [req.params.entityType, req.params.entityId]);
    } catch {}
  }
  return res.json({ success: true, data: { deleted: true } });
});

export default router;
