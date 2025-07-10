// netlify/functions/sheets-proxy.js
// Función proxy para evitar errores CORS con Google Apps Script

const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzBgo0McjCj4JFJ0LoZwfBAv1NqnQ9GmymHgNq3xELCnnbKNK7gJSWXDO91KgEScuzY/exec';
const TIMEOUT_MS = 25000; // 25 segundos

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
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        console.log(`[PROXY] Método: ${event.httpMethod}`);
        console.log(`[PROXY] Headers:`, event.headers);
        
        let requestData;
        
        if (event.httpMethod === 'GET') {
            // Para GET, convertir query parameters
            const action = event.queryStringParameters?.action;
            requestData = {
                action,
                ...event.queryStringParameters
            };
            //delete requestData.action; // Evitar duplicado
            requestData.action = action; // Asegurar que action esté al inicio
            
        } else if (event.httpMethod === 'POST') {
            // Para POST, usar el body
            try {
                requestData = JSON.parse(event.body || '{}');
            } catch (e) {
                console.error('[PROXY] Error parsing POST body:', e);
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
                    error: 'Action parameter is required'
                })
            };
        }

        console.log(`[PROXY] Action: ${requestData.action}`);
        console.log(`[PROXY] Request data:`, JSON.stringify(requestData, null, 2));

        // Timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, TIMEOUT_MS);

        try {
            console.log(`[PROXY] Enviando request a Google Apps Script...`);
            
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST', // Siempre POST para Apps Script
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            console.log(`[PROXY] Respuesta recibida: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[PROXY] Apps Script error: ${response.status} - ${errorText}`);
                
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: `Google Apps Script error: ${response.status}`,
                        details: errorText.substring(0, 500)
                    })
                };
            }

            const responseText = await response.text();
            console.log(`[PROXY] Respuesta exitosa, tamaño: ${responseText.length} caracteres`);

            // Verificar que sea JSON válido
            try {
                const jsonData = JSON.parse(responseText);
                console.log(`[PROXY] JSON válido recibido`);
                
                return {
                    statusCode: 200,
                    headers,
                    body: responseText // Devolver el JSON tal como viene
                };
                
            } catch (e) {
                console.error('[PROXY] Respuesta no es JSON válido:', responseText.substring(0, 200));
                
                // Si no es JSON, intentar crear respuesta de error estructurada
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid JSON response from Google Apps Script',
                        details: responseText.substring(0, 200)
                    })
                };
            }

        } catch (fetchError) {
            clearTimeout(timeoutId);
            
            if (fetchError.name === 'AbortError') {
                console.error(`[PROXY] Timeout después de ${TIMEOUT_MS}ms`);
                return {
                    statusCode: 504,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: `Request timeout after ${TIMEOUT_MS}ms`,
                        action: requestData.action
                    })
                };
            }

            console.error('[PROXY] Fetch error:', fetchError);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Failed to connect to Google Apps Script',
                    details: fetchError.message
                })
            };
        }

    } catch (error) {
        console.error('[PROXY] General error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                success: false,
                error: 'Internal proxy error',
                details: error.message
            })
        };
    }
};
