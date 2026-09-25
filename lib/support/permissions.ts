import type { User } from './model';
export function can(user: User, resource: string, _action = 'read') { return user.role === 'admin' || (user.role === 'tech' && resource !== 'templates'); }
