import chai from 'chai'
import { sanitizeUrl } from 'utils/Helper'

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

})