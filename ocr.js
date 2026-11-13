//Clase para manejo de errores
export class OcrError extends Error{
  constructor(message, status = 500){
    super(message)
    this.name = "OcrError"
    this.status = status
  }
}

//Delay
const sleep = (ms) => new Promise ((r)=> setTimeout(r, ms)) 

//variables
const config = () => ({
  endpoint:process.env.DI_ENDPOINT,
  key:process.env.DI_KEY,
  apiVersion:process.env.DI_API_VERSION || "2024-11-30",
  model: process.env.DI_MODEL || "prebuild-read"
})


//Manejador de errores - clasificacion code HTTP
async function fallo(res, contexto){
  const detalle = await res.text()
  console.error (`Error en AZURE: ${contexto} ${res.status} - descripcion: ${detalle}`)

  //Analizando
  if(res.status === 401 || res.status === 403){
    return new OcrError("Azure rechazo las credenciales - verifique KEY y ENDPOINT" , 502 )
  }

  if(res.status === 404){
    return new OcrError("Ruta no encontrada en Azure, verifique ENDPINT" , 502 )
  }

  if(res.status === 429){
    return new OcrError("Se alacanzó el limite de peticiones en el servidor" , 429 )
  }

  if(res.status ===400 || res.status === 413){
    return new OcrError("Azure no puede encontrar el archivo. Verifique tamaño", 400)
  }
  return new OcrError("Azure devolvio un error inesperado", 502)
}

//No es necesario guardar el PDF de manera fisica (buffer = memoria)
async function leerPDF(buffer){
  //  Necesitamos los parametros de conexion -> config()

  const {endpoint,key,apiVersion,model} = config()

  //1.Enviar el pdf
  const url = `${endpoint}/documentintelligence/documentModels/${model}:analize?api-version=${apiVersion}`
  const res = await fetch(url, {
    method: "POST",
    headers:{
      "Ocp-Apim-Subscription-Key":key,
      "Content-Type": "application/pdf"
    },
    body: buffer
  })

  if(res.status !== 202){
    throw await fallo(res, "Envío")
  }

  //En caso tengamos exito....}
  const operationUrl = res.headers.get('operation-location')

  //2. Consulta (polling) hasta que termine 
  for (let intento = 0; intento < 60; intento++){
    const r = await fetch(operationUrl, {
      headers: {"Ocp-Apim-Subscription-Key":key}
    })


    //Se genero un error durante la consulta de datos OCR (lectura)
    if(!r.ok){
      throw await fallo(r, "Consulta")
    }

    const data = await r.json()

    //Funciono correctamente
    if(data.status === 'succeeded') return formatear(data.analyzeResult)
    

    if(data.status === 'failed'){
      console.error(`Azure, analisis de datos pendiente o con errores:`, JSON.stringify(data.error))
      throw new OcrError('Azure no puede analizar el documento', 502)
    }


    const espera = Number(r.headers.get("retry-after")) || 2
    await sleep(espera * 1000) //sleep(milisegundos)
  }

  throw new OcrError("Tiempo en espera agotado al analizar el documento", 504)

}

//retorne solo la parte necesaroa del JSON que se obtiene AZURE
function formatear(analisis){
  //Obtener el numero de paginas + texto
  const paginas = (analisis.pages  ?? []).map((p) => ({
    numero:p.pageNumber,
    lines:(p.lines ?? []).map((l) => l.content)
  }));

  //Retornar como JSON
  return {
    texto: analisis.content ?? "",
    totalPaginas: paginas.length,
    paginas
  }
}