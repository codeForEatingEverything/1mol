/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The footer links to /demo on the project's own domain so the URL stays
  // stable if the video ever moves; this forwards it to the recording.
  async redirects() {
    return [
      {
        source: '/demo',
        destination: 'https://www.youtube.com/watch?v=LhaaVhAQCyk',
        permanent: false,
      },
    ];
  },
  webpack: (config) => {
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    config.resolve.fallback = { fs: false, net: false, tls: false };
    return config;
  },
};

export default nextConfig;
