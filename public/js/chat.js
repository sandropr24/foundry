const formulario = document.getElementById('formulario');
const pregunta = document.getElementById('pregunta');
const mensajes = document.getElementById('mensajes');
const enviar = document.getElementById('enviar');
const nuevo = document.getElementById('nuevo');


let historial = [];
let procesando = false;
let version = 0;
let abortController = null;


function mostrar(texto, clase) {
    const div = document.createElement('div');
    div.className = `mensaje ${clase}`;
    div.textContent = texto;
    
    mensajes.appendChild(div);
    mensajes.scrollTop = mensajes.scrollHeight;
    
    return div;
}

function alternarEstadoFormulario(deshabilitado) {
    procesando = deshabilitado;
    enviar.disabled = deshabilitado;
    pregunta.disabled = deshabilitado;
}


async function preguntarIA(texto) {
    texto = texto.trim();
    if (!texto || procesando || texto.length > 2000) return;

    const actual = version;
    alternarEstadoFormulario(true);
    
    document.querySelector('.bienvenida')?.remove();
    mostrar(texto, 'usuario');
    const salida = mostrar('Pensando...', 'ia');
    
    abortController = new AbortController();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                pregunta: texto, 
                historial: historial.slice(-10) 
            }),
            signal: abortController.signal
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error del servidor');
        if (actual !== version) return;

        salida.textContent = data.respuesta;
        historial.push(
            { role: 'user', content: texto }, 
            { role: 'assistant', content: data.respuesta }
        );
        historial = historial.slice(-10);

    } catch (err) {
        if (actual === version && err.name !== 'AbortError') {
            salida.textContent = `Error: ${err.message}`;
            salida.classList.add('error');
        }
    } finally {
        if (actual === version) {
            alternarEstadoFormulario(false);
            abortController = null;
            pregunta.focus();
        }
    }
}


formulario.addEventListener('submit', (e) => {
    e.preventDefault();
    if (procesando) return;

    const texto = pregunta.value.trim();
    if (!texto) return;

    pregunta.value = '';
    preguntarIA(texto);
});

document.querySelectorAll('[data-pregunta]').forEach((boton) => {
    boton.addEventListener('click', () => preguntarIA(boton.dataset.pregunta));
});

nuevo.addEventListener('click', () => {
    version++;
    abortController?.abort();
    historial = [];
    
    alternarEstadoFormulario(false);
    mensajes.replaceChildren();
    
    mostrar('Nueva conversación. ¿Qué deseas aprender sobre la Historia del Perú?', 'ia');
    pregunta.focus();
});