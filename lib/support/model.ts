export type Role = 'admin' | 'tech' | 'sales';
export type Status = 'open' | 'in_progress' | 'closed';
export type Platform = string;
export interface PlatformDefinition {
    id: string;
    name: string;
    description: string;
    active: boolean;
    _revision?: number;
}
export type PermissionMap = Record<string, Record<string, boolean>>;
export interface ProfilePermissions {
    role: Role;
    permissions: PermissionMap;
    _revision: number;
}
export interface SettingsData {
    platforms: PlatformDefinition[];
    roles: ProfilePermissions[];
}
export interface User {
    id: string;
    name: string;
    email: string;
    role: Role;
    permissions?: PermissionMap;
    active?: boolean;
    _revision?: number;
}
export interface Client {
    id: string;
    name: string;
    businessName: string;
    email: string;
    phone: string;
    city: string;
}
export interface Ticket {
    id: string;
    number: string;
    clientId: string;
    techId: string | null;
    techIds?: string[];
    createdBy?: string | null;
    channel: 'whatsapp' | 'call';
    platform: Platform;
    subject: string;
    description: string;
    status: Status;
    priority: 'normal' | 'high' | 'urgent';
    createdAt: string;
    firstResponseAt?: string;
    resolvedAt?: string;
    closedAt?: string;
    closureHistory?: string[];
    resolution?: string;
}
export interface ChecklistItem {
    id: string;
    category: string;
    label: string;
    required: boolean;
    evidenceRequired: boolean;
    isBackup: boolean;
}
export interface Template {
    id: string;
    name: string;
    version: number;
    active: boolean;
    items: ChecklistItem[];
}
export interface Evidence {
    id: string;
    name: string;
    type: string;
    dataUrl: string;
}
export interface Response {
    item: ChecklistItem;
    checked: boolean;
    notes: string;
    evidence: Evidence[];
}
export interface ChecklistRun {
    id: string;
    number: string;
    clientId: string;
    techId: string;
    templateId: string;
    templateVersion: number;
    serviceName: string;
    status: 'in_progress' | 'completed';
    createdAt: string;
    completedAt?: string;
    responses: Response[];
}
export interface WorkOrder {
    id: string;
    createdById?: string;
    number: string;
    ticketId?: string;
    checklistId?: string;
    clientId: string;
    techId: string;
    serviceName: string;
    status: 'in_progress' | 'completed';
    startTime: string;
    endTime?: string;
    diagnosis: string;
    workDone: string;
    observations: string;
    signerName: string;
    signature?: string;
    signedAt?: string;
    consent: boolean;
}
export interface AuditEvent {
    id: string;
    at: string;
    actorId: string;
    entityId: string;
    action: string;
}
export interface State {
    platforms: PlatformDefinition[];
    users: User[];
    clients: Client[];
    tickets: Ticket[];
    templates: Template[];
    checklists: ChecklistRun[];
    orders: WorkOrder[];
    events: AuditEvent[];
}
export const statuses: Record<Status, string> = { open: 'Abierto', in_progress: 'En proceso', closed: 'Cerrado' };
export const platforms: Record<Platform, string> = { aldelo: 'Aldelo POS', cizaro: 'Cizaro POS', dian: 'Facturación DIAN', other: 'Hardware / Otros' };
export const roleLabels: Record<Role, string> = { admin: 'Administrador', tech: 'Soporte', sales: 'Ventas' };
export interface UserDraft extends User {
    password: string;
    active: boolean;
}
