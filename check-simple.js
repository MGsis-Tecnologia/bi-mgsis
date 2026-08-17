import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function debug() {
  try {
    // Dados no schema public
    const count = await db.$queryRawUnsafe(`SELECT COUNT(*) as n FROM compra_items`);
    console.log('✓ compra_items (public):', count[0]?.n);
    
    // Procurar em tenant schema
    const tenantSchema = await db.$queryRawUnsafe(`
      SELECT schema_name FROM information_schema.schemata 
      WHERE schema_name LIKE 'tenant_%' OR schema_name LIKE 'empresa_%'
      LIMIT 1
    `);
    
    if (tenantSchema.length > 0) {
      const schema = tenantSchema[0].schema_name;
      console.log(`\n✓ Encontrado schema: ${schema}`);
      
      const count2 = await db.$queryRawUnsafe(`SELECT COUNT(*) as n FROM "${schema}".compra_items`);
      console.log(`  └─ compra_items: ${count2[0]?.n}`);
    }
    
  } finally {
    await db.$disconnect();
  }
}

debug();
