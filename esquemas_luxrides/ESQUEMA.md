
╔══════════════════════════════════════════════════════════════════════════════╗
║                        LUXRIDES — CÓMO FUNCIONA                            ║
╚══════════════════════════════════════════════════════════════════════════════╝


┌─────────────────────────────────────────────────────────────────────────────┐
│                           👤  USUARIO / CLIENTE                             │
│                         Abre luxrides.online                                │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
          ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
          │  sas.html   │  │  ses.html   │  │  sis.html   │
          │  CLIENTES   │  │  CHOFERES   │  │    ADMIN    │
          │  reservas   │  │  GPS live   │  │  dashboard  │
          │  pagos      │  │  viajes     │  │  choferes   │
          │  mapa       │  │  mapa       │  │  mapa       │
          └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
                 │                │                 │
                 └────────────────┼─────────────────┘
                                  │
                       lee config.js (claves públicas)
                                  │
          ┌───────────────────────▼──────────────────────────┐
          │                   config.js                       │
          │  SUPABASE_URL · GOOGLE_MAPS_KEY · STRIPE_PK       │
          │  WHATSAPP · VAPID_KEY · HOSTINGER_ORIGIN          │
          └───────────────────────────────────────────────────┘


══════════════════════════  FLUJO DE RESERVA  ══════════════════════════════


   👤 Cliente llena origen, destino, fecha, hora
                    │
                    ▼
   ┌──────────────────────────────┐
   │       Google Maps API        │◄─── calcula distancia + tiempo
   └──────────────┬───────────────┘
                  │ devuelve km, min, precio
                  ▼
   ┌──────────────────────────────┐
   │     sas.html muestra total   │
   └──────┬───────────────┬───────┘
          │               │
          ▼               ▼
  ╔═══════════╗    ╔═══════════════╗
  ║ WhatsApp  ║    ║    Stripe     ║
  ╚═════╤═════╝    ╚══════╤════════╝
        │                 │
        │   envía mensaje │   1) Stripe.js tokeniza tarjeta (PK)
        │   con datos de  │   2) sas.html → POST /api/stripe/pagar
        │   la reserva    │   3) Backend cobra con SK secreto
        │                 │   4) Stripe confirma pago
        ▼                 ▼
  ┌───────────────────────────────┐
  │         Supabase              │
  │  guarda reserva en la BD      │
  │  estado: pendiente / pagado   │
  └───────────────────────────────┘
        │
        ▼
  POST /api/enviar-reserva
  Backend envía correo de confirmación
  via smtp.hostinger.com


══════════════════════════  BACKEND (Node.js)  ══════════════════════════════


   luxrides.online/api/*
           │
           ▼
   ┌───────────────────┐
   │  api/index.php    │  ← Proxy PHP (Hostinger no permite mod_proxy)
   │  reenvía a        │
   │  localhost:8787   │
   └────────┬──────────┘
            │
            ▼
   ┌────────────────────────────────────────────────────┐
   │              BACKEND  Node.js + Express             │
   │                    puerto 8787                      │
   │  (manejado por PM2 — se reinicia automáticamente)  │
   ├────────────────────────────────────────────────────┤
   │                                                    │
   │  GET  /api/health          → estado del servidor   │
   │  POST /api/enviar-reserva  → correo SMTP           │
   │  POST /api/chat            → IA Iovox (Groq)       │
   │  POST /api/stripe/pagar    → cobro real tarjeta    │
   │  POST /api/admin/login     → verifica admin        │
   │                                                    │
   └──────────────┬─────────────────────────────────────┘
                  │  lee variables secretas de
                  ▼
   ┌────────────────────────────────────────────────────┐
   │                    .env  (SOLO servidor)            │
   │                                                    │
   │  GROQ_API_KEY=gsk_...      → IA Iovox              │
   │  STRIPE_SECRET_KEY=sk_...  → cobros reales         │
   │  SMTP_PASS=...             → correos               │
   │  ADMIN_ID / ADMIN_PASS     → login panel           │
   └────────────────────────────────────────────────────┘


══════════════════════════  SERVICIOS EXTERNOS  ═════════════════════════════


  Backend  ──────────────────► Groq API (LLaMA 70B)   → respuestas IA Iovox
  Backend  ──────────────────► Stripe API              → cobros con tarjeta
  Backend  ──────────────────► smtp.hostinger.com      → correos reserva

  Frontend ──────────────────► Google Maps             → mapas + rutas
  Frontend ──────────────────► Supabase                → BD + Auth
  Frontend ──────────────────► WhatsApp API            → confirmaciones


══════════════════════════  ROLES DE USUARIO  ═══════════════════════════════


  ┌──────────┐     ┌──────────────────────────────────────────────┐
  │ CLIENTE  │────►│ sas.html: reservar, pagar, ver viajes, Iovox │
  └──────────┘     └──────────────────────────────────────────────┘

  ┌──────────┐     ┌──────────────────────────────────────────────┐
  │ CHOFER   │────►│ ses.html: ver viajes asignados, activar GPS  │
  └──────────┘     └──────────────────────────────────────────────┘

  ┌──────────┐     ┌──────────────────────────────────────────────┐
  │  ADMIN   │────►│ sis.html: ver todas las reservas, asignar    │
  └──────────┘     │ choferes, ver mapa en tiempo real            │
                   └──────────────────────────────────────────────┘


══════════════════════════  SERVIDOR HOSTINGER  ═════════════════════════════


  /home/u351284767/
  │
  ├── domains/luxrides.online/public_html/   ← sitio web (Apache)
  │   ├── index.html      redirige a sas.html
  │   ├── sas.html        app clientes
  │   ├── ses.html        app choferes
  │   ├── sis.html        panel admin
  │   ├── config.js       claves públicas
  │   ├── .htaccess       reglas Apache
  │   └── api/
  │       └── index.php   proxy → localhost:8787
  │
  └── luxrides-repo/luxrides/backend/        ← Node.js (PM2)
      ├── src/
      │   ├── server.js
      │   ├── config/env.js
      │   ├── routes/
      │   │   ├── stripe.routes.js
      │   │   ├── email.routes.js
      │   │   ├── chat.routes.js
      │   │   └── admin.routes.js
      │   └── services/
      │       ├── email.service.js
      │       └── groq.service.js
      ├── .env            ← SECRETOS (nunca en git)
      └── package.json


══════════════════════════  CÓMO ACTUALIZAR  ════════════════════════════════


  1. Editar código aquí en Codespace
       │
       ▼
  2. Subir archivos al servidor con rsync + SSH
       │
       ▼
  3. Si hubo cambios en el backend → reiniciar con PM2
       │
       ▼
  4. Verificar en https://luxrides.online/api/health


═════════════════════════════════════════════════════════════════════════════
