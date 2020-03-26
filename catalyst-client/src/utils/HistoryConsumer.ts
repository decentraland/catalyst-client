import { Timestamp, ServerName, DeploymentEvent } from "../../../catalyst-commons/src/types"
import { Fetcher, RequestOptions } from "../../../catalyst-commons/src/utils/Fetcher"
import { applySomeDefaults } from "../../../catalyst-commons/src/utils/Helper"

export class HistoryConsumer {

    /**
     * Since history could be paginated, this function will iterate until it reads it all, and then returns it
     */
    static async consumeAllHistory(
        fetcher: Fetcher,
        serverUrl: string,
        from?: Timestamp,
        to?: Timestamp,
        serverName?: ServerName,
        options?: RequestOptions): Promise<DeploymentEvent[]> {
        const withSomeDefaults = applySomeDefaults({ attempts: 3, waitTime: '1s' }, options)
        let events: DeploymentEvent[] = []
        let offset = 0
        let keepRetrievingHistory = true
        while (keepRetrievingHistory) {
            let url = `${serverUrl}/history?offset=${offset}`
            if (from) {
                url += `&from=${from}`
            }
            if (to) {
                url += `&to=${to}`
            }
            if (serverName) {
                url += `&serverName=${serverName}`
            }
            const partialHistory: PartialDeploymentHistory = await fetcher.fetchJson(url, withSomeDefaults)
            events.push(...partialHistory.events)
            offset = partialHistory.pagination.offset + partialHistory.pagination.limit
            keepRetrievingHistory = partialHistory.pagination.moreData
        }
        return events
    }
}

type PartialDeploymentHistory = {
    events: DeploymentEvent[],
    filters: {
        from?: Timestamp,
        to?: Timestamp,
        serverName?: ServerName,
    },
    pagination: {
        offset: number,
        limit: number,
        moreData: boolean,
    },
}