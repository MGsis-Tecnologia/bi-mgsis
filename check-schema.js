import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function debug() {
  try {
    // Listar todos os schemas
    const schemas = await db.$queryRawUnsafe(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema')`
    );
    
    console.log('📍 Schemas disponíveis:');
    schemas.forEach(s => console.log(`  - ${s.schema_name}`));
    
    // Contar registros em cada schema
    for (const schema of schemas) {
      const tables = await db.$queryRawUnsafe(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
        [schema.schema_name]
      );
      
      if (tables.length > 0) {
        console.log(`\n📊 Schema "${schema.schema_name}": ${tables.length} tabelas`);
        
        for (const tbl of tables.slice(0, 5)) {
          try {
            const count = await db.$queryRawUnsafe(
              `SELECT COUNT(*) as n FROM ${schema.schema_name}.${tbl.table_name}`
            );
            console.log(`   - ${tbl.table_name}: ${count[0]?.n || 0}`);
          } catch(e) {}
        }
      }
    }
    
  } finally {
    await db.$disconnect();
  }
}

debug();
