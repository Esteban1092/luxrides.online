(function(){
  var CFG = {
    SUPABASE_URL:           'https://symcauagugifzsjzwypx.supabase.co',
    SUPABASE_ANON_KEY:      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bWNhdWFndWdpZnpzanp3eXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTAwNTksImV4cCI6MjA5NTMyNjA1OX0.uJ1hWbTyYilgyk4T8L-nHcSDOD6ILBIjDeaLzximKoY',
    GOOGLE_MAPS_API_KEY:    'AIzaSyDr38n4Xz6bpjTzZ9aShFJvb9FvUtOggkU',
    TICKETMASTER_KEY:       '4wWDZ5aK885DEPKRT98wLSZuIKOWZMk9',
    HERE_API_KEY:           'LIn8K-l1u4qiSUI7VGcRDJ__79o=',
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51TSJFbRsMQje2ZkMG6tpwzSwf8HsmPkQmP45tH2wXb6CVEsa3sSJMPrFyDyPu4vVQH4OBOVDeMYYqitKLy3DJhfU00Fqd0xLIC',
    WHATSAPP_CENTRAL:       '+525527729551',
    VAPID_PUBLIC_KEY:       'BLX6MhsrRUOf_m5So0bt1RtQeyQtsvq_UQpokto6XL8frM66o-kIW-AVQbcnT1PWOOIo_-yU7pOok6L2BmPpsnY',
    HOSTINGER_ORIGIN:       '',
    BACKEND_URL:            'https://congenial-space-goldfish-g4944pp4vj6hv5wr-8787.app.github.dev'
  };

  function get(k) {
    return CFG[k];
  }

  function sameOrigin() {
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      return String(window.location.origin).replace(/\/+$/, '');
    }
    return '';
  }

  function isVercelHost() {
    if (typeof window === 'undefined' || !window.location) return false;
    var host = String(window.location.hostname || '').toLowerCase();
    return host.endsWith('.vercel.app') || host.endsWith('.vercel.dev');
  }

  function backendUrl() {
    var configured = (CFG.BACKEND_URL || '').replace(/\/+$/, '');
    if (configured) return configured;
    if (isVercelHost()) return 'https://luxrides.online';
    var origin = sameOrigin();
    if (origin) return origin;
    if (typeof window !== 'undefined' && window.location) {
      var host = (window.location.hostname || '').toLowerCase();
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
        return 'http://localhost:8787';
      }
    }
    return 'https://luxrides.online';
  }

  function apiBaseUrl() {
    var configured = (CFG.HOSTINGER_ORIGIN || '').replace(/\/+$/, '');
    if (configured) return configured;
    if ((CFG.BACKEND_URL || '').trim()) return backendUrl();
    if (isVercelHost()) return 'https://luxrides.online';
    return backendUrl();
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
    if (la < -90 || la > 90 || ln < -180 || ln > 180) return false;
    if (Math.abs(la) < 0.000001 && Math.abs(ln) < 0.000001) return false;

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
    backendUrl: backendUrl,
    supabaseUrl: function(){ return CFG.SUPABASE_URL; },
    supabaseAnonKey: function(){ return CFG.SUPABASE_ANON_KEY; },
    googleMapsKey: function(){ return CFG.GOOGLE_MAPS_API_KEY; },
    groqKey: function(){ return ''; },
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
