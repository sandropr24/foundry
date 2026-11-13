
 // Clase para manejo de errores
export class OcrError extends Error {
    constructor(message, status = 500) {
        super(message)
        this.name = "OcrError"
        this.status = status
    }
}

// Delay
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Variables de configuración
const config = () => ({
    endpoint: process.env.DI_ENDPOINT?.replace(/\/+$/, ""),
    key: process.env.DI_KEY,
    apiVersion: process.env.DI_API_VERSION || "2024-11-30",
    model: process.env.DI_MODEL || "prebuilt-read"
})

// Manejador de errores HTTP
export async function fallo(res, contexto) {
    const detalle = await res.text()

    console.error(`Error en AZURE: ${contexto} ${res.status} - descripcion: ${detalle}`)

    if (res.status === 401 || res.status === 403) {
        return new OcrError("Azure rechazó las credenciales. Verifique KEY y ENDPOINT", 502)
    }

    if (res.status === 404) {
        return new OcrError("Ruta no encontrada en Azure. Verifique ENDPOINT", 502)
    }

    if (res.status === 429) {
        return new OcrError("Se alcanzó el límite de peticiones en el servidor", 429)
    }

    if (res.status === 400 || res.status === 413) {
        return new OcrError("Azure rechazó el archivo PDF. Verifique su formato y tamaño", 400)
    }

    return new OcrError("Azure devolvió un error inesperado", 502)
}

// No es necesario guardar el PDF físicamente (buffer = memoria)
export async function leerPDF(buffer) {
    // Obtener parámetros de conexión
    const { endpoint, key, apiVersion, model } = config()

    // Validar configuración
    if (!endpoint || !key) {
        throw new OcrError("Falta configurar ENDPOINT o KEY de Azure", 500)
    }

    let endpointUrl

    try {
        endpointUrl = new URL(endpoint)

        if (endpointUrl.protocol !== "https:") {
            throw new Error("Protocolo inválido")
        }
    } catch {
        throw new OcrError("DI_ENDPOINT debe ser una URL HTTPS válida", 500)
    }

    // Validar archivo PDF
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new OcrError("El archivo PDF está vacío o es inválido", 400)
    }

    // 1. Enviar el PDF
    const url = `${endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=${apiVersion}`

    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Ocp-Apim-Subscription-Key": key,
            "Content-Type": "application/pdf"
        },
        body: buffer,
        signal: AbortSignal.timeout(30000)
    })

    if (res.status !== 202) {
        throw await fallo(res, "Envío")
    }

    // Obtener URL de operación
    const operationUrl = res.headers.get("operation-location")

    if (!operationUrl) {
        throw new OcrError("Azure no devolvió la URL de operación", 502)
    }

    // Verificar que la URL corresponda al servicio de Azure configurado
    let consultaUrl

    try {
        consultaUrl = new URL(operationUrl)

        if (consultaUrl.protocol !== "https:" ||
            consultaUrl.origin !== endpointUrl.origin) {
            throw new Error("Origen inválido")
        }
    } catch {
        throw new OcrError("Azure devolvió una URL de operación inválida", 502)
    }

    // 2. Consultar (polling) hasta que termine
    for (let intento = 0; intento < 60; intento++) {
        const r = await fetch(consultaUrl, {
            headers: {
                "Ocp-Apim-Subscription-Key": key
            },
            signal: AbortSignal.timeout(30000)
        })

        // Error durante la consulta OCR
        if (!r.ok) {
            throw await fallo(r, "Consulta")
        }

        const data = await r.json()

        // Análisis completado correctamente
        if (data.status === "succeeded") {
            if (!data.analyzeResult) {
                throw new OcrError("Azure devolvió un resultado vacío", 502)
            }

            return formatear(data.analyzeResult)
        }

        // Error durante el análisis
        if (data.status === "failed" || data.status === "canceled") {
            console.error("Azure no pudo analizar el documento:", data.error)
            throw new OcrError("Azure no pudo analizar el documento", 502)
        }

        if (data.status !== "running" && data.status !== "notStarted") {
            throw new OcrError("Azure devolvió un estado desconocido", 502)
        }

        // Tiempo entre consultas
        const retryAfter = Number(r.headers.get("retry-after"))
        const espera = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(retryAfter, 10)
            : 2

        await sleep(espera * 1000)
    }

    throw new OcrError("Tiempo de espera agotado al analizar el documento", 504)
}

// Retornar solo los datos necesarios del JSON de Azure
function formatear(analisis) {
    // Obtener número de páginas y texto
    const paginas = (analisis.pages ?? []).map((p) => ({
        numero: p.pageNumber,
        lines: (p.lines ?? []).map((l) => l.content)
    }))

    // Retornar JSON
    return {
        texto: analisis.content ?? "",
        totalPaginas: paginas.length,
        paginas
    }
}
