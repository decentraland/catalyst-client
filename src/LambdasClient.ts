import { EthAddress } from 'dcl-crypto'
import { Profile, Fetcher } from 'dcl-catalyst-commons'
import { sanitizeUrl } from './utils/Helper'
import { LambdasAPI } from './LambdasAPI'
import merge from 'deepmerge'
import { RequestOptions } from 'dcl-catalyst-commons/dist/utils/FetcherConfiguration'

export class LambdasClient implements LambdasAPI {
  private readonly lambdasUrl: string

  constructor(lambdasUrl: string, private readonly fetcher: Fetcher = new Fetcher()) {
    this.lambdasUrl = sanitizeUrl(lambdasUrl)
  }

  fetchProfile(ethAddress: EthAddress, options?: RequestOptions): Promise<Profile> {
    return this.fetcher.fetchJson(merge(options ?? {}, { url: `${this.lambdasUrl}/profile/${ethAddress}` }))
  }
}
