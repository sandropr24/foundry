import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const rl = readline.createInterface({ input, output });

console.log("=== ANALIZADOR INTELIGENTE DE TEXTOS ===");
console.log("Escribe salir para finalizar");

while (true) {
    const texto = await rl.question("\nTu: ");

    if (texto.trim().toLowerCase() === "salir") break;
    if (!texto.trim()) continue;

    try {
          const respuesta = await fetch("http://localhost:3001/api/clasificar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ texto })
          });

        const datos = await respuesta.json();

        if (!respuesta.ok) {
            console.log(datos.error);
            continue;
        }

        console.log("\n--- RESULTADO DEL ANALISIS ---");
        console.log(datos.analisis.replace(/\*\*/g, ""));

    } catch {
        console.log("Error de conexion con el servidor");
    }
}

rl.close();