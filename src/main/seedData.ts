import { databaseService, Meeting } from './database'

const sampleMeetings: Omit<Meeting, 'id'>[] = [
  {
    recordingPath: '/path/to/recording1.m4a',
    transcript: [
      {
        time: '00:15',
        text: "Okay, let's start today's standup meeting. We have several important topics to cover."
      },
      {
        time: '00:28',
        text: "First, let me go over what we accomplished yesterday and what we're planning for today."
      },
      {
        time: '00:42',
        text: 'John, would you like to share your updates on the authentication system?'
      },
      {
        time: '01:05',
        text: 'Sure! Yesterday I finished implementing the OAuth integration with Google and GitHub.'
      },
      {
        time: '01:18',
        text: "Today I'm planning to work on the password reset functionality and write some tests."
      },
      { time: '01:32', text: "Great work! Any blockers or challenges you're facing?" },
      {
        time: '01:45',
        text: 'Not really, everything is going smoothly. The API documentation was really helpful.'
      },
      {
        time: '02:02',
        text: "Perfect. Sarah, what about the UI components you've been working on?"
      },
      {
        time: '02:15',
        text: "I've completed the design system foundation and implemented the core button components."
      },
      {
        time: '02:28',
        text: 'The focus states and accessibility features are all working as expected.'
      }
    ],
    title: 'Team Standup Meeting',
    description:
      'Weekly team standup to discuss progress, blockers, and upcoming tasks. Covered authentication system updates and UI component progress.',
    tags: ['meeting', 'standup', 'team'],
    actionItems: [
      { id: 1, text: 'Implement password reset functionality', completed: false },
      { id: 2, text: 'Complete OAuth integration with Google and GitHub', completed: true },
      { id: 3, text: 'Write tests for authentication system', completed: false },
      { id: 4, text: 'Review UI component accessibility features', completed: false }
    ],
    context:
      "This is our weekly standup meeting. We discuss what we completed yesterday, what we're working on today, and any blockers. Key participants: John (Backend Developer), Sarah (UI Designer), Mike (Frontend Developer).",
    summary:
      'Team discussed progress on authentication system and UI components. OAuth integration completed, password reset functionality in progress.',
    createdAt: '2024-01-15T10:00:00Z',
    updatedAt: '2024-01-15T10:15:32Z',
    duration: '15:32'
  },
  {
    recordingPath: '/path/to/recording2.m4a',
    transcript: [
      { time: '00:00', text: 'Welcome everyone to our product strategy discussion.' },
      {
        time: '00:10',
        text: "Today we'll be reviewing our roadmap for Q2 and discussing priorities."
      },
      { time: '00:25', text: "Let's start with our current market position and user feedback." }
    ],
    title: 'Product Strategy Discussion',
    description: 'Quarterly product strategy meeting to align on roadmap and priorities for Q2.',
    tags: ['strategy', 'product', 'planning'],
    actionItems: [
      { id: 1, text: 'Finalize Q2 roadmap priorities', completed: false },
      { id: 2, text: 'Schedule user research sessions', completed: false },
      { id: 3, text: 'Update product requirements document', completed: false }
    ],
    context:
      'Quarterly strategy session with product team to review market position and plan Q2 initiatives.',
    summary:
      'Discussed Q2 roadmap priorities, user feedback insights, and upcoming product initiatives.',
    createdAt: '2024-01-14T14:00:00Z',
    updatedAt: '2024-01-14T14:32:18Z',
    duration: '32:18'
  },
  {
    recordingPath: '/path/to/recording3.m4a',
    transcript: [
      { time: '00:00', text: 'Thank you for joining our feedback session today.' },
      { time: '00:12', text: "We're excited to share our latest designs and get your thoughts." }
    ],
    title: 'Client Feedback Session',
    description:
      'Design review session with client to gather feedback on latest mockups and prototypes.',
    tags: ['client', 'feedback', 'design'],
    actionItems: [
      { id: 1, text: 'Incorporate client feedback into designs', completed: false },
      { id: 2, text: 'Update prototypes based on discussion', completed: false },
      { id: 3, text: 'Schedule follow-up review', completed: false }
    ],
    context:
      'Client review session for mobile app design iterations. Focus on user experience and visual design feedback.',
    summary:
      'Client provided valuable feedback on design direction. Several UI improvements requested.',
    createdAt: '2024-01-12T16:00:00Z',
    updatedAt: '2024-01-12T16:28:45Z',
    duration: '28:45'
  }
]

export async function seedDatabase(): Promise<void> {
  try {
    // Check if we already have meetings
    const existingMeetings = await databaseService.getAllMeetings()

    if (existingMeetings.length === 0) {
      console.log('Seeding database with sample meetings...')

      for (const meeting of sampleMeetings) {
        await databaseService.createMeeting(meeting)
        console.log(`Created meeting: ${meeting.title}`)
      }

      console.log('Database seeding completed successfully')
    } else {
      console.log('Database already contains meetings, skipping seed')
    }
  } catch (error) {
    console.error('Failed to seed database:', error)
  }
}
