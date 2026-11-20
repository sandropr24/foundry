
import "dotenv/config";
import OpenAI from "openai";
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

// 1. Conexión con Azure OpenAI
const openai = new OpenAI({
    baseURL: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY
});

const modelo = process.env.AZURE_OPENAI_DEPLOYMENT;

// 2. Base de datos simulada
const clientes = [
    { dni: "60807449", nombre: "Sandro Pachas", deuda: 450 },
    { dni: "87654321", nombre: "Alexis Torres", deuda: 0 },
    { dni: "70809010", nombre: "Marcos Quispe", deuda: 120.50 }
];

function consultarDeuda({ dni }) {
    const cliente = clientes.find(c => c.dni === dni);

    if (!cliente) return { mensaje: "Cliente no encontrado" };

    return {
        nombre: cliente.nombre,
        deuda: cliente.deuda,
        mensaje: cliente.deuda > 0
            ? `Debe S/ ${cliente.deuda.toFixed(2)}`
            : "No tiene deudas pendientes"
    };
}

function pagarDeuda({ dni, monto }) {
    const cliente = clientes.find(c => c.dni === dni);

    if (!cliente) return { mensaje: "Cliente no encontrado" };
    if (cliente.deuda <= 0) return { mensaje: "No tiene deudas" };

    if (!Number.isFinite(monto) || monto <= 0 ||
        !Number.isInteger(Math.round(monto * 100)) ||
        Math.abs(monto * 100 - Math.round(monto * 100)) > 0.000001) {
        return { mensaje: "Monto inválido" };
    }

    if (monto > cliente.deuda) {
        return { mensaje: "El monto supera la deuda pendiente" };
    }

    cliente.deuda = Math.round((cliente.deuda - monto) * 100) / 100;

    return {
        mensaje: "Pago registrado correctamente",
        pagado: monto,
        restante: cliente.deuda
    };
}

const funciones = { consultarDeuda, pagarDeuda };

const tools = Object.entries({
    consultarDeuda: {
        descripcion: "Consultar la deuda de un cliente por DNI",
        propiedades: { dni: { type: "string" } }
    },
    pagarDeuda: {
        descripcion: "Registrar un pago de deuda",
        propiedades: {
            dni: { type: "string" },
            monto: { type: "number" }
        }
    }
}).map(([name, datos]) => ({
    type: "function",
    name,
    description: datos.descripcion,
    strict: true,
    parameters: {
        type: "object",
        properties: datos.propiedades,
        required: Object.keys(datos.propiedades),
        additionalProperties: false
    }
}));

const instrucciones = `
Eres un asistente de cobranzas.
1. Primero solicita el DNI del cliente.
2. Ofrece consultar deuda o realizar un pago.
3. Utiliza las funciones para obtener información real.
4. Antes de pagar, solicita confirmación explícita del monto.
5. Nunca inventes montos ni resultados.
6. Responde en español, de forma breve y profesional.
`;

let historial = [];

async function preguntar(mensaje) {
    historial.push({ role: "user", content: mensaje });

    for (let i = 0; i < 5; i++) {
        const respuesta = await openai.responses.create({
            model: modelo,
            instructions: instrucciones,
            input: historial,
            tools
        });

        historial.push(...respuesta.output);

        const llamadas = respuesta.output.filter(
            item => item.type === "function_call"
        );

        if (!llamadas.length) {
            return respuesta.output_text || "Sin respuesta";
        }

        for (const llamada of llamadas) {
            let resultado;

            try {
                const args = JSON.parse(llamada.arguments);
                resultado = funciones[llamada.name](args);
            } catch {
                resultado = { mensaje: "Error al ejecutar la función" };
            }

            console.log(`[${llamada.name}]`, resultado);

            historial.push({
                type: "function_call_output",
                call_id: llamada.call_id,
                output: JSON.stringify(resultado)
            });
        }
    }

    return "No se pudo completar la operación";
}

const rl = readline.createInterface({ input: stdin, output: stdout });

console.log("=== ASISTENTE DE COBRANZAS ===");
console.log("Asistente: Bienvenido. Indique su DNI.");

try {
    while (true) {
        const mensaje = await rl.question("\nTú: ");

        if (mensaje.trim().toLowerCase() === "salir") break;
        if (!mensaje.trim()) continue;

        try {
            console.log("\nAsistente:", await preguntar(mensaje));
        } catch (error) {
            console.error("Error:", error.message);
        }
    }
} finally {
    rl.close();
}
