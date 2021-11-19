// TODO: move this helper to well-known-components

import { IHttpServerComponent } from '@well-known-components/interfaces'
import busboy from 'busboy'

export type FormDataContext = IHttpServerComponent.DefaultContext & {
  formData: {
    fields: Record<
      string,
      {
        fieldname: string
        value: string
        encoding: string
        mimetype: string
      }
    >
    files: Record<
      string,
      {
        filename: string
        fieldname: string
        value: Buffer
        encoding: string
        mimetype: string
      }
    >
  }
}

export function multipartParserWrapper<Ctx extends FormDataContext, T extends IHttpServerComponent.IResponse>(
  handler: (ctx: Ctx) => Promise<T>
): (ctx: IHttpServerComponent.DefaultContext) => Promise<T> {
  return async function (ctx): Promise<T> {
    const formDataParser = new busboy({
      headers: {
        'content-type': ctx.request.headers.get('content-type')
      }
    })

    const fields: FormDataContext['formData']['fields'] = {}
    const files: FormDataContext['formData']['files'] = {}

    const finished = new Promise((ok, err) => {
      formDataParser.on('error', err)
      formDataParser.on('finish', ok)
    })

    formDataParser.on('field', function (fieldname, value, _fieldnameTruncated, _valTruncated, encoding, mimetype) {
      fields[fieldname] = {
        fieldname,
        value,
        encoding,
        mimetype
      }
    })
    formDataParser.on('file', function (fieldname, file, filename, encoding, mimetype) {
      const chunks: any[] = []
      file.on('data', function (data) {
        console.log('File [' + fieldname + '] got ' + data.length + ' bytes')
        chunks.push(data)
      })
      file.on('end', function () {
        console.log('File [' + fieldname + '] Finished')
        files[fieldname] = {
          filename,
          fieldname,
          value: Buffer.concat(chunks),
          encoding,
          mimetype
        }
      })
    })

    ctx.request.body.pipe(formDataParser)

    const newContext: Ctx = Object.assign(Object.create(ctx), { formData: { fields, files } })

    await finished

    return handler(newContext)
  }
}
