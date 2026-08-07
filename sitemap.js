import { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://sexy-live-room.vercel.app',
      lastModified: new Date(),
    },
  ]
}
