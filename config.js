(function(){
  /* ─── Claves PÚBLICAS del frontend ───────────────────────────────────────
     Supabase anon-key: es la clave pública de Supabase (diseñada para frontend).
     Google Maps, Stripe PK, VAPID: también son públicas por diseño.
     Secretos (GROQ, SMTP, ADMIN) viven SOLO en backend/.env
  ─────────────────────────────────────────────────────────────────────── */
  var CFG = {
    SUPABASE_URL:           'https://symcauagugifzsjzwypx.supabase.co',
    SUPABASE_ANON_KEY:      'sb_publishable_pKYjfH4R6E_nFDtvGs2isQ_SxIzhggG',
    GOOGLE_MAPS_API_KEY:    'AIzaSyDr38n4Xz6bpjTzZ9aShFJvb9FvUtOggkU',
    TICKETMASTER_KEY:       '4wWDZ5aK885DEPKRT98wLSZuIKOWZMk9',
    HERE_API_KEY:           'LIn8K-l1u4qiSUI7VGcRDJ__79o=',
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51TSJFbRsMQje2ZkMG6tpwzSwf8HsmPkQmP45tH2wXb6CVEsa3sSJMPrFyDyPu4vVQH4OBOVDeMYYqitKLy3DJhfU00Fqd0xLIC',
    WHATSAPP_CENTRAL:       '+525527729551',
    VAPID_PUBLIC_KEY:       'BPirkqzos1LTThbMmK1qCGH7M7qR2h1pilBOXMroC7z9Zt2lSgOfKgFhM-7IDur998kXFmpG6pJR6pgRBOjEqN8',
    HOSTINGER_ORIGIN:       'https://luxrides.online'
  };

  function get(k) {
    return CFG[k];
  }

  function apiBaseUrl() {
    return (CFG.HOSTINGER_ORIGIN || '').replace(/\/+$/, '');
  }

  function loadGoogleMaps(callbackName) {
    var cb = callbackName || 'initLuxGoogleMaps';
    if (window.google && window.google.maps) {
      if (typeof window[cb] === 'function') window[cb]();
      return;
    }
    if (document.querySelector('script[data-lux-google-maps="1"]')) return;

    var key = CFG.GOOGLE_MAPS_API_KEY;
    if (!key) {
      console.error('GOOGLE_MAPS_API_KEY no configurada');
      return;
    }

    var s = document.createElement('script');
    s.async = true;
    s.defer = true;
    s.setAttribute('data-lux-google-maps', '1');
    s.src = 'https://maps.googleapis.com/maps/api/js?key=' + encodeURIComponent(key) + '&libraries=places,marker&callback=' + encodeURIComponent(cb);
    s.onerror = function(){
      console.error('No se pudo cargar Google Maps');
    };
    document.head.appendChild(s);
  }

  function esUbicacionGPSValida(lat, lng, opts) {
    var la = Number(lat);
    var ln = Number(lng);
    if (!isFinite(la) || !isFinite(ln)) return false;

    // Coordenadas fuera de rango global
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;

    // Coordenadas nulas/placeholder
    if (Math.abs(la) < 0.000001 && Math.abs(ln) < 0.000001) return false;

    // Caja de validacion para Mexico centro (evita puntos basura)
    var inMxCentro = la >= 14.0 && la <= 33.5 && ln >= -119.0 && ln <= -86.0;
    if (!inMxCentro) return false;

    if (opts && typeof opts.accuracy === 'number' && opts.accuracy > 2000) return false;
    return true;
  }

  function choferActivoEnMapa(estado) {
    var s = String(estado || '').toLowerCase().trim();
    return s === 'en linea' || s === 'en línea' || s === 'libre' || s === 'asignado' || s === 'ocupado';
  }

  window.LuxCfg = {
    get: get,
    apiBaseUrl: apiBaseUrl,
    supabaseUrl: function(){ return CFG.SUPABASE_URL; },
    supabaseAnonKey: function(){ return CFG.SUPABASE_ANON_KEY; },
    googleMapsKey: function(){ return CFG.GOOGLE_MAPS_API_KEY; },
    groqKey: function(){ return ''; },          // movida al backend
    ticketmasterKey: function(){ return CFG.TICKETMASTER_KEY; },
    hereKey: function(){ return CFG.HERE_API_KEY; },
    stripePk: function(){ return CFG.STRIPE_PUBLISHABLE_KEY; },
    whatsapp: function(){ return CFG.WHATSAPP_CENTRAL; },
    vapidPublic: function(){ return CFG.VAPID_PUBLIC_KEY; },
    loadGoogleMaps: loadGoogleMaps,
    esUbicacionGPSValida: esUbicacionGPSValida,
    choferActivoEnMapa: choferActivoEnMapa
  };
})();
