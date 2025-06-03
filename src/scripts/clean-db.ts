import { app } from 'electron'
import { cleanDatabase } from '../main/seedData'

// Electron's app.whenReady is needed for app.getPath
app.whenReady().then(async () => {
  await cleanDatabase()
  process.exit(0)
}) 