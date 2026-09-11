import { cache } from 'react';
import { headers } from 'next/headers';
import { getViewer } from './access/viewer.js';
import { scanLibrary } from './content.js';

// React cache deduplicates layout/page work within a request, never across viewers.
export const requestViewer = cache(async () => getViewer({ headers: await headers() }));
export const requestLibrary = cache(async () => scanLibrary(await requestViewer()));