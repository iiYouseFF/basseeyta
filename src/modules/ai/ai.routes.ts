import { Router } from 'express';
import { z } from 'zod';
import { sendSuccess, sendError } from '../../utils/response';
import { authMiddleware } from '../../middleware/auth';
import { aiRateLimit } from '../../middleware/rateLimit';
import { env } from '../../config/env';

const router = Router();

router.post('/assistant', authMiddleware, aiRateLimit, async (req, res) => {
  const schema = z.object({
    query: z.string().min(1),
    userContext: z.object({
      governorate: z.string().optional(),
      serviceHistory: z.array(z.string()).optional(),
    }).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'query required', parsed.error.errors);

  const governorate = parsed.data.userContext?.governorate || 'القاهرة';
  const systemPrompt = `You are a home maintenance assistant for Basita in Egypt. Help diagnose issues, estimate costs in EGP, cover services: electrical, plumbing, painting, carpentry, AC maintenance. User governorate: ${governorate}. Respond in Arabic (Egyptian dialect) when user writes Arabic, otherwise English.`;

  // If no OpenAI key, return mock
  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY === '...' || env.OPENAI_API_KEY.length < 10) {
    const mockReply = `أهلاً بك! في ${governorate}، مشكلتك "${parsed.data.query}" قد تكلف تقريباً 300-600 ج.م حسب الخدمة (سباكة، كهرباء، نقاشة، نجارة، تكييف). أنصحك بإنشاء طلب خدمة ليتواصل معك فني مختص. هل تريد إنشاء طلب الآن؟`;
    return sendSuccess(res, { reply: mockReply, mock: true });
  }

  try {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: parsed.data.query },
      ],
      max_tokens: 500,
      temperature: 0.7,
    });
    const reply = completion.choices[0]?.message?.content || 'No response';
    return sendSuccess(res, { reply, mock: false });
  } catch (e: any) {
    console.warn('[ai] OpenAI failed', e.message);
    // Fallback mock
    const mockReply = `أهلاً بك! في ${governorate}، مشكلتك "${parsed.data.query}" قد تكلف تقريباً 300-600 ج.م. (AI fallback)`;
    return sendSuccess(res, { reply: mockReply, mock: true, error: e.message });
  }
});

export default router;
