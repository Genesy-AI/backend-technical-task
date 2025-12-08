# Proposed improvements & Roadmap

## On my current solution
The task that I developed could be improved in several ways:
### Frontend
1. Currently, when a user refreshes the page on the frontend, any ongoing task (such as a "find phones" job) appears to be lost from the UI, even though the backend continues processing it. Implement persistent job tracking in the frontend. When a task is initiated, store the job ID in `localStorage`. On page load, the frontend should check for existing job IDs in storage, and query the backend for their status to restore or display progress to the user. This ensures that ongoing tasks remain visible after refresh or navigation, improving user experience and feedback.
2. Instead of polling we could implement a websocket for live updates
3. Replace the country codes variable to use a library
### Backend
1. The rate limiting has been developed using tools external from Temporal ([bottleneck](https://www.npmjs.com/package/bottleneck)) which feels ok for now. I've seen that there is not RPM throttling in Temporal ([or maybe yes](https://community.temporal.io/t/rate-limit-configuration-and-best-practices/5498/2)?), so we would need to make it more robust. In cases where the bottleneck library makes the job wait for a bit, since the workflow is set to last for 5s it will fail so we have some edge cases that we would need to cover.
2. Currently the find-phones jobs are stored in a variable. We should use a more robust way of handling it. I imagine that we could create a batchWorkflow that spans startChild() processes. This way we have a big workflow that keeps track of the statuses. But I thought that it clashed with the "Idempotent workflow (only one per lead)" request so I left it as an improvement.
3. Replace phone extensions variable with library

## On the existing code
The code that I received could also be improved. Here are some improvements that I propose:
### Frontend
1. Add [Playwright](https://playwright.dev/) or similar library to test E2E features
2. Increase functionalities of the LeadList (allow for filter/sort etc)

### Backend
1. The `index.ts` file has 470 lines and handles many responsibilities. Following Clean Code principles, we should separate concerns as follows:
   - Leave index.ts to be almost only imports
   - Create a middleware folder with files that would manage cors and error handling
   - Create a router folder that could separate each family of endpoints into a file (for now only /leads)
   - Create a controller folder that would manage data validation
   - Create a services folder for Temporal logic and Prisma queries
   - Create a types folder that would contain all types/interfaces
   - Move configuration and boilerplate (such as client connection setup) into a config or bootstrap file.
2. The data validation is being handled by simple functions. In the future it would be nice to use [zod](https://www.npmjs.com/package/zod) or a similar library to validate input format.
3. There is no authentication/CORS validation in the backend. Maybe that's by design or it's handled somewhere else.
4. I created a .env file that I actively added to github since the keys are not real, in a real case scenario I'd only push the .env.example file and add .env to gitignore. We could have a better way of retrieving env vars and validate that there's no missing key.
5. The Prisma file is very simple, we could add some [indexes](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes) to improve performance. We could also improve performance by adding Redis to cache some responses
6. pagination in GET /leads, allow max number of leads in find-phones, validate-emails
7. some `any` types that could be improved
8. improve logging/tests