import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function debug() {
  try {
    console.log('\n=== DEBUG BANCO ===\n');
    
    // 1. Contar registros
    const total = await db.$queryRawUnsafe('SELECT COUNT(*) as n FROM compra_items');
    console.log('✓ Total de compra_items:', total[0]?.n);
    
    // 2. Verificar campos
    const sample = await db.$queryRawUnsafe(
      `SELECT 
        fornecedor_id, 
        fornecedor_nome, 
        produto_id,
        produto_valor_total,
        empresa_id,
        moeda_id,
        pedido_data
      FROM compra_items LIMIT 1`
    );
    console.log('\n✓ Sample de coluna:', sample[0] ? Object.keys(sample[0]) : 'SEM DADOS');
    
    // 3. Contar por fornecedor
    const fornecedores = await db.$queryRawUnsafe(
      `SELECT COUNT(DISTINCT fornecedor_id) as n FROM compra_items WHERE fornecedor_id IS NOT NULL`
    );
    console.log('✓ Fornecedores únicos:', fornecedores[0]?.n);
    
    // 4. Listar top 3 fornecedores
    const top = await db.$queryRawUnsafe(
      `SELECT 
        fornecedor_id,
        fornecedor_nome, 
        COUNT(*) as pedidos,
        SUM(produto_valor_total) as total
      FROM compra_items
      WHERE fornecedor_nome <> '' AND fornecedor_id IS NOT NULL
      GROUP BY fornecedor_id, fornecedor_nome
      ORDER BY total DESC
      LIMIT 3`
    );
    console.log('\n✓ Top 3 fornecedores:');
    top.forEach(f => {
      console.log(`  - ${f.fornecedor_nome} (${f.fornecedor_id}): ${f.pedidos} pedidos, ${f.total}`);
    });
    
    // 5. Verificar empresa_id
    const empresas = await db.$queryRawUnsafe(
      `SELECT DISTINCT empresa_id FROM compra_items LIMIT 3`
    );
    console.log('\n✓ Empresas na tabela:', empresas.map(e => e.empresa_id).join(', '));
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await db.$disconnect();
  }
}

debug();
