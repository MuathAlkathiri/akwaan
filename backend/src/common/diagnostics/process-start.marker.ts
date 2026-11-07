/**
 * Imported first by `main.ts`, so its single line is written before the rest
 * of the application modules are loaded. If a deploy shows this line and
 * nothing after it, startup stalled while loading modules, before Nest began.
 * Only `main.ts` imports this file.
 */
import { markProcessStart } from './startup-diagnostics';

markProcessStart();
