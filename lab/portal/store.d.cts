export type PilotActor = {id: string; name: string; admin: boolean; group: string};
export type PilotMember = {id: string; name: string; group: string};
export function validStudentId(value: unknown): string;
export function fundLookupIds(values: unknown): string[];
export function previousFundMembers(term: unknown): string[];
export function activeCode(id: string): string;
export function state(user: PilotActor, groupIds?: string[]): Record<string, unknown>;
export function applyAction(user: PilotActor, body: Record<string, unknown>, member?: PilotMember, directoryMembers?: PilotMember[]): Record<string, unknown>;
