const mockCreateFetchComponent = jest.fn()

import { CatalystClient } from '../../src/CatalystClient'
import { ContentClient } from '../../src/ContentClient'
import { LambdasClient } from '../../src/LambdasClient'
import { getHeadersWithUserAgent } from '../../src/utils'

jest.mock('./../../src/utils/fetcher', () => ({
  createFetchComponent: mockCreateFetchComponent
}))

describe('When building', () => {
  it('the ContentClient should set the fetcher to use with default User-Agent header', () => {
    new ContentClient({ contentUrl: 'anUrl' })

    expect(mockCreateFetchComponent).toHaveBeenCalledWith({ headers: getHeadersWithUserAgent('content-client') })
  })

  it('the LambdasClient should set the fetcher to use with default User-Agent header', () => {
    new LambdasClient({ lambdasUrl: 'anUrl' })

    expect(mockCreateFetchComponent).toHaveBeenCalledWith({ headers: getHeadersWithUserAgent('lambdas-client') })
  })

  it('the CatalystClient should set the fetcher to use with default User-Agent header', () => {
    new CatalystClient({ catalystUrl: 'anUrl' })

    expect(mockCreateFetchComponent).toHaveBeenCalledWith({ headers: getHeadersWithUserAgent('catalyst-client') })
  })
})
