import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
export async function serviceUser() {
    const session = await getServerSession(authOptions);
    if (!session)
        throw new ServiceError('No autorizado', 401);
    const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true } });
    if (!user || user.role === 'CUSTOMER')
        throw new ServiceError('Acceso restringido al personal de soporte', 403);
    return user;
}
export class ServiceError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}
export function serviceError(error: unknown) { return Response.json({ error: error instanceof ServiceError ? error.message : 'No se pudo acceder a los procesos. Verifica la conexión y aplica el esquema con npm run prisma:push.' }, { status: error instanceof ServiceError ? error.status : 503 }); }
