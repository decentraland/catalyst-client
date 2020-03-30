import FormData from "form-data"

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
        } else if (typeof model[propertyName] === 'object' && !(model[propertyName] instanceof File)) {
            convertModelToFormData(model[propertyName], form, formKey)
        } else {
            form.append(formKey, model[propertyName].toString())
        }
    }
    return form
}