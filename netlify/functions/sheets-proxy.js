// netlify/functions/sheets-proxy.js
// VERSIÓN OPTIMIZADA PARA TIMEOUTS LARGOS

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzV9HNAL9wXwSNpPOfe9djjPY0XjnEjwsn3CNOw0aiUB3Pi9NVXDn5xPFQs1CweXNO4/exec';
const TIMEOUT_MS = 45000; // 45 segundos (aumentado de 25s)
const MAX_RETRIES = 2;

exports.handler = async (event, context) => {
    // Headers CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Manejar preflight OPTIONS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        console.log(`[PROXY] === NUEVA PETICIÓN ${new Date().toISOString()} ===`);
        console.log(`[PROXY] Método: ${event.httpMethod}`);
        
        let requestData;
        
        if (event.httpMethod === 'GET') {
            const action = event.queryStringParameters?.action;
            if (!action) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Action parameter required'
                    })
                };
            }
            
            requestData = {
                action: action,
                ...event.queryStringParameters
            };
            
        } else if (event.httpMethod === 'POST') {
            try {
                requestData = JSON.parse(event.body || '{}');
            } catch (e) {
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid JSON in request body'
                    })
                };
            }
        }

        if (!requestData?.action) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Action parameter required'
                })
            };
        }

        console.log(`[PROXY] Procesando acción: ${requestData.action}`);
        
        // DETECCIÓN ESPECIAL PARA OPERACIONES LARGAS
        const isLongOperation = [
            'saveAttendance',
            'saveGroupReposition',
            'createClassRecord'
        ].includes(requestData.action);
        
        const operationTimeout = isLongOperation ? 60000 : TIMEOUT_MS; // 60s para operaciones de guardado
        
        console.log(`[PROXY] Timeout configurado: ${operationTimeout}ms para ${requestData.action}`);

        // Función de retry con backoff exponencial
        const makeRequestWithRetry = async (attempt = 1) => {
            console.log(`[PROXY] Intento ${attempt}/${MAX_RETRIES + 1} para ${requestData.action}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                console.log(`[PROXY] Timeout alcanzado (${operationTimeout}ms) en intento ${attempt}`);
                controller.abort();
            }, operationTimeout);

            try {
                const response = await fetch(GOOGLE_SCRIPT_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestData),
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                console.log(`[PROXY] Respuesta recibida: ${response.status} en ${new Date().toISOString()}`);

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error(`[PROXY] Error HTTP ${response.status}: ${errorText.substring(0, 200)}`);
                    
                    // Retry para errores específicos
                    if ([502, 503, 504].includes(response.status) && attempt <= MAX_RETRIES) {
                        const delay = Math.pow(2, attempt) * 1000; // Backoff exponencial
                        console.log(`[PROXY] Reintentando en ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return makeRequestWithRetry(attempt + 1);
                    }
                    
                    throw new Error(`Google Apps Script HTTP ${response.status}: ${errorText.substring(0, 100)}`);
                }

                const responseText = await response.text();
                console.log(`[PROXY] Respuesta exitosa (${responseText.length} chars)`);

                // Verificar JSON válido
                try {
                    const jsonData = JSON.parse(responseText);
                    return {
                        statusCode: 200,
                        headers,
                        body: responseText
                    };
                } catch (e) {
                    console.error('[PROXY] JSON inválido:', responseText.substring(0, 200));
                    throw new Error(`Invalid JSON from Google Apps Script: ${e.message}`);
                }

            } catch (fetchError) {
                clearTimeout(timeoutId);
                
                if (fetchError.name === 'AbortError') {
                    console.error(`[PROXY] Timeout después de ${operationTimeout}ms en intento ${attempt}`);
                    
                    // Retry para timeouts
                    if (attempt <= MAX_RETRIES) {
                        const delay = Math.pow(2, attempt) * 1000;
                        console.log(`[PROXY] Reintentando después de timeout en ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        return makeRequestWithRetry(attempt + 1);
                    }
                    
                    return {
                        statusCode: 504,
                        headers,
                        body: JSON.stringify({
                            success: false,
                            error: `Request timeout after ${operationTimeout}ms (tried ${attempt} times)`,
                            action: requestData.action,
                            suggestion: 'Try again - Google Apps Script may be busy'
                        })
                    };
                }

                console.error(`[PROXY] Error de fetch en intento ${attempt}:`, fetchError.message);
                
                // Retry para errores de red
                if (attempt <= MAX_RETRIES && 
                    (fetchError.message.includes('fetch') || 
                     fetchError.message.includes('network') ||
                     fetchError.message.includes('ECONNRESET'))) {
                    const delay = Math.pow(2, attempt) * 1000;
                    console.log(`[PROXY] Reintentando después de error de red en ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return makeRequestWithRetry(attempt + 1);
                }
                
                throw fetchError;
            }
        };

        // Ejecutar con retry
        return await makeRequestWithRetry();

    } catch (error) {
        console.error('[PROXY] Error general:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Proxy internal error',
                details: error.message,
                timestamp: new Date().toISOString()
            })
        };
    }
};
