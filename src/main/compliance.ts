import * as fs from 'fs'
import { Meeting, Settings } from './database'
import { databaseService } from './database'
import { geminiService } from './gemini'

export class ComplianceService {
  private isProcessing = new Set<number>()

  async processTwoPartyConsentCompliance(meetingId: number): Promise<void> {
    // Prevent multiple simultaneous processing of the same meeting
    if (this.isProcessing.has(meetingId)) {
      console.log(`🔄 Two-party consent processing already in progress for meeting ${meetingId}`)
      return
    }

    try {
      this.isProcessing.add(meetingId)
      console.log(`🔐 Starting two-party consent compliance processing for meeting ${meetingId}`)

      // Get current settings to check if two-party consent is enabled
      const settings = await databaseService.getSettings()
      if (!settings.twoPartyConsent) {
        console.log(`⏭️ Two-party consent not enabled, skipping compliance processing for meeting ${meetingId}`)
        return
      }

      // Get the meeting data
      const meeting = await databaseService.getMeeting(meetingId)
      if (!meeting) {
        console.error(`❌ Meeting ${meetingId} not found for compliance processing`)
        return
      }

      // Check if we have transcript data to process
      if (!meeting.transcript || meeting.transcript.length === 0) {
        console.log(`⏭️ No transcript data for meeting ${meetingId}, skipping compliance processing`)
        return
      }

      console.log(`📝 Processing transcript with ${meeting.transcript.length} lines for compliance`)

      // Generate extended summary using Gemini
      const summaryResult = await this.generateExtendedSummary(meeting, settings)
      if (!summaryResult.success) {
        console.error(`❌ Failed to generate extended summary for meeting ${meetingId}:`, summaryResult.error)
        return
      }

      // Generate action items using Gemini
      const actionItemsResult = await this.generateActionItems(meeting, settings)
      if (!actionItemsResult.success) {
        console.error(`❌ Failed to generate action items for meeting ${meetingId}:`, actionItemsResult.error)
        return
      }

      // Update meeting with generated content and remove sensitive data
      const complianceUpdate: Partial<Meeting> = {
        summary: summaryResult.summary,
        actionItems: actionItemsResult.actionItems,
        // Clear sensitive data for compliance
        transcript: [], // Remove original transcript
        recordingPath: '', // Remove recording path reference
        updatedAt: new Date().toISOString()
      }

      await databaseService.updateMeeting(meetingId, complianceUpdate)
      console.log(`✅ Updated meeting ${meetingId} with compliance-safe content`)

      // Delete the physical recording file(s)
      await this.deleteRecordingFiles(meeting.recordingPath)

      console.log(`🔐 Two-party consent compliance processing completed for meeting ${meetingId}`)
      
    } catch (error) {
      console.error(`❌ Error during two-party consent compliance processing for meeting ${meetingId}:`, error)
    } finally {
      this.isProcessing.delete(meetingId)
    }
  }

  private async generateExtendedSummary(meeting: Meeting, settings: Settings): Promise<{
    success: boolean
    summary?: string
    error?: string
  }> {
    try {
      console.log(`📄 Generating extended summary for compliance processing`)

      const result = await geminiService.generateSummaryOnly({
        transcript: meeting.transcript,
        globalContext: settings.enableGlobalContext ? settings.globalContext : '',
        meetingContext: meeting.context,
        notes: meeting.notes || '',
        existingTitle: meeting.title
      })

      if (result.success && result.summary) {
        console.log(`✅ Generated extended summary (${result.summary.length} characters)`)
        return {
          success: true,
          summary: result.summary
        }
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error generating summary'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async generateActionItems(meeting: Meeting, settings: Settings): Promise<{
    success: boolean
    actionItems?: Array<{ id: number; text: string; completed: boolean }>
    error?: string
  }> {
    try {
      console.log(`📋 Generating action items for compliance processing`)

      const result = await geminiService.generateMeetingContent({
        transcript: meeting.transcript,
        globalContext: settings.enableGlobalContext ? settings.globalContext : '',
        meetingContext: meeting.context,
        notes: meeting.notes || '',
        existingTitle: meeting.title
      })

      if (result.success && result.data?.actionItems) {
        console.log(`✅ Generated ${result.data.actionItems.length} action items`)
        return {
          success: true,
          actionItems: result.data.actionItems
        }
      } else {
        return {
          success: false,
          error: result.error || 'Unknown error generating action items'
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async deleteRecordingFiles(recordingPath: string | string[]): Promise<void> {
    if (!recordingPath) {
      console.log(`📁 No recording path to delete`)
      return
    }

    const pathsToDelete: string[] = Array.isArray(recordingPath) ? recordingPath : [recordingPath]

    for (const filePath of pathsToDelete) {
      if (!filePath) continue

      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          console.log(`🗑️ Deleted recording file for compliance: ${filePath}`)
        } else {
          console.log(`📁 Recording file not found (may have been moved/deleted): ${filePath}`)
        }
      } catch (error) {
        console.error(`❌ Failed to delete recording file ${filePath}:`, error)
      }
    }
  }

  async shouldProcessForCompliance(meetingId: number): Promise<boolean> {
    try {
      const settings = await databaseService.getSettings()
      return settings.twoPartyConsent || false
    } catch (error) {
      console.error(`❌ Error checking compliance settings for meeting ${meetingId}:`, error)
      return false
    }
  }
}

export const complianceService = new ComplianceService() 