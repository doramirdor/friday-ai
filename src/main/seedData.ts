import { databaseService } from './database'

export async function seedDatabase(): Promise<void> {
  try {
    // Check if we already have meetings
    const existingMeetings = await databaseService.getAllMeetings()

    if (existingMeetings.length === 0) {
      console.log('Database initialized successfully')
    } else {
      console.log('Database already contains meetings, skipping seed')
    }
  } catch (error) {
    console.error('Failed to check database status:', error)
  }
}

/**
 * Clean the database by deleting all meetings and resetting settings to default.
 */
export async function cleanDatabase(): Promise<void> {
  try {
    // Delete all meetings
    await new Promise<void>((resolve, reject) => {
      databaseService['db']?.run('DELETE FROM meetings', (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    
    // Delete all settings
    await new Promise<void>((resolve, reject) => {
      databaseService['db']?.run('DELETE FROM settings', (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
    
    // Re-initialize default settings
    await databaseService['initializeDefaultSettings']()
    console.log('Database cleaned successfully')
  } catch (error) {
    console.error('Failed to clean database:', error)
  }
}
