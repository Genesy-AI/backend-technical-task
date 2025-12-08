import { proxyActivities } from '@temporalio/workflow'
import type * as activities from './activities'
import { lead } from '@prisma/client'

const { verifyEmail } = proxyActivities<typeof activities>({
  startToCloseTimeout: '1 second',
})

export async function verifyEmailWorkflow(email: string): Promise<boolean> {
  return await verifyEmail(email)
}

const {
  findPhoneOrionConnect,
  findPhoneAstraDialer,
  findPhoneNimbusLookup,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: '5 seconds',
  retry: {
    maximumAttempts: 3,
    backoffCoefficient: 2,
    initialInterval: '500ms',
  },
})

export async function findPhonesWorkflow(lead: lead): Promise<{
  phone: string | null
  provider: string | null
  steps: {
    provider: string
    attempted: boolean
    found: boolean
  }[]
}> {
  const steps = []

  // Try Orion Connect
  steps.push({ provider: 'OrionConnect', attempted: true, found: false })
  const phoneOrion = await findPhoneOrionConnect(lead)
  if (phoneOrion) {
    steps[0].found = true
    return { phone: phoneOrion, provider: 'OrionConnect', steps }
  }

  // Try Astra Dialer
  steps.push({ provider: 'AstraDialer', attempted: true, found: false })
  const phoneAstra = await findPhoneAstraDialer(lead)
  if (phoneAstra) {
    steps[1].found = true
    return { phone: phoneAstra, provider: 'AstraDialer', steps }
  }

  // Try Nimbus Lookup
  steps.push({ provider: 'NimbusLookup', attempted: true, found: false })
  const phoneNimbus = await findPhoneNimbusLookup(lead)
  if (phoneNimbus) {
    steps[2].found = true
    return { phone: phoneNimbus, provider: 'NimbusLookup', steps }
  }

  // No data found
  return { phone: "No data found", provider: null, steps }
}
