// Continuous reading is a view mode on the volume resource, not a resource of its own, so it
// travels as a query parameter. A path segment would risk colliding with a chapter slug.
export const FULL_VOLUME_PARAM = 'read';
export const FULL_VOLUME_VALUE = 'full';

export const fullVolumeUrl = url => `${url}?${FULL_VOLUME_PARAM}=${FULL_VOLUME_VALUE}`;

// searchParams hands back a string, an array when repeated, or nothing at all.
export const wantsFullVolume = value => (Array.isArray(value) ? value[0] : value) === FULL_VOLUME_VALUE;

// Section anchors are prefixed so they cannot collide with a generated heading id.
export const chapterAnchor = chapter => `ch-${chapter.slug}`;
