import { getViewer } from '../../../lib/access/viewer.js';
import { scanLibrary, publicLibrary } from '../../../lib/content.js';
import { coursePlan } from '../../../lib/offline/plan.js';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  const viewer = await getViewer(request), courseId = new URL(request.url).searchParams.get('course') || '';
  // A course the policy withheld never reaches the public library, so it reads as unknown.
  const plan = coursePlan(publicLibrary(await scanLibrary(viewer)), courseId);
  if (!plan) return Response.json({ error: 'Unknown course' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  return Response.json(plan, { headers: { 'Cache-Control': 'private, no-store' } });
}
