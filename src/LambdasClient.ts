import { EthAddress } from 'dcl-crypto'
import { Profile, Fetcher, RequestOptions } from 'dcl-catalyst-commons'
import { sanitizeUrl } from './utils/Helper'
import { LambdasAPI } from './LambdasAPI'

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string
  private readonly fetcher: Fetcher

  constructor(lambdasUrl: string, fetcher?: Fetcher) {
    this.lambdasUrl = sanitizeUrl(lambdasUrl)
    this.fetcher =
      fetcher ??
      new Fetcher({
        headers: {
          'User-Agent': `lambdas-client/${Environment.RUNNING_VERSION} (+https://github.com/decentraland/catalyst-client)`
        }
      })
  }

  fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile> {
    return this.fetcher.fetchJson(`${this.lambdasUrl}/profile/${ethAddress}`, options)
  }
}
