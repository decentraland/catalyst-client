import FormData from 'isomorphic-form-data';


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