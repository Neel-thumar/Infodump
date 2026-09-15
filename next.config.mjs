export default {
  poweredByHeader: false,
  serverExternalPackages: ['gray-matter'],
  // The worker itself must never be served stale, or an update can never ship.
  async headers() {
    return [{
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    }];
  },
};
