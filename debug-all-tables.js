import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function debug() {
  try {
    const tables = [
      'compra_items',
      'sale_items', 
      'inventory_items',
      'cliente',
      'fornecedor',
      'produto',
      'compra',
      'venda',
      'cambio'
    ];
    
    for (const table of tables) {
      try {
        const result = await db.$queryRawUnsafe(`SELECT COUNT(*) as n FROM ${table}`);
        console.log(`✓ ${table.padEnd(20)}: ${result[0]?.n || 0}`);
      } catch (e) {
        console.log(`✗ ${table.padEnd(20)}: NÃO EXISTE`);
      }
    }
    
  } finally {
    await db.$disconnect();
  }
}

debug();
