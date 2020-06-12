require('isomorphic-form-data');

export function addModelToFormData(model: any, form: FormData, namespace = ''): FormData {
    for (let propertyName in model) {
        if (!model.hasOwnProperty(propertyName) || !model[propertyName]) continue
        let formKey = namespace ? `${namespace}[${propertyName}]` : propertyName
        if (model[propertyName] instanceof Date) {
            form.append(formKey, model[propertyName].toISOString())
        } else if (model[propertyName] instanceof Array) {
            model[propertyName].forEach((element: any, index: number) => {
                const tempFormKey = `${formKey}[${index}]`
                addModelToFormData(element, form, tempFormKey)
            })
        } else if (typeof model[propertyName] === 'object') {
            addModelToFormData(model[propertyName], form, formKey)
        } else {
            form.append(formKey, model[propertyName].toString())
        }
    }
    return form
}

export function removeDuplicates<T>(array: T[]): T[] {
    return Array.from(new Set(array))
}

/**
 * This method performs splits what would be one query into many, to avoid exceeding the max length of urls
 */
export const MAX_URL_LENGTH: number = 2048
export function splitValuesIntoManyQueries(baseUrl: string, basePath: string, queryParamName: string, values: string[]): string[] {
    return splitManyValuesIntoManyQueries(baseUrl, basePath, new Map([[queryParamName, values]]))
}

export function splitManyValuesIntoManyQueries(baseUrl: string, basePath: string, queryParams: Map<string, string[]>, reservedChars: number = 0): string[] {
    // Check that it makes sent to apply the algorithm
    if (queryParams.size === 0) {
        return [ baseUrl + basePath ]
    }

    // Remove duplicates
    const withoutDuplicates: [string, string[]][] = Array.from(queryParams.entries()).map(([name, values]) => [name, removeDuplicates(values)])

    // Sort params by amount of values
    const sortedByValues: [string, string[]][] = withoutDuplicates.sort(([_, values1], [__, values2]) => values1.length - values2.length)

    // Add all params (except the last one that is the one with the most values) into the url
    const queryBuilder = new QueryBuilder(baseUrl + basePath, reservedChars)
    for (let i = 0; i < sortedByValues.length - 1; i++) {
        const [ paramName, paramValues ] = sortedByValues[i]
        if (!queryBuilder.canAddParams(paramName, paramValues)) {
            throw new Error(`This library can split one query param into many HTTP requests, but it can't split more than one. You will need to do that on the client side.`)
        }
        queryBuilder.addParams(paramName, paramValues)
    }

    // Prepare everything
    queryBuilder.setCurrentAsBase()
    const [ lastParamName, lastParamValues ] = sortedByValues[sortedByValues.length - 1]
    const urls: string[] = []

    for (const value of lastParamValues) {

        // Check url length
        if (!queryBuilder.canAddParam(lastParamName, value)) {
            urls.push(queryBuilder.toString())
            queryBuilder.reset()
        }

        queryBuilder.addParam(lastParamName, value)
    }

    // Add current url one last time
    urls.push(queryBuilder.toString())

    return urls
}

/** Remove white spaces and add https if no protocol is specified */
export function sanitizeUrl(url: string): string {
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

export class QueryBuilder {

    private currentUrl: string
    private addedParam = false
    private baseAddedParam = false

    constructor(private baseUrl: string, private readonly reservedChars: number = 0) {
        this.currentUrl = baseUrl
    }

    canAddParam(paramName: string, paramValue: string) {
        return this.currentUrl.length + this.reservedChars+ paramName.length + paramValue.length + 2 < MAX_URL_LENGTH
    }

    addParam(paramName: string, paramValue: string) {
        if (!this.canAddParam(paramName, paramValue)) {
            throw new Error(`You can't add this parameter '${paramName}', since it would exceed the max url length`)
        }
        if (this.addedParam) {
            this.currentUrl += `&${paramName}=${paramValue}`
        } else {
            this.currentUrl += `?${paramName}=${paramValue}`
            this.addedParam = true
        }
    }

    canAddParams(paramName: string, paramValues: string[]) {
        const valuesLength = paramValues.reduce((accum, curr) => accum + curr.length, 0)
        const addedTotalLength = valuesLength + (paramName.length + 2) * paramValues.length
        return this.currentUrl.length + this.reservedChars + addedTotalLength < MAX_URL_LENGTH
    }

    addParams(paramName: string, paramValues: string[]) {
        for (const value of paramValues) {
            this.addParam(paramName, value)
        }
    }

    setCurrentAsBase() {
        this.baseUrl = this.currentUrl
        this.baseAddedParam = this.addedParam
    }

    reset() {
        this.currentUrl = this.baseUrl
        this.addedParam = this.baseAddedParam
    }

    toString() {
        return this.currentUrl
    }
}