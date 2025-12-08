import { lead, PrismaClient } from '@prisma/client'
import express, { Request, Response } from 'express'
import { Connection, Client } from '@temporalio/client'
import { verifyEmailWorkflow, findPhonesWorkflow } from './workflows'
import { generateMessageFromTemplate, Lead } from './utils/messageGenerator'
import { runTemporalWorker } from './worker'

const prisma: any = new PrismaClient();

const app = express()
app.use(express.json())

app.use(function (req, res, next) {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
    return
  }

  next()
})

interface PhoneJobProgress {
  jobId: string
  status: 'processing' | 'completed' | 'failed'
  total: number
  completed: number
  results: Array<{ leadId: number; telephoneNumber: string | null; provider: string | null }>
  errors: Array<{ leadId: number; leadName: string; error: string }>
  startedAt: Date
}

// In-memory store (for production, use Redis or DB)
const phoneJobs = new Map<string, PhoneJobProgress>()

// Cleanup old jobs after 1 hour
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000
  for (const [jobId, job] of phoneJobs.entries()) {
      if (job.startedAt.getTime() < oneHourAgo) {
          phoneJobs.delete(jobId)
      }
  }
}, 10 * 60 * 1000)

app.post('/leads', async (req: Request, res: Response) => {
  const { name, lastName, email } = req.body

  if (!name || !lastName || !email) {
    return res.status(400).json({ error: 'firstName, lastName, and email are required' })
  }

  const lead = await prisma.lead.create({
    data: {
      firstName: String(name),
      lastName: String(lastName),
      email: String(email),
    },
  })
  res.json(lead)
})

app.get('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const lead = await prisma.lead.findUnique({
    where: {
      id: Number(id),
    },
  })
  res.json(lead)
})

app.get('/leads', async (req: Request, res: Response) => {
  const leads = await prisma.lead.findMany()

  res.json(leads)
})

app.patch('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const { name, email } = req.body
  const lead = await prisma.lead.update({
    where: {
      id: Number(id),
    },
    data: {
      firstName: String(name),
      email: String(email),
    },
  })
  res.json(lead)
})

app.delete('/leads/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  await prisma.lead.delete({
    where: {
      id: Number(id),
    },
  })
  res.json()
})

app.delete('/leads', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { ids } = req.body

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids must be a non-empty array' })
  }

  try {
    const result = await prisma.lead.deleteMany({
      where: {
        id: {
          in: ids.map((id) => Number(id)),
        },
      },
    })

    res.json({ deletedCount: result.count })
  } catch (error) {
    console.error('Error deleting leads:', error)
    res.status(500).json({ error: 'Failed to delete leads' })
  }
})

app.post('/leads/generate-messages', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds, template } = req.body

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  if (!template || typeof template !== 'string') {
    return res.status(400).json({ error: 'template must be a non-empty string' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: {
        id: {
          in: leadIds.map((id) => Number(id)),
        },
      },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    let generatedCount = 0
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const message = generateMessageFromTemplate(template, lead)

        await prisma.lead.update({
          where: { id: lead.id },
          data: { message },
        })

        generatedCount++
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      generatedCount,
      errors,
    })
  } catch (error) {
    console.error('Error generating messages:', error)
    res.status(500).json({ error: 'Failed to generate messages' })
  }
})

app.post('/leads/bulk', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leads } = req.body

  if (!Array.isArray(leads) || leads.length === 0) {
    return res.status(400).json({ error: 'leads must be a non-empty array' })
  }

  try {
    const validLeads = leads.filter((lead) => {
      return (
        lead.firstName &&
        lead.lastName &&
        lead.email &&
        typeof lead.firstName === 'string' &&
        lead.firstName.trim() &&
        typeof lead.lastName === 'string' &&
        lead.lastName.trim() &&
        typeof lead.email === 'string' &&
        lead.email.trim() && 
        typeof lead.telephoneNumber === 'string' &&
        lead.telephoneNumber.trim()
      )
    })

    if (validLeads.length === 0) {
      return res
        .status(400)
        .json({ error: 'No valid leads found. firstName, lastName, and email are required.' })
    }

    const existingLeads = await prisma.lead.findMany({
      where: {
        OR: validLeads.map((lead) => ({
          AND: [{ firstName: lead.firstName.trim() }, { lastName: lead.lastName.trim() }],
        })),
      },
    })

    const leadKeys = new Set(
      existingLeads.map((lead: lead) => `${lead.firstName.toLowerCase()}_${(lead.lastName || '').toLowerCase()}`)
    )

    const uniqueLeads = validLeads.filter((lead) => {
      const key = `${lead.firstName.toLowerCase()}_${lead.lastName.toLowerCase()}`
      return !leadKeys.has(key)
    })

    let importedCount = 0
    const errors: Array<{ lead: any; error: string }> = []

    for (const lead of uniqueLeads) {
      try {
        await prisma.lead.create({
          data: {
            firstName: lead.firstName.trim(),
            lastName: lead.lastName.trim(),
            email: lead.email.trim(),
            jobTitle: lead.jobTitle ? lead.jobTitle.trim() : null,
            countryCode: lead.countryCode ? lead.countryCode.trim() : null,
            companyName: lead.companyName ? lead.companyName.trim() : null,
            telephoneNumber: lead.telephoneNumber ? lead.telephoneNumber.trim() : null,
          },
        })
        importedCount++
      } catch (error) {
        errors.push({
          lead: lead,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    res.json({
      success: true,
      importedCount,
      duplicatesSkipped: validLeads.length - uniqueLeads.length,
      invalidLeads: leads.length - validLeads.length,
      errors,
    })
  } catch (error) {
    console.error('Error importing leads:', error)
    res.status(500).json({ error: 'Failed to import leads' })
  }
})

app.post('/leads/verify-emails', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
    const leads = await prisma.lead.findMany({
      where: { id: { in: leadIds.map((id) => Number(id)) } },
    })

    if (leads.length === 0) {
      return res.status(404).json({ error: 'No leads found with the provided IDs' })
    }

    const connection = await Connection.connect({ address: 'localhost:7233' })
    const client = new Client({ connection, namespace: 'default' })

    let verifiedCount = 0
    const results: Array<{ leadId: number; emailVerified: boolean }> = []
    const errors: Array<{ leadId: number; leadName: string; error: string }> = []

    for (const lead of leads) {
      try {
        const isVerified = await client.workflow.execute(verifyEmailWorkflow, {
          taskQueue: 'myQueue',
          workflowId: `verify-email-${lead.id}-${Date.now()}`,
          args: [lead.email],
        })

        await prisma.lead.update({
          where: { id: lead.id },
          data: { emailVerified: Boolean(isVerified) },
        })

        results.push({ leadId: lead.id, emailVerified: isVerified })
        verifiedCount += 1
      } catch (error) {
        errors.push({
          leadId: lead.id,
          leadName: `${lead.firstName} ${lead.lastName}`.trim(),
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    await connection.close()

    res.json({ success: true, verifiedCount, results, errors })
  } catch (error) {
    console.error('Error verifying emails:', error)
    res.status(500).json({ error: 'Failed to verify emails' })
  }
})

app.post('/leads/find-phones', async (req: Request, res: Response) => {
  if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Request body is required and must be valid JSON' })
  }

  const { leadIds } = req.body as { leadIds?: number[] }

  if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds must be a non-empty array' })
  }

  try {
      const leads = await prisma.lead.findMany({
          where: { id: { in: leadIds.map((id) => Number(id)) } },
      })

      if (leads.length === 0) {
          return res.status(404).json({ error: 'No leads found with the provided IDs' })
      }

      // Generate unique job ID
      const jobId = `phone-job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      // Initialize job progress
      phoneJobs.set(jobId, {
          jobId,
          status: 'processing',
          total: leads.length,
          completed: 0,
          results: [],
          errors: [],
          startedAt: new Date(),
      })

      // Return immediately - processing happens in background
      res.json({
          success: true,
          jobId,
          total: leads.length,
          status: 'processing',
      })

      // Process leads asynchronously
      processPhoneJobAsync(jobId, leads).catch((err) => {
          console.error('Error processing phone job:', err)
          const job = phoneJobs.get(jobId)
          if (job) {
              job.status = 'failed'
          }
      })
  } catch (error) {
      console.error('Error starting phone job:', error)
      res.status(500).json({ error: 'Failed to start phone finding job' })
  }
})

// Async processing function
async function processPhoneJobAsync(jobId: string, leads: any[]) {
  const job = phoneJobs.get(jobId)
  if (!job) return

  const connection = await Connection.connect({ address: 'localhost:7233' })
  const client = new Client({ connection, namespace: 'default' })

  for (const lead of leads) {
      try {
          const result = await client.workflow.execute(findPhonesWorkflow, {
              taskQueue: 'myQueue',
              workflowId: `find-phone-${lead.id}`,
              args: [lead],
          })

          console.log(`Result found for: ${lead.id}: ${JSON.stringify(result)}`)

          // Update database
          await prisma.lead.update({
              where: { id: lead.id },
              data: { telephoneNumber: result.phone },
          })

          // Update job progress
          job.results.push({
              leadId: lead.id,
              telephoneNumber: result.phone,
              provider: result.provider,
          })
          job.completed += 1
      } catch (error) {
          console.error(`Error processing lead ${lead.id}:`, error)
          job.errors.push({
              leadId: lead.id,
              leadName: `${lead.firstName} ${lead.lastName}`.trim(),
              error: error instanceof Error ? error.message : 'Unknown error',
          })
          job.completed += 1
      }
  }

  job.status = 'completed'
  await connection.close()
}

app.get('/leads/find-phones/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params

  const job = phoneJobs.get(jobId)
  
  if (!job) {
      return res.status(404).json({ error: 'Job not found or expired' })
  }

  res.json({
      jobId: job.jobId,
      status: job.status,
      total: job.total,
      completed: job.completed,
      progress: job.total > 0 ? Math.round((job.completed / job.total) * 100) : 0,
      results: job.results,
      errors: job.errors,
  })
})

app.listen(4000, () => {
  console.log('Express server is running on port 4000')
})

runTemporalWorker().catch((err) => {
  console.error(err)
  process.exit(1)
})