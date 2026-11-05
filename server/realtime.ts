// Простой hub для Server-Sent Events: админка слушает канал "admin",
// клиентское приложение — "client:<id>", водитель — "driver:<id>".
import type { Response } from 'express';

interface Sub {
  res: Response;
  channel: string;
}
const subs = new Set<Sub>();

export function subscribe(res: Response, channel: string) {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: ready\ndata: {"channel":"${channel}"}\n\n`);
  const sub: Sub = { res, channel };
  subs.add(sub);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  res.on('close', () => {
    clearInterval(ping);
    subs.delete(sub);
  });
}

export function publish(channel: string, event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const s of subs) if (s.channel === channel) s.res.write(payload);
}

export const onlineCount = (prefix: string) => [...subs].filter((s) => s.channel.startsWith(prefix)).length;
