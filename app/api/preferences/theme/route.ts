import { getDashboardUser } from '@/lib/dashboard-data';
import { prisma } from '@/lib/prisma';

export async function PUT(request: Request) {
  const user = await getDashboardUser();
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'Solicitud inválida' }, { status: 400 }); }
  if (body?.theme !== 'light' && body?.theme !== 'dark') return Response.json({ error: 'Tema inválido' }, { status: 400 });
  try {
    await prisma.setting.upsert({ where: { key: `user:${user.id}:theme` }, create: { key: `user:${user.id}:theme`, value: body.theme }, update: { value: body.theme } });
    return Response.json({ theme: body.theme });
  } catch { return Response.json({ error: 'No se pudo guardar el tema' }, { status: 503 }); }
}
