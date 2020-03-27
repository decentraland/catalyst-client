import { EthAddress } from 'dcl-crypto'
import { FormData } from "form-data"
import { Fetcher, RequestOptions } from "../../catalyst-commons/src/utils/Fetcher";
import { Timestamp, ContentFile, Pointer, EntityType, Entity, EntityId, AuditInfo, ServerStatus, ServerName, ContentFileHash, DeploymentHistory, EntityMetadata, Profile, PartialDeploymentHistory } from "../../catalyst-commons/src/types";
import { Hashing } from "../../catalyst-commons/src/utils/Hashing";
import { retry, applySomeDefaults } from "../../catalyst-commons/src/utils/Helper";
import { CatalystAPI } from "./CatalystAPI";
import { convertModelToFormData } from './utils/Helper';
import { DeploymentData } from './utils/DeploymentBuilder';


export class CatalystClient implements CatalystAPI {

    private readonly catalystUrl: string

    constructor(catalystUrl: string, private readonly fetcher: Fetcher = new Fetcher()) {
        this.catalystUrl = CatalystClient.sanitizeUrl(catalystUrl)
    }

    async deployEntity(deployData: DeploymentData, fix: boolean = false, options?: RequestOptions): Promise<Timestamp> {
        const form = new FormData()
        form.append('entityId', deployData.entityId)
        convertModelToFormData(deployData.authChain, form, 'authChain')

        const alreadyUploadedHashes = await this.hashesAlreadyOnServer(Array.from(deployData.files.keys()))
        for (const [fileHash, file] of deployData.files) {
            if (!alreadyUploadedHashes.has(fileHash)) {
                form.append(file.name, file.content, { filename: file.name })
            }
        }

        return this.fetcher.postForm(`${this.catalystUrl}/content/entities${fix ? '?fix=true' : ''}`, form, options)
    }

    fetchEntitiesByPointers(type: EntityType, pointers: Pointer[], options?: RequestOptions): Promise<Entity[]> {
        const filterParam = pointers.map(pointer => `pointer=${pointer}`).join("&")
        return this.fetchJson(`/content/entities/${type}?${filterParam}`, options)
    }

    fetchEntitiesByIds(type: EntityType, ids: EntityId[], options?: RequestOptions): Promise<Entity[]> {
        const filterParam = ids.map(id => `id=${id}`).join("&")
        return this.fetchJson(`/content/entities/${type}?${filterParam}`, options)
    }

    async fetchEntityById(type: EntityType, id: EntityId, options?: RequestOptions): Promise<Entity> {
        const entities: Entity[] = await this.fetchEntitiesByIds(type, [id], options)
        if (entities.length === 0) {
            throw new Error(`Failed to find an entity with type '${type}' and id '${id}'.`)
        }
        return entities[0]
    }

    fetchAuditInfo(type: EntityType, id: EntityId, options?: RequestOptions): Promise<AuditInfo> {
        return this.fetchJson(`/content/audit/${type}/${id}`, options)
    }

    async fetchFullHistory(query?: { from?: number; to?: number; serverName?: string }, options?: Partial<{ attempts: number; timeout: string; waitTime: string; }>): Promise<DeploymentHistory> {
        // We are setting different defaults in this case, because if one of the request fails, then all fail
        const withSomeDefaults = applySomeDefaults({ attempts: 3, waitTime: '1s' }, options)

        let events: DeploymentHistory = []
        let offset = 0
        let keepRetrievingHistory = true
        while (keepRetrievingHistory) {
            const partialHistory: PartialDeploymentHistory = await this.fetchHistory(query, withSomeDefaults)
            events.push(...partialHistory.events)
            offset = partialHistory.pagination.offset + partialHistory.pagination.limit
            keepRetrievingHistory = partialHistory.pagination.moreData
        }

        return events
    }

    fetchHistory(query?: {from?: Timestamp, to?: Timestamp, serverName?: ServerName, offset?: number, limit?: number}, options?: RequestOptions): Promise<PartialDeploymentHistory> {
        let url = `${this.catalystUrl}/content/history?offset=${query?.offset ?? 0}`
        if (query?.from) {
            url += `&from=${query?.from}`
        }
        if (query?.to) {
            url += `&to=${query?.to}`
        }
        if (query?.serverName) {
            url += `&serverName=${query?.serverName}`
        }
        if (query?.limit) {
            url += `&limit=${query?.limit}`
        }
        return this.fetcher.fetchJson(url, options)
    }

    fetchStatus(options?: RequestOptions): Promise<ServerStatus> {
        return this.fetchJson('/content/status', options)
    }

    async downloadContent(contentHash: ContentFileHash, options?: RequestOptions): Promise<ContentFile> {
        const { attempts = 3, waitTime = '0.5s' } = options

        return retry(async () => {
            const content = await this.fetcher.fetchBuffer(`${this.catalystUrl}/content/contents/${contentHash}`, { timeout: options.timeout });
            const downloadedHash = await Hashing.calculateBufferHash(content)
            // Sometimes, the downloaded file is not complete, so the hash turns out to be different.
            // So we will check the hash before considering the download successful.
            if (downloadedHash === contentHash) {
                return { name: contentHash, content }
            }
            throw new Error(`Failed to fetch file with hash ${contentHash} from ${this.catalystUrl}`)
        }, attempts, waitTime)
    }

    fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile> {
        return this.fetchJson(`lambdas/profile/${ethAddress}`, options)
    }

    /** Given an array of file hashes, return a set with those already uploaded on the server */
    private async hashesAlreadyOnServer(hashes: ContentFileHash[]): Promise<Set<ContentFileHash>> {
        // TODO: Consider splitting into chunks, since if there are too many hashes, the url could get too long
        const withoutDuplicates = Array.from(new Set(hashes).values());
        const queryParam = withoutDuplicates.map(hash => `cid=${hash}`).join('&')
        const url = `${this.catalystUrl}/content/available-content?${queryParam}`

        const result: { cid: ContentFileHash, available: boolean }[] = await this.fetchJson(url)

        const alreadyUploaded = result.filter(({ available }) => available)
            .map(({ cid }) => cid)

        return new Set(alreadyUploaded)
    }

    private fetchJson(path: string, options?: RequestOptions): Promise<any> {
        return this.fetcher.fetchJson(`${this.catalystUrl}${path}`, options)
    }

    private static sanitizeUrl(url: string): string {
        // Remove empty spaces
        url = url.trim()

        // Add protocol if necessary
        if (!url.startsWith('https://') && !url.startsWith('http://')) {
            url = 'https://' + url
        }

        // Remove trailing slash if present
        if (url.endsWith('/')) {
            url = url.slice(0, -1)
        }

        return url
    }

}
