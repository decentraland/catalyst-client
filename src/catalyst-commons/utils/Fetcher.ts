import ms from "ms";
import fetch from "node-fetch";
import AbortController from 'abort-controller';
import FormData from 'form-data';
import { clearTimeout, setTimeout } from "timers"
import { retry, applyDefaults } from "./Helper";

export class Fetcher {

    constructor(private readonly defaultJsonRequestTimeout: string = '30s',
        private readonly defaultFileDownloadRequestTimeout: string = '1m',
        private readonly defaultPostTimeout: string = '5m') {}

    async fetchJson(url: string, options?: RequestOptions): Promise<any> {
        const opts = applyDefaults({ attempts: 1,
            timeout: this.defaultJsonRequestTimeout,
            waitTime: '0.5s',
        }, options)
        return this.fetchInternal(url, response => response.json(), opts)
    }

    async fetchBuffer(url: string, options?: RequestOptions): Promise<Buffer> {
        const opts = applyDefaults({ attempts: 1,
            timeout: this.defaultFileDownloadRequestTimeout,
            waitTime: '1s',
        }, options)
        return this.fetchInternal(url, response => response.buffer(), opts)
    }

    async postForm(url: string, form: FormData, options?: RequestOptions): Promise<any> {
        const opts = applyDefaults({ attempts: 1,
            timeout: this.defaultPostTimeout,
            waitTime: '1s',
        }, options)

        this.fetchInternal(url, response => response.json(), opts, 'POST', form)
    }

    private async fetchInternal<T>(url: string, responseConsumer: (response) => Promise<T>, options: CompleteRequestOptions, method: string = 'GET', body?: FormData): Promise<T> {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
            controller.abort();
        }, ms(options.timeout));

        try {
            return retry(async () => {
                const response = await fetch(url, { signal: controller.signal, body, method });
                if (response.ok) {
                    return await responseConsumer(response)
                } else {
                    const responseText = await response.text()
                    throw new Error(`Failed to fetch ${url}. Got status ${response.status}. Response was ${responseText}`)
                }
            }, options.attempts, options.waitTime)
        } finally {
            clearTimeout(timeout)
        }
    }

}

export type RequestOptions = Partial<CompleteRequestOptions>

type CompleteRequestOptions = {
    attempts: number, // Number of attempts to perform the request
    timeout: string, // Time to abort the request. Time format accepted by ms
    waitTime: string, // Time to wait between attempts. Time format accepted by ms
    // Time format accepted by ms: Examples: '0.5s', '2m', '3h', '100' (assumed to be milliseconds)
}
