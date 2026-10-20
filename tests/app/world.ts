import type { World } from '../../pipeline/emit';
import { runPipeline } from '../../pipeline/run';

/** The mini fixture world as the app receives it. */
export const miniWorld = (): World => JSON.parse(JSON.stringify(runPipeline('fixtures/mini', null, '2026-10-20T00:00:00.000Z').world));
