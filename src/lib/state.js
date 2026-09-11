export const statePrefix = viewerId => `cp:v1:${encodeURIComponent(viewerId)}:`;
export const progressKey = (viewerId, courseId, volumeId) => `${statePrefix(viewerId)}progress:${encodeURIComponent(courseId)}:${encodeURIComponent(volumeId)}`;
export const positionKey = (viewerId, courseId, volumeId) => `${statePrefix(viewerId)}position:${encodeURIComponent(courseId)}:${encodeURIComponent(volumeId)}`;
export function autoComplete(previous) {
  return previous?.manual ? previous : { complete: true, manual: false, updatedAt: Date.now() };
}
export const toggleComplete = previous => ({ complete: !previous?.complete, manual: true, updatedAt: Date.now() });