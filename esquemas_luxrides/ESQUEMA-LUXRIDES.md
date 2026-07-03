# LUXRIDES — Esquema de Arquitectura y Flujos

## 1. Arquitectura General

```mermaid
graph TD
    subgraph CLIENTE["📱 Usuario Final"]
        A[Navegador Web]
    end

    subgraph FRONTEND["🌐 Frontend — luxrides.online"]
        SAS["sas.html\nApp Clientes\n(reservas, pago, mapa)"]
        SES["ses.html\nApp Choferes\n(GPS, viajes activos)"]
        SIS["sis.html\nPanel Admin\n(dashboard, choferes)"]
        CFG["config.js\nClaves públicas\n(Supabase, Google Maps, Stripe PK)"]
    end

    subgraph BACKEND["⚙️ Backend Node.js — puerto 8787"]
        SRV["server.js\nExpress + CORS + Helmet"]
        RT_EMAIL["POST /api/enviar-reserva\nSMTP Hostinger"]
        RT_CHAT["POST /api/chat\nGroq LLaMA 70B"]
        RT_STRIPE["POST /api/stripe/pagar\nStripe SDK"]
        RT_ADMIN["POST /api/admin/login\nCredenciales seguras"]
        RT_HEALTH["GET /api/health"]
        ENV[".env\nGROQ_API_KEY\nSMTP_PASS\nSTRIPE_SECRET_KEY\nADMIN_PASS"]
    end

    subgraph PROXY["🔀 PHP Proxy"]
        PHP["public_html/api/index.php\nReenvía /api/* → localhost:8787"]
    end

    subgraph SERVICIOS["☁️ Servicios Externos"]
        SUP["Supabase\nBD reservas + Auth"]
        GMAPS["Google Maps API\nMapas + rutas + Places"]
        STRIPE_EXT["Stripe\nCobros con tarjeta"]
        GROQ["Groq API\nIA Iovox (LLaMA 70B)"]
        WA["WhatsApp\nConfirmaciones"]
        SMTP["smtp.hostinger.com\nCorreos de reserva"]
    end

    A --> SAS & SES & SIS
    SAS & SES & SIS --> CFG
    SAS --> PHP --> SRV
    SRV --> RT_EMAIL & RT_CHAT & RT_STRIPE & RT_ADMIN & RT_HEALTH
    RT_EMAIL --> SMTP
    RT_CHAT --> GROQ
    RT_STRIPE --> STRIPE_EXT
    SAS --> SUP
    SES --> SUP
    SIS --> SUP
    SAS --> GMAPS
    SES --> GMAPS
    SIS --> GMAPS
    SAS --> WA
    ENV -.-> SRV
```

---

## 2. Flujo de Reserva — Cliente

```mermaid
sequenceDiagram
    participant U as 👤 Cliente
    participant SAS as sas.html
    participant MAPS as Google Maps
    participant BACK as Backend
    participant SUP as Supabase
    participant WA as WhatsApp
    participant STR as Stripe

    U->>SAS: Acepta TyC
    U->>SAS: Llena nombre, origen, destino, fecha, hora
    SAS->>MAPS: Calcular distancia y tiempo
    MAPS-->>SAS: km, min, precio
    SAS->>SAS: Muestra precio total

    alt Pago por WhatsApp
        U->>SAS: Clic "Confirmar por WhatsApp"
        SAS->>SUP: Guarda reserva (estado: pendiente)
        SAS->>BACK: POST /api/enviar-reserva (correo)
        SAS->>WA: Abre WhatsApp con datos de reserva
    end

    alt Pago con Stripe
        U->>SAS: Clic "Pagar con Stripe"
        SAS->>SAS: Abre modal con Stripe Elements
        U->>SAS: Llena datos de tarjeta
        SAS->>STR: Stripe.js crea PaymentMethod (PK)
        SAS->>BACK: POST /api/stripe/pagar (paymentMethodId + monto)
        BACK->>STR: Crea PaymentIntent (SK secreto)
        STR-->>BACK: status: succeeded
        BACK-->>SAS: ok: true
        SAS->>SUP: Guarda reserva (estado: pagado)
        SAS->>SAS: Toast ✅ "Pago exitoso"
    end
```

---

## 3. Flujo Chofer — ses.html

```mermaid
sequenceDiagram
    participant C as 🚗 Chofer
    participant SES as ses.html
    participant SUP as Supabase
    participant MAPS as Google Maps

    C->>SES: Inicia sesión (Supabase Auth)
    SES->>SUP: Lee reservas asignadas
    SUP-->>SES: Lista de viajes pendientes
    C->>SES: Activa GPS
    SES->>MAPS: Muestra ruta al cliente
    loop Cada 10 segundos
        SES->>SUP: Actualiza ubicación GPS del chofer
    end
    C->>SES: Acepta viaje → estado: "en camino"
    SES->>SUP: UPDATE reservas SET estado='en camino'
    C->>SES: Finaliza viaje → estado: "completado"
    SES->>SUP: UPDATE reservas SET estado='completado'
```

---

## 4. Panel Admin — sis.html

```mermaid
sequenceDiagram
    participant A as 🧑‍💼 Admin
    participant SIS as sis.html
    participant BACK as Backend
    participant SUP as Supabase

    A->>SIS: Ingresa ID + contraseña
    SIS->>BACK: POST /api/admin/login
    BACK-->>SIS: ok: true (credenciales en .env)
    SIS->>SUP: Lee todas las reservas
    SIS->>SUP: Lee todos los choferes
    SUP-->>SIS: Dashboard completo
    A->>SIS: Asigna chofer a reserva
    SIS->>SUP: UPDATE reservas SET chofer_nombre=...
    A->>SIS: Ve mapa con choferes en tiempo real
    SIS->>MAPS: Renderiza marcadores GPS
```

---

## 5. IA Iovox — Asistente de Viajes

```mermaid
flowchart LR
    U[👤 Usuario] -->|"Escribe mensaje"| IOVOX[Iovox Chat\nen sas.html]
    IOVOX -->|"POST /api/chat"| BACK[Backend]
    BACK -->|"Bearer sk_groq"| GROQ[Groq API\nLLaMA 3.3 70B]
    GROQ -->|"Respuesta IA"| BACK
    BACK -->|"reply"| IOVOX
    IOVOX -->|"Muestra respuesta"| U
```

---

## 6. Tabla de Archivos

| Archivo | Rol | Tecnología |
|---|---|---|
| `luxrides.online/sas.html` | App clientes: reservas, mapa, pago | HTML + JS vanilla + Google Maps |
| `luxrides.online/ses.html` | App choferes: GPS, viajes | HTML + JS vanilla |
| `luxrides.online/sis.html` | Panel admin: dashboard | HTML + JS vanilla |
| `config.js` | Claves públicas (frontend) | JS IIFE |
| `backend/src/server.js` | Servidor HTTP | Node.js + Express |
| `backend/src/routes/stripe.routes.js` | Cobros con tarjeta | Stripe SDK |
| `backend/src/routes/chat.routes.js` | Proxy IA Iovox | Groq API |
| `backend/src/routes/email.routes.js` | Correos de confirmación | Nodemailer |
| `backend/src/routes/admin.routes.js` | Autenticación admin | Express |
| `backend/.env` | Secretos del servidor | dotenv |
| `public_html/api/index.php` | Proxy PHP → Node | PHP |

---

## 7. Base de Datos Supabase — Tabla `reservas`

```mermaid
erDiagram
    RESERVAS {
        text reserva_id PK
        text cliente
        text email_cliente
        uuid user_id FK
        text origen
        text destino
        text fecha
        text hora_recogida
        numeric total
        text estado
        text servicio
        text vehiculo
        text chofer_nombre
        timestamptz timestamp
    }
    AUTH_USERS ||--o{ RESERVAS : "tiene"
```

---

## 8. Despliegue en Hostinger

```
/home/u351284767/
├── domains/
│   └── luxrides.online/
│       └── public_html/         ← Sitio web (Apache)
│           ├── index.html        ← Redirige a sas.html
│           ├── sas.html
│           ├── ses.html
│           ├── sis.html
│           ├── config.js
│           ├── .htaccess
│           └── api/
│               └── index.php    ← Proxy → localhost:8787
│
└── luxrides-repo/
    └── luxrides/
        └── backend/             ← Node.js (pm2)
            ├── src/
            ├── .env             ← SECRETOS (nunca en git)
            └── package.json
```

### Proceso de actualización
```bash
# 1. Editar en Codespace
# 2. Subir archivos
rsync -avz -e "ssh -p 65002 -i ~/.ssh/hostinger_key" \
  luxrides/sas.html u351284767@89.117.9.141:~/domains/luxrides.online/public_html/

# 3. Reiniciar backend si hubo cambios en él
ssh -p 65002 -i ~/.ssh/hostinger_key u351284767@89.117.9.141 \
  'source ~/.nvm/nvm.sh && pm2 restart luxrides-backend --update-env'
```
