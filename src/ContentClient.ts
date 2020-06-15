require('isomorphic-form-data');
import { Timestamp, Pointer, EntityType, Entity, EntityId, AuditInfo, ServerStatus, ServerName, ContentFileHash, PartialDeploymentHistory, applySomeDefaults, retry, Fetcher, RequestOptions, Hashing, LegacyPartialDeploymentHistory, DeploymentFilters, Deployment, AvailableContentResult, LegacyDeploymentHistory, DeploymentWithMetadata, DeploymentWithContent, DeploymentWithPointers, DeploymentBase, DeploymentWithAuditInfo } from "dcl-catalyst-commons";
import { ContentAPI } from './ContentAPI';
import { addModelToFormData, sanitizeUrl, splitManyValuesIntoManyQueries, splitValuesIntoManyQueries } from './utils/Helper';
import { DeploymentData } from './utils/DeploymentBuilder';

export class ContentClient implements ContentAPI {

    private static readonly CHARS_LEFT_FOR_OFFSET = 7
    private readonly contentUrl: string

    constructor(contentUrl: string,
        private readonly origin: string, // The name or a description of the app that is using the client
        private readonly fetcher: Fetcher = new Fetcher()) {
        this.contentUrl = sanitizeUrl(contentUrl)
    }

    async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
        const form = new FormData()
        form.append('entityId', deployData.entityId)
        addModelToFormData(deployData.authChain, form, 'authChain')

        const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()), options)
        for (const [fileHash, file] of deployData.files) {
            if (!alreadyUploadedHashes.has(fileHash)) {
                // @ts-ignore
                form.append(file.name, file.content, file.name)
            }
        }

        const headers = { 'x-upload-origin': this.origin }
        const { creationTimestamp } = await this.fetcher.postForm(`${this.contentUrl}/entities${fix ? '?fix=true' : ''}`, form, headers, options)
        return creationTimestamp
    }

    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
        if (pointers.length === 0) {
            return Promise.reject(`You must set at least one pointer.`)
        }

        return this.splitAndFetch<Entity, EntityId>(`/entities/${type}`, 'pointer', pointers, ({ id }) => id, options)
    }

    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
        if (ids.length === 0) {
            return Promise.reject(`You must set at least one id.`)
        }

        return this.splitAndFetch<Entity, EntityId>(`/entities/${type}`, 'id', ids, ({ id }) => id, options)
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

    async fetchFullHistory(query?: { from?: number; to?: number; serverName?: string }, options?: RequestOptions): Promise<LegacyDeploymentHistory> {
        // We are setting different defaults in this case, because if one of the request fails, then all fail
        const withSomeDefaults = applySomeDefaults({ attempts: 3, waitTime: '1s' }, options)

        let events: LegacyDeploymentHistory = []
        let offset = 0
        let keepRetrievingHistory = true
        while (keepRetrievingHistory) {
            const currentQuery = { ...query, offset}
            const partialHistory: LegacyPartialDeploymentHistory = await this.fetchHistory(currentQuery, withSomeDefaults)
            events.push(...partialHistory.events)
            offset = partialHistory.pagination.offset + partialHistory.pagination.limit
            keepRetrievingHistory = partialHistory.pagination.moreData
        }

        return events
    }

    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number}, options?: RequestOptions): Promise<LegacyPartialDeploymentHistory> {
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

    async fetchAllDeployments<T extends DeploymentBase = Deployment>(filters?: DeploymentFilters, fields: DeploymentFields<T> = DeploymentFields.POINTERS_CONTENT_METADATA_AND_AUDIT_INFO, options?: RequestOptions): Promise<T[]> {
        // We are setting different defaults in this case, because if one of the request fails, then all fail
        const withSomeDefaults = applySomeDefaults({ attempts: 3, waitTime: '1s' }, options)

        // Transform filters object into query params map
        let queryParams: Map<string, string[]> = new Map()
        if (filters) {
            const entries = Object.entries(filters).map<[string, string[]]>(([ name, value ]) => {
                const newName = name.endsWith('s') ? name.slice(0, -1) : name
                let newValues: string[]
                if (Array.isArray(value)) {
                    newValues = value.map(element => `${element}`)
                } else {
                    newValues = [ `${value}` ]
                }
                return [newName, newValues]
            })
            queryParams = new Map(entries)
        }

        // Add audit info, since we need to sort by local timestamp
        queryParams.set('auditInfo', ['true'])
        type AddedAudit = T & DeploymentWithAuditInfo

        // Reserve a few chars to send the offset
        const reservedChars = `&offset=`.length + ContentClient.CHARS_LEFT_FOR_OFFSET

        // Split values into different queries
        const queries = splitManyValuesIntoManyQueries(this.contentUrl, '/deployments', queryParams, reservedChars)

        // Perform the different queries
        const results: AddedAudit[] = []
        for (const query of queries) {
            let offset = 0
            let keepRetrievingHistory = true
            while (keepRetrievingHistory) {
                const url = query + (queryParams.size === 0 ? '?' : '&') + `offset=${offset}`
                const partialHistory: PartialDeploymentHistory<AddedAudit> = await this.fetcher.fetchJson(url, withSomeDefaults)
                results.push(...partialHistory.deployments)
                offset = partialHistory.pagination.offset + partialHistory.pagination.limit
                keepRetrievingHistory = partialHistory.pagination.moreData
            }
        }

        // Remove duplicates
        const withoutDuplicates: Map<EntityId, AddedAudit> = new Map(results.map(deployment => [deployment.entityId, deployment]))

        // Sort by local timestamp
        let deployments = Array.from(withoutDuplicates.values())
            .sort((deployment1, deployment2) => deployment1.auditInfo.localTimestamp - deployment2.auditInfo.localTimestamp)

        if (!fields.getFields().includes('auditInfo')) {
            deployments.forEach(deployment => delete deployment.auditInfo)
        }

        return deployments
    }

    fetchLastDeployments<T extends DeploymentBase = DeploymentWithPointers & DeploymentWithContent & DeploymentWithMetadata>(offset?: number, limit?: number, fields: DeploymentFields<T> = DeploymentFields.POINTERS_CONTENT_AND_METADATA, options?: RequestOptions): Promise<PartialDeploymentHistory<T>> {
        let path = `/deployments?offset=${offset ?? 0}`
        if (limit) {
            path += `&limit=${limit}`
        }
        if (fields.getFields().includes('auditInfo')) {
            path += `&auditInfo=true`
        }
        return this.fetchJson(path, options)
    }

    isContentAvailable(cids: string[], options?: RequestOptions): Promise<AvailableContentResult> {
        if (cids.length === 0) {
            return Promise.reject(`You must set at least one cid.`)
        }

        return this.splitAndFetch<{ cid: ContentFileHash, available: boolean }, ContentFileHash>(`/available-content`, 'cid', cids, ({ cid }) => cid, options)
    }

    /** Given an array of file hashes, return a set with those already uploaded on the server */
    private async hashesAlreadyOnServer(hashes: ContentFileHash[], options: RequestOptions | undefined): Promise<Set<ContentFileHash>> {
        const result: AvailableContentResult = await this.isContentAvailable(hashes, options)

        const alreadyUploaded = result.filter(({ available }) => available)
            .map(({ cid }) => cid)

        return new Set(alreadyUploaded)
    }

    /**
     * This method performs one or more fetches to the content server, splitting into different queries to avoid exceeding the max length of urls
     */
    private async splitAndFetch<E, K>(basePath: string,
        queryParamName: string,
        values: string[],
        extractKey: (object: E) => K,
        options?: RequestOptions): Promise<E[]> {
        // Split values into different queries
        const queries = splitValuesIntoManyQueries(this.contentUrl, basePath, queryParamName, values)

        // Perform the different queries
        const results: E[][] = [];
        for (const query of queries) {
            const result = await this.fetcher.fetchJson(query, options)
            results.push(result)
        }

        // Flatten results
        const flattenedResult: E[] = results.reduce((accum, value) => accum.concat(value), [])

        // Group results by key, since there could be duplicates
        const groupedResults: Map<K, E> = new Map(flattenedResult.map(result => [extractKey(result), result]))

        // Return results
        return Array.from(groupedResults.values())
    }

    private fetchJson(path: string, options?: RequestOptions): Promise<any> {
        return this.fetcher.fetchJson(`${this.contentUrl}${path}`, options)
    }

}

//@ts-ignore
export class DeploymentFields<T extends Partial<Deployment>> {

    static readonly POINTERS_CONTENT_METADATA_AND_AUDIT_INFO = new DeploymentFields<Deployment>(['pointers', 'content', 'metadata' , 'auditInfo'])
    static readonly POINTERS_CONTENT_AND_METADATA = new DeploymentFields<DeploymentWithPointers & DeploymentWithContent & DeploymentWithMetadata>(['pointers', 'content', 'metadata'])

    private constructor(private readonly fields: string[]) { }

    getFields() {
        return this.fields;
    }

}