export default function demo(viewer, action, resource, context) {
  if ((resource.type === 'category' && context.categoryIndex === 1) || (resource.type === 'course' && context.categoryCount === 1 && context.courseIndex === 1)) return { effect: 'deny', reason: 'Demo: hidden collection', ui: 'locked' };
  if (resource.type !== 'volume' || ['list', 'thumbnail'].includes(action)) return { effect: 'allow' };
  if (resource.order >= 4) return { effect: 'deny', reason: 'Demo: volumes 4+ are locked', ui: 'locked' };
  if (resource.order === 1) return { effect: 'partial', reason: 'Demo preview', limit: { type: 'headings', count: 3 } };
  return { effect: 'allow' };
}