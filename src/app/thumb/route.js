import { getViewer } from '../../lib/access/viewer.js';
import { serveThumbnail } from '../../lib/content.js';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export async function GET(request) { return serveThumbnail(await getViewer(request), new URL(request.url).searchParams.get('node')); }