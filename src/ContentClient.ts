import { Timestamp, Pointer, EntityType, Entity, EntityId, AuditInfo, ServerStatus, ServerName, ContentFileHash, DeploymentHistory, PartialDeploymentHistory, applySomeDefaults, retry, Fetcher, RequestOptions, Hashing } from "dcl-catalyst-commons";
import { ContentAPI } from './ContentAPI';
import { convertModelToFormData, sanitizeUrl } from './utils/Helper';
import { DeploymentData } from './utils/DeploymentBuilder';


export class ContentClient implements ContentAPI {

    private readonly contentUrl: string

    constructor(contentUrl: string,
        private readonly origin: string, // The name or a description of the app that is using the client
        private readonly fetcher: Fetcher = new Fetcher()) {
        this.contentUrl = sanitizeUrl(contentUrl)
    }

    async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
        const form = new FormData()
        form.append('entityId', deployData.entityId)
        convertModelToFormData(deployData.authChain, form, 'authChain')

        const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()))
        for (const [fileHash, file] of deployData.files) {
            if (!alreadyUploadedHashes.has(fileHash)) {
                form.append(file.name, new Blob([file.content]), file.name)
            }
        }

        const headers = { 'x-upload-origin': this.origin }
        return this.fetcher.postForm(`${this.contentUrl}/entities${fix ? '?fix=true' : ''}`, form, headers, options)
    }

    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
        if (pointers.length === 0) {
            return Promise.reject(`You must set at least one pointer.`)
        }

        const filterParam = pointers.map(pointer => `pointer=${pointer}`).join("&")
        return this.fetchJson(`/entities/${type}?${filterParam}`, options)
    }

    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
        if (ids.length === 0) {
            return Promise.reject(`You must set at least one id.`)
        }

        const filterParam = ids.map(id => `id=${id}`).join("&")
        return this.fetchJson(`/entities/${type}?${filterParam}`, options)
    }

    async fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity> {
        const entities: Entity[] = await this.fetchEntitiesByIds(type, [id], options)
        if (entities.length === 0) {
            return Promise.reject(`Failed to find an entity with type '${type}' and id '${id}'.`)
        }
        return entities[0]
    }

    fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo> {
        return this.fetchJson(`/audit/${type}/${id}`, options)
    }

    async fetchFullHistory(query?: { from?: number; to?: number; serverName?: string }, options?: RequestOptions): Promise<DeploymentHistory> {
        // We are setting different defaults in this case, because if one of the request fails, then all fail
        const withSomeDefaults = applySomeDefaults({ attempts: 3, waitTime: '1s' }, options)

        let events: DeploymentHistory = []
        let offset = 0
        let keepRetrievingHistory = true
        while (keepRetrievingHistory) {
            const currentQuery = { ...query, offset}
            const partialHistory: PartialDeploymentHistory = await this.fetchHistory(currentQuery, withSomeDefaults)
            events.push(...partialHistory.events)
            offset = partialHistory.pagination.offset + partialHistory.pagination.limit
            keepRetrievingHistory = partialHistory.pagination.moreData
        }

        return events
    }

    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number}, options?: RequestOptions): Promise<PartialDeploymentHistory> {
        let path = `/history?offset=${query?.offset ?? 0}`
        if (query?.from) {
            path += `&from=${query?.from}`
        }
        if (query?.to) {
            path += `&to=${query?.to}`
        }
        if (query?.serverName) {
            path += `&serverName=${query?.serverName}`
        }
        if (query?.limit) {
            path += `&limit=${query?.limit}`
        }
        return this.fetchJson(path, options)
    }

    fetchStatus(options?: RequestOptions): Promise<ServerStatus> {
        return this.fetchJson('/status', options)
    }

    async downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<Buffer> {
        const { attempts = 3, waitTime = '0.5s' } = options ?? { }

        return retry(async () => {
            const content = await this.fetcher.fetchBuffer(`${this.contentUrl}/contents/${contentHash}`, { timeout: options?.timeout });
            const downloadedHash = await Hashing.calculateBufferHash(content)
            // Sometimes, the downloaded file is not complete, so the hash turns out to be different.
            // So we will check the hash before considering the download successful.
            if (downloadedHash === contentHash) {
                return content
            }
            throw new Error(`Failed to fetch file with hash ${contentHash} from ${this.contentUrl}`)
        }, attempts, waitTime)
    }

    /** Given an array of file hashes, return a set with those already uploaded on the server */
    private async hashesAlreadyOnServer(hashes: ContentFileHash[]): Promise<Set<ContentFileHash>> {
        if (hashes.length === 0) {
            return new Set()
        }

        // TODO: Consider splitting into chunks, since if there are too many hashes, the url could get too long
        const withoutDuplicates = Array.from(new Set(hashes).values());
        const queryParam = withoutDuplicates.map(hash => `cid=${hash}`).join('&')
        const path = `/available-content?${queryParam}`

        const result: { cid: ContentFileHash, available: boolean }[] = await this.fetchJson(path)

        const alreadyUploaded = result.filter(({ available }) => available)
            .map(({ cid }) => cid)

        return new Set(alreadyUploaded)
    }

    private fetchJson(path: string, options?: RequestOptions): Promise<any> {
        return this.fetcher.fetchJson(`${this.contentUrl}${path}`, options)
    }

}
