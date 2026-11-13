import "dotenv/config"
import express from "express"
import multer from "multer"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { leerPDF, OcrError } from "./ocr.js"
import { error } from "node:console"

//directorio donde desplegamos frontend
//Carpeta absoluta independiente Windows / Linux / Mac
const __dirname = path.dirname(fileURLToPath(import.meta.url))

//Puerto del servidor 
const PORT = process.env.PORT || 3000

//Constante tamaño maximo de archivo PDF
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 4 

//Validación que garantice que tenemos las claves para AZURE
for (const nombre of ["DI_ENDPOINT", "DI_KEY"]){
  if (!process.env[nombre]){
    console.error(`Falta ${nombre}. Revisa tu archivo .env`)
    process.exit(1)
  }
}

//Servidor 
const app = express()

//Configuracion multer (subir binarios)
//MAX_FILE_MB * kb * mb
const upload = multer ({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files :1},
  fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf'){
      return cb(null, true)
    }
    cb(new OcrError("El archivo debe ser un PDF", 400))
  }
})

//Servirel frotend 
app.use(express.static(path.join(__dirname, "public")))

//Sugerencia: colocar un "controlador", utilizar archivo "routes"
//Metodo POST para recibir archivos 
app.post('/api/ocr', upload.single("archivo"), async(req ,res, next) => {
  try{
    if(!req.file) throw new OcrError("Seleccione un pdf para continuar", 400)
    res.json(await leerPDF(req.file.buffer))
  }catch(e){
    next(e)
  }
})

//Manejo de errores centralizado
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError){
    const message =
      err.code === 'LIMIT_FILE_SIZE' 
      ? 'El PDF supera el límite permitido'
      : 'No se pudo procesar el archivo'
    
    return res.status(400).json({ error: message})
  }

  if(err instanceof OcrError){
    return res.status(err.status).json({ error: err.message })
  }

  console.error(err)
  res.status(500).json({
    error: 'Error interno del servidor'
  })
})

app.listen(PORT, () => {
  console.log(`Aplicación ejecutándose en http://localhost:${PORT}`)
})