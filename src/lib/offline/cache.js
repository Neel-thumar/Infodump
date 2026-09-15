// Cache names shared by the page and the service worker. The worker is a classic script in
// public/ and cannot import this module, so it repeats these literals; tests/offline.test.js
// asserts the two stay in step.
export const COURSE_PREFIX = 'id-course-';
export const META = '/__offline/meta';
export const courseCache = courseId => COURSE_PREFIX + courseId;

// How many pages to fetch at once. Every page is a dynamic render of the whole library, so
// the server is the bottleneck: more workers buy no throughput and only starve the reader's
// own clicks while a download runs.
export const CONCURRENCY = 2;
