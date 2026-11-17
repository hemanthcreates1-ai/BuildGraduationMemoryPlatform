import path from 'path'
import { buildFigmaConfig } from '@payloadcms/figma'
import { mcpPlugin } from '@payloadcms/plugin-mcp'
import { en as adminLanguage } from '@payloadcms/translations/languages/en'
import { fileURLToPath } from 'url'
import { Admins } from './collections/Admins'
import { Media } from './collections/Media'
import { Folders } from './collections/Folders'
import { Tags } from './collections/Tags'
import { Users } from './collections/Users'
import { ProfilePhotos } from './collections/ProfilePhotos'
import { ProfilePhotoOriginals } from './collections/ProfilePhotoOriginals'
import { JerseyArtworks } from './collections/JerseyArtworks'
import { JerseyMessages } from './collections/JerseyMessages'
import { SignatureEntries } from './collections/SignatureEntries'
import { MemoryPhotos } from './collections/MemoryPhotos'
import { MemoryPhotoSources } from './collections/MemoryPhotoSources'
import { ModerationRecords } from './collections/ModerationRecords'
import { ActivityLogs } from './collections/ActivityLogs'
import { UploadRecords } from './collections/UploadRecords'
import { Backups } from './collections/Backups'
import { syncAdminAccount } from './lib/admin-bootstrap'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildFigmaConfig({
  admin: {
    user: Admins.slug,
    constrainWidth: true,
    dashboard: {
      widgets: [],
      defaultLayout: [
        { widgetSlug: 'activity', width: 'full' },
        { widgetSlug: 'collections', width: 'full' },
      ],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  i18n: {
    fallbackLanguage: 'en',
    supportedLanguages: { en: adminLanguage },
  },
  collections: [
    Admins,
    Users,
    ProfilePhotos,
    ProfilePhotoOriginals,
    JerseyArtworks,
    JerseyMessages,
    SignatureEntries,
    MemoryPhotos,
    MemoryPhotoSources,
    ModerationRecords,
    ActivityLogs,
    UploadRecords,
    Backups,
    Media,
    Folders,
    Tags,
  ],
  onInit: async (payload) => {
    await syncAdminAccount(payload)
  },
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  localization: {
    locales: [{ code: 'en', label: 'English' }],
    fallback: true,
    defaultLocale: 'en',
  },
  plugins: [mcpPlugin({})],
  figma: {},
})
