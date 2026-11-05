import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { get } from './db.js';
import { HttpError, requireAdmin } from './http.js';
import authRoutes from './routes/auth.js';
import chatRoutes from './routes/chat.js';
import clientRoutes from './routes/client.js';
import crmRoutes from './routes/crm.js';
import opsRoutes from './routes/ops.js';
import publicRoutes from './routes/public.js';
import { seedDatabase } from './seed.js';
import { startSimulation } from './sim.js';

if (!get('SELECT id FROM users LIMIT 1')) {
  seedDatabase(false);
  console.log('✓ База пустая — загружены демо-данные');
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use((req, res, next) => {
  // CORS для мобильного приложения клиента и внешних интеграций
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/client', clientRoutes);
app.use('/api', requireAdmin, opsRoutes, crmRoutes, chatRoutes);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Не найдено' }));

// Продакшен: отдаём собранную админку
const dist = path.resolve(process.cwd(), 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Внутренняя ошибка сервера' : err.message });
});

startSimulation();
const PORT = Number(process.env.PORT) || 3001;
app.listen(PORT, () => console.log(`🚚 Cargo API: http://localhost:${PORT}`));
