(function(){
  var CFG = {
    SUPABASE_URL:           'https://symcauagugifzsjzwypx.supabase.co',
    SUPABASE_ANON_KEY:      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bWNhdWFndWdpZnpzanp3eXB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NTAwNTksImV4cCI6MjA5NTMyNjA1OX0.uJ1hWbTyYilgyk4T8L-nHcSDOD6ILBIjDeaLzximKoY',
    GOOGLE_MAPS_API_KEY:    'AIzaSyDr38n4Xz6bpjTzZ9aShFJvb9FvUtOggkU',
    STADIA_MAPS_API_KEY:    '1caf21f6-99f2-43e7-83ac-bf51ce668deb',
    TICKETMASTER_KEY:       '4wWDZ5aK885DEPKRT98wLSZuIKOWZMk9',
    HERE_API_KEY:           'LIn8K-l1u4qiSUI7VGcRDJ__79o=',
    STRIPE_PUBLISHABLE_KEY: 'pk_live_51TSJFbRsMQje2ZkMG6tpwzSwf8HsmPkQmP45tH2wXb6CVEsa3sSJMPrFyDyPu4vVQH4OBOVDeMYYqitKLy3DJhfU00Fqd0xLIC',
    WHATSAPP_CENTRAL:       '+525527729551',
    VAPID_PUBLIC_KEY:       'BBsJe9xah2PJMkXNAW5NyDrafEZOroWdwrm1us9UWs776HBOdunUAejz4Ouz52CTz3_t6pTedvrWKK-brczYw1o',
    HOSTINGER_ORIGIN:       'https://luxrides.online',
    BACKEND_URL:            'https://luxrides-online.onrender.com'
  };

  function get(k) { return CFG[k]; }

  function backendOrigin() {
    var host = (window.location.hostname || '').toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://localhost:8787';
    }
    if (window.location.hostname.endsWith('.onrender.com')) {
      return window.location.origin;
    }
    return CFG.BACKEND_URL;
  }

  function backendUrl() {
    return backendOrigin();
  }

  function apiBaseUrl() {
    return backendOrigin();
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
    stadiaMapsKey: function(){ return CFG.STADIA_MAPS_API_KEY; },
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
