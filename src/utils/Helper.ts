require('isomorphic-form-data');

export function convertModelToFormData(model: any, form: FormData = new FormData(), namespace = ''): FormData {
    for (let propertyName in model) {
        if (!model.hasOwnProperty(propertyName) || !model[propertyName]) continue
        let formKey = namespace ? `${namespace}[${propertyName}]` : propertyName
        if (model[propertyName] instanceof Date) {
            form.append(formKey, model[propertyName].toISOString())
        } else if (model[propertyName] instanceof Array) {
            model[propertyName].forEach((element: any, index: number) => {
                const tempFormKey = `${formKey}[${index}]`
                convertModelToFormData(element, form, tempFormKey)
            })
        } else if (typeof model[propertyName] === 'object') {
            convertModelToFormData(model[propertyName], form, formKey)
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
    // Remove duplicates
    const withoutDuplicates: string[] = removeDuplicates(values)

    const urls: string[] = []
    let currentUrl = baseUrl + basePath
    let started = false
    for (const value of withoutDuplicates) {
        // Check url length
        const lengthWithNewValue = currentUrl.length + queryParamName.length + value.length + 2
        if (lengthWithNewValue >= MAX_URL_LENGTH) {
            // If maximum was exceeded, then store the current url and start over
            urls.push(currentUrl)
            currentUrl = baseUrl + basePath
            started = false
        }

        // Check if this is the first query param or not
        if (started) {
            currentUrl += `&${queryParamName}=${value}`
        } else {
            currentUrl += `?${queryParamName}=${value}`
            started = true
        }
    }

    // Add current url one last time
    urls.push(currentUrl)

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