export function getViewer(request) {
  // Request is the only future identity integration point; no sessions in open mode.
  void request;
  return { id: 'local', kind: 'owner', grants: ['*'] };
}