import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mainHtml = readFileSync(new URL('../../luxrides/index.html', import.meta.url), 'utf8');
const adminHtml = readFileSync(new URL('../../luxrides/tickedspromocionales/admin_tickets.html', import.meta.url), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return source.slice(from, to);
}

function createElements() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) {
        elements.set(id, {
          value: '', style: {}, dataset: {}, hidden: false, disabled: false,
          textContent: '', checked: false, listeners: {},
          addEventListener(name, callback) { this.listeners[name] = callback; },
          closest() { return this.label ||= { hidden: false }; },
          querySelector() { return this.button ||= { disabled: false }; },
          focus() {}
        });
      }
      return elements.get(id);
    },
    querySelectorAll() { return []; }
  };
}

function customerContext(account, saved = new Map()) {
  const document = createElements();
  const requests = [];
  const notices = [];
  const auth = {
    userId: account,
    async getSession() {
      return { data: { session: this.userId ? { user: { id: this.userId } } : null } };
    }
  };
  const context = vm.createContext({
    document, console: { error() {} },
    mostrarToast(message) { notices.push(message); },
    switchTab() {}, abrirAuth() { notices.push('login'); },
    window: {
      scrollTo() {},
      LuxCfg: { apiBaseUrl: () => 'http://test.invalid' },
      _luxAuth: {
        auth,
        async rpc(name, args) {
          requests.push({ name, args });
          if (name === 'activate_luxrides_ride_ticket') {
            if (args.p_code === 'INVALID') return { error: new Error('Ticket no vigente') };
            saved.set(auth.userId, { code: args.p_code });
          }
          return { data: saved.has(auth.userId) ? [saved.get(auth.userId)] : [] };
        }
      }
    },
    async fetch(url, options) {
      const body = JSON.parse(options.body);
      requests.push({ url, body });
      return {
        ok: true,
        async json() {
          return {
            ok: true, token: 'discounted-' + body.quoteToken,
            quote: { discountCode: body.code, originalAmountMx: 1000, discountAmountMx: 100, amountMx: 900 }
          };
        }
      };
    }
  });
  context.LuxCfg = context.window.LuxCfg;
  vm.runInContext('let resultado = null, pasajeros = 2, _rideBaseQuoteToken = "base", stripeQuoteToken = "base";', context);
  vm.runInContext(section(mainHtml, 'let _calculandoPrecio = false;', 'function bloquearCamposCotizacion'), context);
  vm.runInContext(section(mainHtml, 'async function sincronizarTicketViaje()', 'function cerrarCanjeTicket()'), context);
  return { context, document, requests, notices, auth, saved };
}

test('activation is saved per account and restored after a page reload', async () => {
  const first = customerContext('customer-a');
  await first.context.prepararCodigoDescuento(' viaje10 ');
  assert.equal(first.saved.get('customer-a').code, 'VIAJE10');
  assert.equal(vm.runInContext('_rideActiveTicketCode', first.context), 'VIAJE10');
  const reloaded = customerContext('customer-a', first.saved);
  await reloaded.context.restaurarTicketViaje();
  assert.equal(vm.runInContext('_rideActiveTicketCode', reloaded.context), 'VIAJE10');
  const other = customerContext('customer-b', first.saved);
  await other.context.restaurarTicketViaje();
  assert.equal(vm.runInContext('_rideActiveTicketCode', other.context), '');
  await first.context.prepararCodigoDescuento('VIAJE20');
  assert.equal(first.saved.get('customer-a').code, 'VIAJE20');
  assert.equal(first.saved.size, 1);
});

test('a session change during activation cannot apply another account ticket', async () => {
  const client = customerContext('customer-a');
  const originalRpc = client.context.window._luxAuth.rpc;
  client.context.window._luxAuth.rpc = async (...args) => {
    const response = await originalRpc(...args);
    client.auth.userId = 'customer-b';
    return response;
  };
  await client.context.prepararCodigoDescuento('VIAJE10');
  assert.equal(vm.runInContext('_rideActiveTicketCode', client.context), '');
  assert.ok(client.notices.some(message => message.includes('La cuenta cambió')));
});

test('each new journey automatically validates the saved ticket and updates its total', async () => {
  const client = customerContext('customer-a', new Map([['customer-a', { code: 'VIAJE10' }]]));
  for (const token of ['trip-one', 'trip-two']) {
    vm.runInContext(`resultado = { totalPrecio: 1000 }; _rideBaseQuoteToken = "${token}"; limpiarDescuentoViaje();`, client.context);
    await client.context.aplicarTicketActivoAlViaje();
    assert.equal(client.document.getElementById('r-precio').textContent, '$900.00');
    assert.equal(client.document.getElementById('ride-original-price').hidden, false);
    assert.equal(client.document.getElementById('ride-original-amount').textContent, '$1,000.00');
    assert.match(client.document.getElementById('ride-discount-status').textContent, /VIAJE10.*\$100\.00.*automáticamente/);
    assert.equal(vm.runInContext('stripeQuoteToken', client.context), 'discounted-' + token);
  }
  assert.deepEqual(client.requests.filter(r => r.body).map(r => r.body.quoteToken), ['trip-one', 'trip-two']);
  assert.match(mainHtml, /renderResults\(\);\s*await aplicarTicketActivoAlViaje\(\);/);
});

test('anonymous activation requests login and invalid tickets never show success', async () => {
  const anonymous = customerContext(null);
  await anonymous.context.prepararCodigoDescuento('VIAJE10');
  assert.equal(anonymous.requests.length, 0);
  assert.ok(anonymous.notices.includes('login'));
  anonymous.auth.userId = 'customer-a';
  await anonymous.context.restaurarTicketViaje();
  assert.equal(anonymous.saved.get('customer-a').code, 'VIAJE10');
  const invalid = customerContext('customer-a');
  await invalid.context.prepararCodigoDescuento('INVALID');
  assert.equal(invalid.saved.size, 0);
  assert.ok(invalid.notices.some(message => message.includes('No se pudo activar')));
  assert.ok(!invalid.notices.some(message => message.startsWith('Ticket activado')));
});

test('exhausted tickets stop applying and database errors are surfaced', async () => {
  const client = customerContext('customer-a');
  vm.runInContext('resultado = { totalPrecio: 1000 };', client.context);
  await client.context.aplicarTicketActivoAlViaje();
  assert.equal(client.requests.filter(r => r.body).length, 0);
  client.context.window._luxAuth.rpc = async () => ({ error: new Error('No disponible') });
  await client.context.aplicarTicketActivoAlViaje();
  assert.match(client.document.getElementById('ride-discount-status').textContent, /No disponible/);
});

test('a stale discount response cannot overwrite a newer quote', async () => {
  const client = customerContext('customer-a');
  let resolveFetch;
  client.context.fetch = () => new Promise(resolve => { resolveFetch = resolve; });
  vm.runInContext('_rideActiveTicketCode = "VIAJE10";', client.context);
  vm.runInContext('resultado = { totalPrecio: 1000 };', client.context);
  const applying = client.context.window.aplicarDescuentoViaje();
  assert.equal(client.context.ticketViajeValidando(), true);
  vm.runInContext('limpiarDescuentoViaje(); _rideBaseQuoteToken = "new-quote";', client.context);
  resolveFetch({
    ok: true,
    json: async () => ({
      ok: true, token: 'stale',
      quote: { discountCode: 'VIAJE10', originalAmountMx: 1000, discountAmountMx: 100, amountMx: 900 }
    })
  });
  await applying;
  assert.equal(vm.runInContext('_ridePromoApplied', client.context), null);
  assert.equal(client.document.getElementById('r-precio').textContent, '$1,000.00');
  assert.equal(client.document.getElementById('ride-original-price').hidden, true);
});

test('re-rendering and repeated application preserve the discounted total', async () => {
  const client = customerContext('customer-a', new Map([['customer-a', { code: 'VIAJE10' }]]));
  vm.runInContext('resultado = { totalPrecio: 1000 };', client.context);
  await client.context.aplicarTicketActivoAlViaje();
  client.context.mostrarPrecioViaje();
  await client.context.window.aplicarDescuentoViaje();
  assert.equal(client.requests.filter(r => r.body).length, 2);
  assert.equal(client.document.getElementById('r-precio').textContent, '$900.00');
  assert.equal(client.document.getElementById('ride-original-price').hidden, false);
  assert.match(section(mainHtml, 'function renderResults()', 'function calcHoraLlegada'), /mostrarPrecioViaje\(\)/);
});

test('failed discounts explain the original price and do not show a false saving', async () => {
  const client = customerContext('customer-a', new Map([['customer-a', { code: 'VIAJE10' }]]));
  vm.runInContext('resultado = { totalPrecio: 1000 };', client.context);
  client.context.fetch = async () => ({
    ok: false, json: async () => ({ ok: false, error: 'El ticket venció.' })
  });
  await client.context.aplicarTicketActivoAlViaje();
  assert.equal(client.document.getElementById('r-precio').textContent, '$1,000.00');
  assert.equal(client.document.getElementById('ride-original-price').hidden, true);
  assert.match(client.document.getElementById('ride-discount-status').textContent, /precio original.*VIAJE10.*venció/);
});

test('price results contain no manual discount input or apply button', () => {
  assert.doesNotMatch(mainHtml, /id="ride-discount-code"|onclick="aplicarDescuentoViaje\(\)"/);
  assert.ok(mainHtml.indexOf('id="ride-original-price"') < mainHtml.indexOf('id="r-precio"'));
});

test('the ride category routes to ride promotions while ally tickets keep their endpoint', async () => {
  const document = createElements();
  const calls = [];
  const context = vm.createContext({
    document, location: { origin: 'http://test.invalid' },
    window: { LuxCfg: { apiBaseUrl: () => 'http://test.invalid' } },
    sessionStorage: { getItem: () => '', setItem() {} },
    clearTimeout() {}, setTimeout() {},
    async fetch(url, options) {
      calls.push({ url, body: JSON.parse(options.body) });
      return { status: 201, ok: true, json: async () => ({ ok: true }) };
    }
  });
  context.LuxCfg = context.window.LuxCfg;
  const script = [...adminHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script, context);
  vm.runInContext('showToast = function() {}; cargarTickets = async function() {}; setTab = function() {};', context);
  const values = {
    'f-code': 'VIAJE10', 'f-venue': 'Mayahuel', 'f-desc': 'Descuento',
    'f-category': 'Comida', 'f-icon': 'ticket', 'f-discount-type': 'PERCENTAGE',
    'f-discount-value': '10', 'f-max-uses': '100', 'f-expiration': '2099-12-31T23:59'
  };
  for (const [id, value] of Object.entries(values)) document.getElementById(id).value = value;
  const form = document.getElementById('ticket-form');
  form.reset = () => { document.getElementById('f-category-kind').value = 'ALLY'; };
  const event = { preventDefault() {}, target: form };
  document.getElementById('f-category-kind').value = 'RIDE';
  context.actualizarCategoriaTicket();
  assert.equal(document.getElementById('f-venue').value, 'LuxRides');
  assert.equal(document.getElementById('f-category').required, false);
  assert.equal(document.getElementById('f-notify-customers').disabled, true);
  await form.listeners.submit(event);
  assert.match(calls[0].url, /\/ride-promos$/);
  assert.equal(calls[0].body.min_passengers, 1);
  assert.equal(calls[0].body.max_passengers, 7);
  assert.equal(calls[0].body.discount_value, 10);
  assert.ok(calls[0].body.expires_at);
  assert.equal(calls[0].body.venue_name, undefined);
  document.getElementById('f-venue').value = 'Mayahuel';
  await form.listeners.submit(event);
  assert.match(calls[1].url, /\/tickets$/);
  assert.equal(calls[1].body.category, 'Comida');
  assert.equal(calls[1].body.venue_name, 'Mayahuel');
});

test('modified inline scripts parse successfully', () => {
  const ticketsHtml = readFileSync(new URL('../../luxrides/tickedspromocionales/tickets_luxrides.html', import.meta.url), 'utf8');
  for (const html of [mainHtml, adminHtml, ticketsHtml]) {
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      if (/type=["']application\/ld\+json["']/.test(match[1])) continue;
      new vm.Script(match[2]);
    }
  }
});
