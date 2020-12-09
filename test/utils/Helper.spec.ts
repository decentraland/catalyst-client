import chai from 'chai'
import { sanitizeUrl, splitValuesIntoManyQueries, MAX_URL_LENGTH, splitManyValuesIntoManyQueries } from 'utils/Helper'

const expect = chai.expect

describe('Helper', () => {

    it('When has spaces and trailing slash, they are removed', () => {
        const url = ' http://url.com/ '
        const sanitized = sanitizeUrl(url)

        expect(sanitized).to.equal('http://url.com')
    })

    it('When there is no protocol set, then https is added', () => {
        const url = 'url.com'
        const sanitized = sanitizeUrl(url)

        expect(sanitized).to.equal('https://url.com')
    })

    it('When there are too many query values for one param, then the queries are split correctly', () => {
        const baseUrl = 'https://url.com'
        const basePath = '/path'
        const queryParamName = 'query'
        const value = 'value'
        const totalValues = 200

        // Calculate queries
        const values = buildArray(value, totalValues)
        const queries = splitValuesIntoManyQueries(baseUrl, basePath, queryParamName, values)

        // Calculate how many values could be in a query
        const valueLength = values[0].length
        const valuesPerQuery = Math.floor((MAX_URL_LENGTH - baseUrl.length - basePath.length - 1) / (queryParamName.length + valueLength + 2))

        expect(queries.length).to.equal(Math.ceil(totalValues / valuesPerQuery))

        const buildQueryWithValues = (from, to) => `${baseUrl}${basePath}?${queryParamName}=${values.slice(from, to).join(`&${queryParamName}=`)}`
        const [query1, query2] = queries
        expect(query1).to.equal(buildQueryWithValues(0, valuesPerQuery))
        expect(query2).to.equal(buildQueryWithValues(valuesPerQuery, totalValues))
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
        const queries = splitManyValuesIntoManyQueries(baseUrl, basePath, new Map([[queryParamName1, ['a', 'b']], [queryParamName2, values]]))

        // Calculate how many values could be in a query
        const valueLength = values[0].length
        const valuesPerQuery = Math.floor((MAX_URL_LENGTH - baseUrl.length - basePath.length - `&=${queryParamName1}a`.length - `&${queryParamName1}=b`.length - 1) / (queryParamName2.length + valueLength + 2))

        expect(queries.length).to.equal(Math.ceil(totalValues / valuesPerQuery))

        const buildQueryWithValues = (from, to) => `${baseUrl}${basePath}?${queryParamName1}=a&${queryParamName1}=b&${queryParamName2}=${values.slice(from, to).join(`&${queryParamName2}=`)}`
        const [query1, query2] = queries
        expect(query1).to.equal(buildQueryWithValues(0, valuesPerQuery))
        expect(query2).to.equal(buildQueryWithValues(valuesPerQuery, totalValues))
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