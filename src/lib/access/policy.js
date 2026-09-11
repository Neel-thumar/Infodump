import path from 'node:path';
import { pathToFileURL } from 'node:url';
import config from '../../../access.config.js';
import demo from './demo.js';
import { onAccessDecision } from './audit.js';

export const ALLOW = Object.freeze({ effect: 'allow' });
const DENY = Object.freeze({ effect: 'deny', reason: 'Policy error', ui: 'locked' });
let customModule;
function intersect(previous, next) {
  if (next.effect === 'deny' || previous.effect === 'allow') return next;
  if (next.effect === 'allow') return previous;
  return { ...next, limits: [...(previous.limits || [previous.limit]), ...(next.limits || [next.limit])] };
}

async function decide(viewer, action, resource, context) {
  const mode = process.env.ACCESS_MODE || config.mode;
  if (mode !== 'policy') return ALLOW;
  const name = process.env.ACCESS_POLICY || config.policyModule;
  if (!name) return ALLOW;
  try {
    const fn = name === 'demo' ? demo : (await (customModule ||= import(/* webpackIgnore: true */ pathToFileURL(path.resolve(name)).href))).default;
    const decision = await fn(viewer, action, resource, context);
    return ['allow', 'deny', 'partial'].includes(decision?.effect) ? decision : DENY;
  } catch (error) {
    console.error('[access] Policy failed:', error.message);
    return DENY;
  }
}

export async function can(viewer, action, resource, context = {}) {
  // Cascade is centralized here, including direct deep links, search and images.
  let decision = ALLOW;
  for (const ancestor of context.ancestors || []) {
    for (const parentAction of new Set(['list', action])) {
      const parent = await decide(viewer, parentAction, ancestor, context);
      if (parent.effect === 'deny') { decision = parent; break; }
      if (parent.effect === 'partial') decision = intersect(decision, parent);
    }
    if (decision.effect === 'deny') break;
  }
  if (decision.effect !== 'deny') {
    const own = await decide(viewer, action, resource, context);
    decision = intersect(decision, own);
  }
  try { onAccessDecision(viewer, action, resource, decision); } catch { /* Audit must not break reading. */ }
  return decision;
}