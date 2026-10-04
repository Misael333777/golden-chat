// Único punto de configuración de la página Golden (PRODUCCIÓN).
// Conexión: GOLDEN - Web API PROD. Origen permitido por CORS en el webhook: https://goldenpanificadora.com (y www).
export const GATEWAY_URL = 'https://fibotehc.app.n8n.cloud/webhook/golden-web-api-prod';
export const ENTORNO = 'PROD';
// Timeout de cliente. Si vence en una escritura, la operación queda "sin confirmar" y se reintenta con el MISMO operacion_id.
export const TIMEOUT_MS = 20000;
