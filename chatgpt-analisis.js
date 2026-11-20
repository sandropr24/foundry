import OpenAI from "openai";
import fs from "node:fs"

/* ANALISIS DE ARCHIVO UTILIZANDO MODELO CHATGPT 5.4-MINI */

const endpoint = ""
const deploymentName = ""
const apiKey = ""

const openai = new OpenAI({
  baseURL: endpoint,
  apiKey:apiKey
})



//Acceder al archivoi que analizaremos
const imagenBase64 = fs.readFileSync("caballero.png").toString("base64")

const pregunta= "¿Que personaje de que anime vez? , indicame el nombre del personaje"


const res = await openai.responses.create({
  model: deploymentName,
  instructions: "Responde siempre en eespañol",
  input: [
    {
      role:"user",
      content: [
        { type: "input_text" , text: pregunta},
        { type: "input_image" , image_url: `data:image/png;base64,${imagenBase64}`}
      ]
    }
  ]
})

console.log(res.output_text)