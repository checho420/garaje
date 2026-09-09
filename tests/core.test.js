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
    const BACKUP_FORMAT='garaje-backup';
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

test('conserva respaldos versionados con muchos mantenimientos', () => {
  const context = dataFunctions();
  const result = vm.runInContext(`
    (() => {
      const events=Array.from({length:250},(_,i)=>({
        id:'maintenance_'+i,type:'maintenance',date:'2026-01-01',title:'Servicio '+i,
        cost:i*1000,mileage:10000+i,provider:'Taller',notes:'Detalle '+i
      }));
      const backup={format:'garaje-backup',version:2,exportedAt:'2026-09-08T00:00:00.000Z',
        data:{vehicles:[{id:'veh_1',name:'Mi vehículo',events}],settings:{}}};
      const normalized=normalizeData(backup);
      return [normalized.data.vehicles[0].events.length,dataCounts(normalized.data).maintenance];
    })()
  `, context);

  assert.deepEqual(Array.from(result), [250, 250]);
});

test('fusiona registros sin perder datos y separa colisiones de IDs', () => {
  const context = dataFunctions();
  const result = vm.runInContext(`
    (() => {
      const target={vehicles:[{id:'veh_1',name:'Mi vehículo',plate:'ABC123',brand:'',model:'',events:[
        {id:'evt_1',type:'maintenance',date:'2026-01-01',title:'Cambio de aceite',cost:100}
      ],fixed:[]}],settings:{}};
      const incoming={vehicles:[{id:'veh_1',name:'Mi vehículo',plate:'ABC123',brand:'',model:'',events:[
        {id:'evt_1',type:'maintenance',date:'2026-01-01',title:'Cambio de aceite',cost:100},
        {id:'evt_2',type:'maintenance',date:'2026-02-01',title:'Frenos',cost:200},
        {id:'evt_1',type:'maintenance',date:'2026-03-01',title:'Batería',cost:300}
      ],fixed:[]}],settings:{}};
      const report=mergeImportedData(target,incoming);
      return [target.vehicles[0].events.length,report.events,report.duplicates,report.collisions];
    })()
  `, context);

  assert.deepEqual(Array.from(result), [3, 2, 1, 1]);
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
        byWeekday:{1:['5','8'],2:['1','4'],3:['0','2'],4:['3','6'],5:['7','9']}
      }
    };
    function normalizePlate(value){ return String(value||'').replace(/\s+/g,'').toUpperCase(); }
    `
  );
}

function calculationFunctions() {
  return loadFunctions(
    'function totalsOf(v)',
    'function fixedMonthly',
    ``
  );
}

test('recalcula los totales cuando un registro cambia de categoría', () => {
  const context = calculationFunctions();
  const result = vm.runInContext(`
    (() => {
      const v={events:[
        {type:'maintenance',cost:2000000},
        {type:'accessory',cost:500000},
        {type:'repair',cost:300000}
      ]};
      const before=totalsOf(v);
      v.events[0].type='accessory';
      const after=totalsOf(v);
      return [before.maintenance,before.accessory,before.all,after.maintenance,after.accessory,after.all];
    })()
  `, context);

  assert.deepEqual(Array.from(result), [2000000, 500000, 2800000, 0, 2500000, 2800000]);
});

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
      picoPlacaStatus({plate:'ABC124',vehicleType:'car'},new Date(2026,8,8,10,0)).cls,
      picoPlacaStatus({plate:'ABC148',vehicleType:'moto'},new Date(2026,8,8,10,0)).cls,
      picoPlacaStatus({plate:'ABC348',vehicleType:'car'},new Date(2026,8,8,10,0)).cls,
      picoPlacaStatus({plate:'ABC568',vehicleType:'car'},new Date(2026,8,7,10,0)).cls,
      picoPlacaStatus({plate:'ABC023',vehicleType:'moto'},new Date(2026,8,9,10,0)).cls
    ]
  `, context);

  assert.deepEqual(Array.from(result), ['bad', 'bad', 'ok', 'bad', 'bad']);
});
