import { LeadsCreateInput, LeadsCreateOutput } from '../types/leads/create'
import { LeadsDeleteInput, LeadsDeleteOutput } from '../types/leads/delete'
import { LeadsDeleteManyInput, LeadsDeleteManyOutput } from '../types/leads/deleteMany'
import { LeadsGenerateMessagesInput, LeadsGenerateMessagesOutput } from '../types/leads/generateMessages'
import { LeadsGetManyInput, LeadsGetManyOutput } from '../types/leads/getMany'
import { LeadsGetOneInput, LeadsGetOneOutput } from '../types/leads/getOne'
import { LeadsUpdateInput, LeadsUpdateOutput } from '../types/leads/update'
import { LeadsBulkImportInput, LeadsBulkImportOutput } from '../types/leads/bulkImport'
import { LeadsVerifyEmailsInput, LeadsVerifyEmailsOutput } from '../types/leads/verifyEmails'
import { ApiModule, endpoint } from '../utils'
import { LeadsFindPhonesInput, LeadsFindPhonesOutput, LeadsFindPhonesStatusOutput } from '../types/leads/findPhones'

export const leadsApi = {
  getMany: endpoint<LeadsGetManyOutput, LeadsGetManyInput>('get', '/leads'),
  getOne: endpoint<LeadsGetOneOutput, LeadsGetOneInput>('get', ({ id }) => `/leads/${id}`),
  create: endpoint<LeadsCreateOutput, LeadsCreateInput>('post', '/leads'),
  delete: endpoint<LeadsDeleteOutput, LeadsDeleteInput>('delete', ({ id }) => `/leads/${id}`),
  deleteMany: endpoint<LeadsDeleteManyOutput, LeadsDeleteManyInput>('delete', '/leads'),
  update: endpoint<LeadsUpdateOutput, LeadsUpdateInput>('put', ({ id }) => `/leads/${id}`),
  generateMessages: endpoint<LeadsGenerateMessagesOutput, LeadsGenerateMessagesInput>(
    'post',
    '/leads/generate-messages'
  ),
  bulkImport: endpoint<LeadsBulkImportOutput, LeadsBulkImportInput>('post', '/leads/bulk'),
  verifyEmails: endpoint<LeadsVerifyEmailsOutput, LeadsVerifyEmailsInput>('post', '/leads/verify-emails'),
  findPhones: endpoint<LeadsFindPhonesOutput, LeadsFindPhonesInput>('post', '/leads/find-phones'),
  findPhonesStatus: endpoint<LeadsFindPhonesStatusOutput, { jobId: string }>(
    'get',
    ({ jobId }) => `/leads/find-phones/${jobId}`
  ),
} as const satisfies ApiModule
