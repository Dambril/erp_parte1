/**
 * Carga obras de ejemplo en un tenant vacío (las del prototipo de Figma, con datos estructurados).
 *
 *   pnpm --filter @erp/api seed-demo -- [--tenant t-001]
 *
 * Usa el MONGODB_URI de .env.local. Si el tenant ya tiene obras no hace nada.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import dotenv from 'dotenv';
import { loadConfig } from '@erp/config';
import { hoyISO, type Certificacion, type Fase, type ObraEtapa } from '@erp/domain';
import { closeDB, connectDB, getDatabase } from '../config/database';
import { ensureObrasIndexes, obrasRepository, toDecimal, type MedicionDocument } from '../modules/obras/obras.repository';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

const DIA = 24 * 60 * 60 * 1000;
const fecha = (dias: number) => hoyISO(new Date(Date.now() + dias * DIA));
const fase = (nombre: string, inicio: number, fin: number, avance: number): Fase => ({ id: randomUUID(), nombre, inicio: fecha(inicio), fin: fecha(fin), avance });
const sistema = { id: 'seed', nombre: 'Carga inicial' };
const medicion = (dias: number, co2EvitadoKg: number, energiaAhorradaKwh: number, aguaCaptadaM3: number, fuente: string): MedicionDocument => ({
  id: randomUUID(), fecha: fecha(dias), co2EvitadoKg, energiaAhorradaKwh, aguaCaptadaM3, fuente, registradoPor: sistema, registradoEn: new Date(),
});

interface Demo {
  nombre: string; cliente: string; ubicacion: string; alcance: string; etapa: ObraEtapa;
  total: string; ejercido: string; certificacion: Certificacion | null;
  impacto: [number, number, number, string];
  materiales: [string, string, string, number][];
  fases: Fase[];
  mediciones: MedicionDocument[];
}

const obras: Demo[] = [
  {
    nombre: 'Residencial Alameda', cliente: 'Grupo Vértice', ubicacion: 'Puebla', etapa: 'ejecucion',
    alcance: 'Construcción de 48 unidades habitacionales en 4 torres de 6 niveles.',
    total: '42500000', ejercido: '24650000', certificacion: { tipo: 'EDGE', nivelObjetivo: 'EDGE Advanced', estado: 'en_preparacion' },
    impacto: [310000, 180000, 2400, 'Captación de agua pluvial y paneles solares en azoteas comunes.'],
    materiales: [['Concreto reciclado', 'Agregados del Valle', 'Puebla, Pue.', 18], ['Block térmico', 'Termoblock', 'Tlaxcala, Tlax.', 45], ['Acero estructural certificado', 'Aceros Ternium', 'San Nicolás, N.L.', 910]],
    fases: [fase('Cimentación', -270, -150, 100), fase('Estructura', -150, 20, 90), fase('Instalaciones', -40, 120, 35), fase('Acabados', 90, 300, 0)],
    mediciones: [medicion(-60, 42000, 21000, 310, 'Bitácora de residuos y medidor CFE'), medicion(-15, 18500, 9800, 140, 'Medidor bimestral')],
  },
  {
    nombre: 'Oficinas Raíz', cliente: 'Constructora Sur', ubicacion: 'CDMX', etapa: 'certificacion',
    alcance: 'Edificio corporativo de 12 niveles con certificación LEED en trámite.',
    total: '68000000', ejercido: '66100000', certificacion: { tipo: 'LEED', nivelObjetivo: 'Gold', estado: 'en_revision' },
    impacto: [520000, 410000, 5200, 'Fachada de doble piel, reúso de agua gris e iluminación LED en el 100% de las áreas.'],
    materiales: [['Vidrio de baja emisividad', 'Vitro', 'García, N.L.', 930], ['Concreto de bajo carbono', 'Holcim', 'Apasco, Edo. Méx.', 95], ['Aislamiento reciclado', 'Isover', 'Querétaro, Qro.', 220]],
    fases: [fase('Cimentación', -700, -560, 100), fase('Estructura', -560, -300, 100), fase('Fachada e instalaciones', -300, -60, 100), fase('Comisionamiento', -60, -5, 100)],
    mediciones: [medicion(-40, 96000, 88000, 820, 'Auditoría energética del comisionamiento')],
  },
  {
    nombre: 'Plaza Origen', cliente: 'Municipio Tlaxcala', ubicacion: 'Tlaxcala', etapa: 'ejecucion',
    alcance: 'Plaza pública cubierta con locales comerciales y área verde central.',
    total: '18200000', ejercido: '8900000', certificacion: { tipo: 'EDGE', nivelObjetivo: 'EDGE Certified', estado: 'en_preparacion' },
    impacto: [95000, 60000, 3100, 'Pavimento permeable y arbolado nativo, meta EDGE de 20% de ahorro energético.'],
    materiales: [['Adoquín permeable', 'Ecocreto', 'Puebla, Pue.', 40], ['Estructura de acero ligero', 'Acero Lámina', 'Tlaxcala, Tlax.', 8], ['Cubierta translúcida', 'Policarbonatos MX', 'CDMX', 120]],
    fases: [fase('Terracerías', -200, -120, 100), fase('Estructura', -120, 40, 68), fase('Cubierta y locales', 30, 180, 0)],
    mediciones: [medicion(-20, 7200, 3100, 410, 'Medición de escurrimiento pluvial')],
  },
  {
    nombre: 'Torre Cedro', cliente: 'Inversiones Bosque', ubicacion: 'Querétaro', etapa: 'ejecucion',
    alcance: 'Torre mixta de 18 niveles, uso residencial y comercial en planta baja.',
    total: '95000000', ejercido: '41300000', certificacion: null,
    impacto: [150000, 90000, 1500, 'Sistema de tratamiento de aguas grises pendiente de instalación.'],
    materiales: [['Concreto premezclado', 'Cemex', 'Querétaro, Qro.', 15], ['Muro cortina', 'Alumex', 'Guadalajara, Jal.', 350], ['Acero estructural', 'Gerdau Corsa', 'Tultitlán, Edo. Méx.', 200]],
    fases: [fase('Permisos', -300, -210, 100), fase('Cimentación', -210, -90, 100), fase('Estructura', -90, -10, 45), fase('Fachada', 60, 260, 0)],
    mediciones: [],
  },
  {
    nombre: 'Casa Manantial', cliente: 'Familia Ríos', ubicacion: 'Cuernavaca', etapa: 'completada',
    alcance: 'Vivienda unifamiliar de 320 m² con alberca y jardín xerófilo.',
    total: '6100000', ejercido: '5980000', certificacion: null,
    impacto: [18000, 9000, 650, 'Calentador solar, captación pluvial y jardín de bajo consumo de agua.'],
    materiales: [['Block de concreto', 'Blocks Morelos', 'Jiutepec, Mor.', 10], ['Madera certificada FSC', 'Maderas Durango', 'Durango, Dgo.', 930], ['Techo verde parcial', 'Azoteas Verdes MX', 'CDMX', 85]],
    fases: [fase('Obra negra', -420, -250, 100), fase('Obra gris', -250, -150, 100), fase('Acabados', -150, -60, 100)],
    mediciones: [medicion(-30, 6400, 3900, 280, 'Recibos CFE y medidor de cisterna')],
  },
  {
    nombre: 'Bodega Norte', cliente: 'Logística MTY', ubicacion: 'Monterrey', etapa: 'propuesta',
    alcance: 'Nave industrial de 8,500 m² con andenes de carga y oficinas administrativas.',
    total: '31400000', ejercido: '0', certificacion: { tipo: 'LEED', nivelObjetivo: 'Silver', estado: 'en_preparacion' },
    impacto: [210000, 150000, 4200, 'Iluminación cenital natural y sistema de recuperación de agua pluvial.'],
    materiales: [['Estructura metálica prefabricada', 'Grupo Collado', 'Monterrey, N.L.', 12], ['Losa de concreto reforzado', 'Cemex', 'Monterrey, N.L.', 10], ['Panel aislante', 'Ternium Multytecho', 'San Nicolás, N.L.', 15]],
    fases: [fase('Preliminares', 20, 60, 0), fase('Estructura', 60, 200, 0), fase('Cerramientos y andenes', 200, 330, 0)],
    mediciones: [],
  },
];

async function run(): Promise<void> {
  const config = loadConfig();
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const { values } = parseArgs({ args, options: { tenant: { type: 'string', default: config.defaultTenantId } } });
  const tenantId = values.tenant as string;

  await connectDB(config.mongodbUri, config.mongodbDbName);
  const db = getDatabase();
  await ensureObrasIndexes(db);
  const repository = obrasRepository(db);

  if ((await repository.findMany(tenantId, {}, 1)).length > 0) {
    console.log(`El tenant "${tenantId}" ya tiene obras; no se cargó nada.`);
    return;
  }
  for (const demo of obras) {
    await repository.insert({
      nombre: demo.nombre, cliente: demo.cliente, ubicacion: demo.ubicacion, alcance: demo.alcance, etapa: demo.etapa,
      presupuesto: { moneda: 'MXN', total: toDecimal(demo.total), ejercido: toDecimal(demo.ejercido) },
      certificacion: demo.certificacion,
      impactoEstimado: { co2EvitadoKg: demo.impacto[0], energiaAhorradaKwh: demo.impacto[1], aguaCaptadaM3: demo.impacto[2], descripcion: demo.impacto[3] },
      materiales: demo.materiales.map(([nombre, proveedor, origen, distanciaKm]) => ({ nombre, proveedor, origen, distanciaKm, certificacion: null })),
      fases: demo.fases,
      mediciones: demo.mediciones,
      decisiones: [],
    }, tenantId);
  }
  console.log(`Se cargaron ${obras.length} obras de ejemplo en el tenant "${tenantId}".`);
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDB());
