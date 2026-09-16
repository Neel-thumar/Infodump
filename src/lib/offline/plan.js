// What a course needs to be readable with the network off. Works from an already-scanned
// public library, so the access policy has run and denied nodes are simply absent.
import { fullVolumeUrl } from '../reading-mode.js';

export const PLAN_VERSION = 2;

export function findCourse(library, courseId) {
  for (const category of library.categories) {
    const course = category.courses?.find(c => c.id === courseId);
    if (course) return { category, course };
  }
  return null;
}

export function coursePlan(library, courseId) {
  const found = findCourse(library, courseId);
  if (!found) return null;
  const { category, course } = found;
  const pages = [category.url, course.url];
  const thumbnails = [category.thumbnail, course.thumbnail];
  for (const volume of course.volumes) {
    if (volume.decision?.effect === 'deny') continue;
    // A volume that has chapters redirects to the first one. Caching a redirect and
    // replaying it for a navigation is a TypeError, so cache the destinations instead.
    if (volume.chapters?.length) {
      pages.push(...volume.chapters.map(chapter => chapter.url));
      // Continuous reading is a separate render at the volume URL, so it needs its own copy.
      pages.push(fullVolumeUrl(volume.url));
    } else pages.push(volume.url);
    thumbnails.push(volume.thumbnail);
  }
  // Remote and placeholder thumbnails are either opaque or inline; neither needs caching.
  const images = thumbnails.filter(t => t?.url?.startsWith('/thumb')).map(t => t.url);
  return {
    version: PLAN_VERSION, courseId: course.id, title: course.title, url: course.url,
    pages: [...new Set(pages)], images: [...new Set(images)],
  };
}
