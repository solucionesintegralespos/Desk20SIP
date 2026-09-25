import templates from './templates.json';
import type { Template } from './model';
// Original checklist definitions imported from the SIP reference project.
export function createSeed(): {
    templates: Template[];
} { return { templates }; }
