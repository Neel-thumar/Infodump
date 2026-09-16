import { notFound, redirect } from 'next/navigation';
import { Catalog } from '../../../components/Catalog.js';
import Reader from '../../../components/Reader.js';
import { requestLibrary, requestViewer } from '../../../lib/request.js';
import { publicLibrary, loadVolume, loadFullVolume } from '../../../lib/content.js';
import { FULL_VOLUME_PARAM, wantsFullVolume } from '../../../lib/reading-mode.js';

export default async function ContentPage({ params, searchParams }) {
  const { segments } = await params;
  const query = await searchParams;
  if (!segments.length || segments.length > 4) notFound();
  const viewer = await requestViewer(), library = await requestLibrary(), exposed = publicLibrary(library);
  const category = library.categories.find(c => c.slug === segments[0]);
  const publicCategory = exposed.categories.find(c => c.slug === segments[0]);
  if (!category) notFound();
  if (segments.length === 1) return <Catalog library={exposed} categorySlug={category.slug} />;
  const course = category.courses.find(c => c.slug === segments[1]);
  const publicCourse = publicCategory.courses.find(c => c.slug === segments[1]);
  if (!course) notFound();
  const volume = course.volumes.find(v => v.slug === segments[2]);
  if (segments.length >= 3 && !volume) notFound();
  if (segments.length === 4 && !volume.chapters.some(ch => ch.slug === segments[3])) notFound();
  // Continuous mode is the one way a chaptered volume renders at its own URL instead of
  // handing the reader to chapter one.
  const full = segments.length === 3 && !!volume?.chapters.length && wantsFullVolume(query?.[FULL_VOLUME_PARAM]);
  if (segments.length === 3 && volume?.chapters.length && !full) redirect(volume.chapters[0].url);
  const rendered = !volume ? null : full ? await loadFullVolume(viewer, course, volume) : await loadVolume(viewer, course, volume, segments[3]);
  return <Reader key={`${segments.join('/')}${full ? '?full' : ''}`} category={{ ...publicCategory, courses: undefined }} course={publicCourse} volume={publicCourse.volumes.find(v => v.slug === segments[2]) || null} rendered={rendered} />;
}