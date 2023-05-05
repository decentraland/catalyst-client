import { createFetchComponent } from '@well-known-components/fetch-component'
import {
  MAX_URL_LENGTH,
  convertFiltersToQueryParams,
  sanitizeUrl,
  splitAndFetchPaginated,
  splitValuesIntoManyQueries
} from '../../src/client/utils/Helper'

describe('Helper', () => {
  it('When has spaces and trailing slash, they are removed', () => {
    const url = ' http://url.com/ '
    const sanitized = sanitizeUrl(url)

    expect(sanitized).toEqual('http://url.com')
  })

  it('When there is no protocol set, then https is added', () => {
    const url = 'url.com'
    const sanitized = sanitizeUrl(url)

    expect(sanitized).toEqual('https://url.com')
  })

  it('When there are too many query values for one param, then the queries are split correctly', () => {
    const baseUrl = 'https://url.com'
    const basePath = '/path'
    const queryParamName = 'query'
    const value = 'value'
    const totalValues = 200

    // Calculate queries
    const values = buildArray(value, totalValues)
    const queries = splitValuesIntoManyQueries({
      baseUrl,
      path: basePath,
      queryParams: { name: queryParamName, values }
    })

    // Calculate how many values could be in a query
    const valueLength = values[0].length
    const valuesPerQuery = Math.floor(
      (MAX_URL_LENGTH - baseUrl.length - basePath.length - 1) / (queryParamName.length + valueLength + 2)
    )

    expect(queries.length).toEqual(Math.ceil(totalValues / valuesPerQuery))

    const buildQueryWithValues = (from, to) =>
      `${baseUrl}${basePath}?${queryParamName}=${values.slice(from, to).join(`&${queryParamName}=`)}`
    const [query1, query2] = queries
    expect(query1).toEqual(buildQueryWithValues(0, valuesPerQuery))
    expect(query2).toEqual(buildQueryWithValues(valuesPerQuery, totalValues))
  })

  it('When there are too many query params, then the queries are split correctly', () => {
    const baseUrl = 'https://url.com'
    const basePath = '/path'
    const queryParamName1 = 'query1'
    const queryParamName2 = 'query2'
    const value = 'value'
    const totalValues = 200

    // Calculate queries
    const values = buildArray(value, totalValues)
    const queries = splitValuesIntoManyQueries({
      baseUrl,
      path: basePath,
      queryParams: new Map([
        [queryParamName1, ['a', 'b']],
        [queryParamName2, values]
      ])
    })

    // Calculate how many values could be in a query
    const valueLength = values[0].length
    const valuesPerQuery = Math.floor(
      (MAX_URL_LENGTH -
        baseUrl.length -
        basePath.length -
        `&=${queryParamName1}a`.length -
        `&${queryParamName1}=b`.length -
        1) /
        (queryParamName2.length + valueLength + 2)
    )

    expect(queries.length).toEqual(Math.ceil(totalValues / valuesPerQuery))

    const buildQueryWithValues = (from, to) =>
      `${baseUrl}${basePath}?${queryParamName1}=a&${queryParamName1}=b&${queryParamName2}=${values
        .slice(from, to)
        .join(`&${queryParamName2}=`)}`
    const [query1, query2] = queries
    expect(query1).toEqual(buildQueryWithValues(0, valuesPerQuery))
    expect(query2).toEqual(buildQueryWithValues(valuesPerQuery, totalValues))
  })

  it('When filters contain an invalid type, then an error is thrown', () => {
    const filters = {
      test: () => {}
    }

    expect(() => convertFiltersToQueryParams(filters)).toThrowError(
      'Query params must be either a string, a number, a boolean or an array of the types just mentioned'
    )
  })

  it('When filters are valid, then they are converted into query params correctly', () => {
    const filters = {
      aBool: true,
      aNum: 10,
      aString: 'text',
      anArray: [true, 10, 'text']
    }

    const queryParams = convertFiltersToQueryParams(filters)

    expect(queryParams.size).toEqual(4)
    expect(queryParams.get('aBool')).toEqual(['true'])
    expect(queryParams.get('aNum')).toEqual(['10'])
    expect(queryParams.get('aString')).toEqual(['text'])
    expect(queryParams.get('anArray')).toEqual(['true', '10', 'text'])
  })

  it('When fetching paginated, then subsequent calls are made correctly', async () => {
    const baseUrl = 'http://base.com'
    const path = '/path'
    const queryParams = { name: 'someName', values: ['value1', 'value2'] }
    const next = `?someName=value1&someName=value3`

    const fetcher = createFetchComponent()
    fetcher.fetch = jest.fn().mockResolvedValue({
      json: jest
        .fn()
        .mockReturnValueOnce({
          elements: [{ id: 'id1' }, { id: 'id2' }],
          pagination: { limit: 2, next }
        })
        .mockReturnValueOnce({
          elements: [{ id: 'id2' }, { id: 'id3' }],
          pagination: { limit: 2 }
        })
    })

    const result = await splitAndFetchPaginated<{ id: string }>({
      fetcher,
      baseUrl,
      path,
      queryParams,
      elementsProperty: 'elements',
      uniqueBy: 'id'
    })

    expect(fetcher.fetch).toHaveBeenCalledTimes(2)
    expect(result).toEqual([{ id: 'id1' }, { id: 'id2' }, { id: 'id3' }])
  })

  function buildArray(base: string, cases: number): string[] {
    const result: string[] = Array(cases)
    for (let i = 0; i < cases; i++) {
      const number = `${i}`.padStart(3, '0')
      result[i] = `${base}${number}`
    }
    return result
  }
})
