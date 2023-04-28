import { setTimeout } from 'timers/promises'

export async function retry<T>(
  description: string,
  execution: () => Promise<T>,
  attempts: number,
  waitTimeInMs: number
): Promise<T> {
  while (attempts > 0) {
    try {
      return await execution()
      //     ^^^^^ never remove this "await" keyword, otherwise this function won't
      //           catch the exception and perform the retries
    } catch (error) {
      attempts--
      if (attempts > 0) {
        console.info(
          `Failed to ${description}. Still have ${attempts} attempt/s left. Will try again in ${waitTimeInMs}`
        )
        await setTimeout(waitTimeInMs, null)
      } else {
        throw error
      }
    }
  }
  throw new Error('Please specify more than one attempt for the retry function')
}
