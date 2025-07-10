// netlify/functions/sheets-proxy.js
// Función proxy mejorada con mejor manejo de errores y debugging

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
        console.log(`[PROXY] === NUEVA PETICIÓN ===`);
        console.log(`[PROXY] Método: ${event.httpMethod}`);
        console.log(`[PROXY] Query params:`, event.queryStringParameters);
        console.log(`[PROXY] Body length: ${event.body ? event.body.length : 0}`);
        
        let requestData;
        
        if (event.httpMethod === 'GET') {
            // Para GET, usar query parameters
            const action = event.queryStringParameters?.action;
            
            if (!action) {
                console.error('[PROXY] No action in GET request');
                return {
                    statusCode: 400,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Action parameter is required in GET request'
                    })
                };
            }
            
            requestData = {
                action: action,
                ...event.queryStringParameters
            };
            
            console.log(`[PROXY] GET request data:`, requestData);
            
        } else if (event.httpMethod === 'POST') {
            // Para POST, usar el body
            try {
                requestData = JSON.parse(event.body || '{}');
                console.log(`[PROXY] POST request data:`, requestData);
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
            console.error('[PROXY] No action in request data:', requestData);
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    success: false,
                    error: 'Action parameter is required'
                })
            };
        }

        console.log(`[PROXY] Processing action: ${requestData.action}`);
        
        // Validar acciones conocidas
        const validActions = [
            'getGroups', 'getTodayGroups', 'getStudents', 'getStudentsByGroup',
            'getProfessors', 'getAssistants', 'getGroupByCode', 'checkClassExists',
            'getSpreadsheetInfo', 'testConnection', 'saveAttendance', 'createClassRecord'
        ];
        
        if (!validActions.includes(requestData.action)) {
            console.warn(`[PROXY] Acción desconocida: ${requestData.action}`);
            // Continuar de todos modos, dejar que Apps Script maneje el error
        }

        // Preparar request para Apps Script
        const appsScriptPayload = {
            action: requestData.action,
            ...requestData
        };

        // Remover duplicados
        if (appsScriptPayload.action && requestData.action && appsScriptPayload.action === requestData.action) {
            // OK, no hay duplicados
        }

        console.log(`[PROXY] Enviando a Apps Script:`, JSON.stringify(appsScriptPayload, null, 2));

        // Timeout controller
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, TIMEOUT_MS);

        try {
            const response = await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST', // Siempre POST para Apps Script
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(appsScriptPayload),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            console.log(`[PROXY] Apps Script response status: ${response.status}`);
            console.log(`[PROXY] Apps Script response headers:`, Object.fromEntries(response.headers.entries()));

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[PROXY] Apps Script HTTP error: ${response.status} - ${errorText}`);
                
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: `Google Apps Script HTTP error: ${response.status}`,
                        details: errorText.substring(0, 500),
                        action: requestData.action
                    })
                };
            }

            const responseText = await response.text();
            console.log(`[PROXY] Apps Script response length: ${responseText.length} chars`);
            console.log(`[PROXY] Apps Script response preview:`, responseText.substring(0, 200));

            // Verificar que sea JSON válido
            try {
                const jsonData = JSON.parse(responseText);
                console.log(`[PROXY] Valid JSON response`);
                console.log(`[PROXY] Response success:`, jsonData.success);
                
                if (!jsonData.success) {
                    console.warn(`[PROXY] Apps Script returned success=false:`, jsonData.error);
                }
                
                return {
                    statusCode: 200,
                    headers,
                    body: responseText
                };
                
            } catch (e) {
                console.error('[PROXY] Invalid JSON response from Apps Script');
                console.error('[PROXY] Raw response:', responseText);
                
                return {
                    statusCode: 502,
                    headers,
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid JSON response from Google Apps Script',
                        details: responseText.substring(0, 200),
                        action: requestData.action
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
                    details: fetchError.message,
                    action: requestData.action
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
