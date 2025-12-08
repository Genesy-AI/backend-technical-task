export type LeadsFindPhonesInput = {
  leadIds: number[]
}

export type LeadsFindPhonesOutput = {
  success: boolean
  jobId: string
  total: number
  status: 'processing' | 'completed' | 'failed'
}

export type LeadsFindPhonesStatusOutput = {
  jobId: string
  status: 'processing' | 'completed' | 'failed'
  total: number
  completed: number
  progress: number // 0-100
  results: Array<{
      leadId: number
      telephoneNumber: string | null
      provider: string | null
  }>
  errors: Array<{
      leadId: number
      leadName: string
      error: string
  }>
}