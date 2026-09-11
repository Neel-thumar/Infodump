import { getViewer } from '../../../lib/access/viewer.js';
import { searchLibrary } from '../../../lib/content.js';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) {
  const viewer = await getViewer(request), query = new URL(request.url).searchParams.get('q') || '';
  return Response.json(await searchLibrary(viewer, query), { headers: { 'Cache-Control': 'private, no-store' } });
}