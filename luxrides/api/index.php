<?php
// LuxRides API Proxy — reenvía todas las peticiones /api/* a backend Node.js en :8787
// No cachear respuestas del proxy
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$backendBase = 'http://127.0.0.1:8787';

// Construir la ruta relativa: /api/chat -> /api/chat
$requestUri = $_SERVER['REQUEST_URI'] ?? '/api/';
// Eliminar query string para separarlo
$parsedUrl   = parse_url($requestUri);
$path        = $parsedUrl['path'] ?? '/api/';
$queryString = $parsedUrl['query'] ?? '';
$targetUrl   = $backendBase . $path . ($queryString ? '?' . $queryString : '');

// Método
$method = $_SERVER['REQUEST_METHOD'];

// Leer body de la petición original
$body = file_get_contents('php://input');

// Recopilar headers relevantes
$headersIn = [];
foreach ($_SERVER as $k => $v) {
    if (strncmp($k, 'HTTP_', 5) === 0) {
        $name = str_replace('_', '-', substr($k, 5));
        if (in_array(strtolower($name), ['content-type', 'authorization', 'accept', 'origin', 'x-requested-with'])) {
            $headersIn[] = $name . ': ' . $v;
        }
    }
}
if (isset($_SERVER['CONTENT_TYPE'])) {
    $headersIn[] = 'Content-Type: ' . $_SERVER['CONTENT_TYPE'];
}

// Ejecutar petición con cURL
$ch = curl_init($targetUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST  => $method,
    CURLOPT_POSTFIELDS     => ($body !== false && strlen($body) > 0) ? $body : null,
    CURLOPT_HTTPHEADER     => $headersIn,
    CURLOPT_TIMEOUT        => 20,
    CURLOPT_CONNECTTIMEOUT => 5,
    CURLOPT_HEADER         => true,
    CURLOPT_FOLLOWLOCATION => false,
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$curlError  = curl_error($ch);
curl_close($ch);

if ($response === false || $curlError) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode(['ok' => false, 'error' => 'Backend no disponible: ' . $curlError]);
    exit;
}

// Separar headers de body
$responseHeaders = substr($response, 0, $headerSize);
$responseBody    = substr($response, $headerSize);

// Reenviar headers del backend (solo los relevantes)
http_response_code($httpCode ?: 502);
foreach (explode("\r\n", $responseHeaders) as $line) {
    $lc = strtolower($line);
    if (strncmp($lc, 'content-type:', 13) === 0 ||
        strncmp($lc, 'access-control-', 15) === 0) {
        header($line, false);
    }
}

echo $responseBody;
