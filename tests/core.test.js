const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

function loadFunctions(start, end, setup) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert.notEqual(from, -1, `No se encontró ${start}`);
  assert.notEqual(to, -1, `No se encontró ${end}`);
  const context = { console, Date, Math, Set, Object, Number, String, Array, JSON };
  vm.createContext(context);
  vm.runInContext(`${setup}\n${source.slice(from, to)}`, context);
  return context;
}

function dataFunctions() {
  return loadFunctions(
    'function defaultSettings()',
    'function load()',
    `
    const CATS={maintenance:{},fuel:{},recurring:{},accessory:{},document:{},repair:{}};
    const OWN_STATUS={owned:{},forsale:{},sold:{}};
    const CURRENCIES={COP:{}};
    const FUEL_UNITS=['Galón','Litro'];
    let sequence=0;
    const uid=()=>String(++sequence);
    function validDate(value){ return typeof value==='string' && /^\\d{4}-\\d{2}-\\d{2}$/.test(value); }
    `
  );
}

test('normaliza placas, IDs y descarta eventos inválidos', () => {
  const context = dataFunctions();
  const result = vm.runInContext(`
    normalizeData({
      vehicles: [{
        id: 'id inválido',
        name: '  Mi vehículo  ',
        plate: 'abc 123',
        events: [
          { id: 'evt 1', type: 'document', date: '2026-01-01', docType: 'SOAT', expiry: '2027-01-01' },
          { type: 'unknown', date: '2026-01-01' }
        ]
      }]
    })
  `, context);

  assert.equal(result.data.vehicles[0].name, 'Mi vehículo');
  assert.equal(result.data.vehicles[0].plate, 'ABC123');
  assert.equal(result.data.vehicles[0].events.length, 1);
  assert.ok(result.issues.length > 0);
});

test('normaliza ajustes con valores seguros', () => {
  const context = dataFunctions();
  const result = vm.runInContext(`
    normalizeData({
      vehicles: [],
      settings: { theme: 'invalid', currency: 'BAD', language: 'fr', units: { distance: 'mi', fuel: 'Litro' } }
    })
  `, context);

  assert.equal(result.data.settings.theme, 'light');
  assert.equal(result.data.settings.currency, 'COP');
  assert.equal(result.data.settings.language, 'es');
  assert.equal(result.data.settings.units.distance, 'mi');
  assert.equal(result.data.settings.units.fuel, 'Litro');
});

function documentFunctions() {
  return loadFunctions(
    'function validDate(iso)',
    '/* ---------- cálculos por vehículo',
    `
    const PICO_PLACA_RULES={
      medellin:{
        label:'Medellín',
        period:'Segundo semestre de 2026',
        hours:'5:00 a. m. – 8:00 p. m.',
        byWeekday:{1:['5','6','7','8'],2:['1','2','3','4'],3:['0','1','2'],4:['3','4','5','6'],5:['7','8','9']}
      }
    };
    function normalizePlate(value){ return String(value||'').replace(/\s+/g,'').toUpperCase(); }
    `
  );
}

test('clasifica documentos vencidos, próximos y vigentes', () => {
  const context = documentFunctions();
  const result = vm.runInContext(`
    [docStatus('2020-01-01').cls, docStatus('2026-09-20').cls, docStatus('2099-01-01').cls]
  `, context);

  assert.deepEqual(Array.from(result), ['bad', 'soon', 'ok']);
});

test('el progreso del documento queda dentro del círculo válido', () => {
  const context = documentFunctions();
  const result = vm.runInContext(`
    [docProgress({date:'2026-01-01',expiry:'2027-01-01'}), docProgress({expiry:'2027-01-01'})]
  `, context);

  assert.ok(result.every(value => value >= 0 && value <= 1));
});

test('aplica la tabla 2026 de Medellín usando el número correcto para carros y motos', () => {
  const context = documentFunctions();
  const result = vm.runInContext(`
    [
      picoPlacaStatus({plate:'ABC123',vehicleType:'car'},new Date(2026,8,8,10,0)).cls,
      picoPlacaStatus({plate:'ABC348',vehicleType:'moto'},new Date(2026,8,8,10,0)).cls,
      picoPlacaStatus({plate:'ABC348',vehicleType:'car'},new Date(2026,8,8,10,0)).cls,
      picoPlacaStatus({plate:'ABC567',vehicleType:'car'},new Date(2026,8,7,10,0)).cls,
      picoPlacaStatus({plate:'ABC123',vehicleType:'moto'},new Date(2026,8,9,10,0)).cls
    ]
  `, context);

  assert.deepEqual(Array.from(result), ['bad', 'bad', 'ok', 'bad', 'bad']);
});
