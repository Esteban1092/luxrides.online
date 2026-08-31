<?php
// LuxRides API Proxy
// - En Hostinger: reenvia a Node local (127.0.0.1:8787)
// - En Vercel: reenvia al backend de produccion en luxrides.online
// No cachear respuestas del proxy
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

$envFirst = function(array $names, string $fallback = ''): string {
    foreach ($names as $name) {
        $value = getenv($name);
        if (is_string($value) && trim($value) !== '') {
            return rtrim(trim($value), '/');
        }
    }
    return $fallback;
};

$isVercel = getenv('VERCEL') || getenv('VERCEL_ENV') || (isset($_SERVER['SERVER_SOFTWARE']) && stripos((string)$_SERVER['SERVER_SOFTWARE'], 'Vercel') !== false);
$backendCandidates = [];

$configuredUpstream = $envFirst([
    'BACKEND_UPSTREAM_URL',
    'LUXRIDES_BACKEND_URL',
    'BACKEND_URL',
    'NODE_BACKEND_URL'
], 'https://luxrides-online.onrender.com');
if ($configuredUpstream !== '') {
    $backendCandidates[] = $configuredUpstream;
}

if ($isVercel) {
    // En Vercel se usa backend publico.
    $backendCandidates[] = 'https://luxrides-online.onrender.com';
} else {
    // En Hostinger se usa Render como backend estable.
    $backendCandidates[] = 'https://luxrides-online.onrender.com';
    $backendCandidates[] = 'http://127.0.0.1:8787';
    $backendCandidates[] = 'http://localhost:8787';
}

$backendCandidates = array_values(array_unique(array_filter($backendCandidates, function ($value) {
    return is_string($value) && trim($value) !== '';
})));

// Construir la ruta relativa: /api/chat -> /api/chat
// En Vercel, vercel.json manda /api/* a /api/index.php?path=*
$requestUri = $_SERVER['REQUEST_URI'] ?? '/api/';
$parsedUrl = parse_url($requestUri);
$queryString = $parsedUrl['query'] ?? '';

$rewritePath = isset($_GET['path']) ? trim((string)$_GET['path']) : '';
$path = $rewritePath !== '' ? '/api/' . ltrim($rewritePath, '/') : ($parsedUrl['path'] ?? '/api/');

// Evitar duplicar parametro interno de rewrite al reenviar
if ($queryString !== '') {
    parse_str($queryString, $params);
    unset($params['path']);
    $queryString = http_build_query($params);
}

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

// Ejecutar petición con cURL probando varios upstreams en orden.
$response = false;
$httpCode = 0;
$headerSize = 0;
$curlError = '';
$lastTargetUrl = '';

foreach ($backendCandidates as $backendBase) {
    $targetUrl = rtrim($backendBase, '/') . $path . ($queryString ? '?' . $queryString : '');
    $lastTargetUrl = $targetUrl;

    $ch = curl_init($targetUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_POSTFIELDS     => ($body !== false && strlen($body) > 0) ? $body : null,
        CURLOPT_HTTPHEADER     => $headersIn,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 4,
        CURLOPT_HEADER         => true,
        CURLOPT_FOLLOWLOCATION => false,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
    $curlError  = curl_error($ch);
    curl_close($ch);

    if ($response !== false && !$curlError) {
        break;
    }
}

if ($response === false || $curlError) {
    http_response_code(502);
    header('Content-Type: application/json');
    echo json_encode([
        'ok' => false,
        'error' => 'Backend no disponible: ' . $curlError,
        'tried' => $backendCandidates,
        'hint' => 'Levanta el proceso Node en el puerto 8787 o define BACKEND_UPSTREAM_URL con un backend accesible.'
    ]);
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
