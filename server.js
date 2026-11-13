import "dotenv/config"
import express from "express"
import multer from "multer"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { leerPDF , OcrError } from "./ocr.js"

// Directorio donde desplegamos fronted
const _dirname = path.dirname(fileURLToPath(import.meta.url))

//Puerto del servidor
const PORT = process.env.PORT || 3000

//Constante tamaño maximo de archivo PDF
const MAX_FILE_MB = Number(process.env.MAX_FILE_MB) || 4

//Validación que garantice que tenemos las claves para AZURE
for(const nombre of [ "DIR_ENPOINT" , "DI_KEY"]){
  if(!process.env[nombre]){
    console.error(`Falta ${nombre}. Revisa tu archivo .env`)
    process.exit(1)
  }
}

//servidor
const app = express()

//configuracion de multer (subir binarios)
//MAX_FILE_MB * KB * MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files:1},
  fileFilter(req, file, cb){
    if(file.mimetype === 'aplication/pdf'){
      return cb(null, true)
    }
    cb(new OcrError("El archivo debe ser un PDF", 400))
  }
})


//Servir el fronted
app.use(express.static(path.join(_dirname, "public")))

//Metodo POST para recibir archivos
app.post('/api/ocr' , upload.single("archivo"), async(req, res, next) =>{
  try{
    if(!req.file) throw new OcrError("Selecione un PDF para continuar", 400)
      res.json(await leerPDF(req.file.buffer))
  }catch(e){
    next(e)
  }
})

//Manejo de errores centralizado
app.use((err,req,res,next) => {
  if(err instanceof multer.MulterError){
    const message = 
      err.code === 'LIMIT_FILE_SIZE' 
      ?'El PDF supera el limite permitido'
      :'No se pudo procesar el archivo'
  
      return res.status(400).json({error: message})
  }

  if(err instanceof OcrError){
    return res.status(err.status).json({error: err.message})
  }

  console.error(err)
  res.status(500).json({
    error: 'Error interno del servidor'
  })
})

app.listen(PORT, () => {
  console.log(`Aplicación ejecutandose en htpp://localhost:${PORT}`)
})