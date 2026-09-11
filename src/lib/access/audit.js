export function onAccessDecision(viewer, action, resource, decision) {
  // Intentionally synchronous and empty. Future sinks should enqueue, not block requests.
  void viewer; void action; void resource; void decision;
}